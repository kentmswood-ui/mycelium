import type { SkillRepository } from '../skills/repository.js'
import type { Matcher } from './matcher.js'
import type { SynapseLedger } from '../ledger/synapse.js'
import type {
  ConsultRequestT,
  ConsultResponseT,
  FeedbackRequestT,
  RegisterSkillRequestT,
} from '../mcep/schema.js'
import { isMetaQuery } from './query.js'
import { shouldWake } from './trigger.js'
import { readPrefs, DEFAULT_PREFS, CJK_LANGUAGES, type Prefs } from './prefs.js'
import { recallFromMemory } from './recall.js'
import { landSynthesized } from './landing.js'
import { tokenize } from '../skills/skill.js'
import { aliasedSkills } from './aliases.js'
import type { SettingsStore } from './settings.js'
import type { RecurrenceLedger } from './recurrence.js'
import type { MisfitStore } from './misfits.js'

const TRIVIAL = /\b(typo|rename|format|lint|whitespace|comment)\b/i
const MIN_WORDS = 3

export interface BrainDeps {
  /** async research hook (cascade steps 2/3): online + skill-market lookup → install proposals */
  onMiss?: (task: string, tool: string) => void
  /** runtime prefs source; falls back to conservative defaults when absent */
  settings?: SettingsStore
  /** recurrence/quota ledger; when absent, build is never escalated (legacy behavior) */
  recurrence?: RecurrenceLedger
  /** negative-learning store; when present, known-misfit skills are suppressed for a task-shape */
  misfits?: MisfitStore
  /** directory of the user's memory notes for step-1 recall; when absent, recall is skipped */
  memoryDir?: string
  /** canonical skills dir; required for register_skill to land interactively-built skills */
  skillsDir?: string
}

export interface RegisterResult {
  ok: boolean
  skill?: string
  reason?: string
}

export class Brain {
  private deps: BrainDeps
  constructor(
    private repo: SkillRepository,
    private matcher: Matcher,
    public ledger: SynapseLedger,
    deps: BrainDeps = {},
  ) {
    this.deps = deps
  }

  private prefs(): Prefs {
    return this.deps.settings ? readPrefs(this.deps.settings) : DEFAULT_PREFS
  }

  consult(req: ConsultRequestT): ConsultResponseT {
    const res = this.decide(req)
    // Log every real consult with its verdict + provenance for the cockpit usage panel. Skip
    // subprocess passes (recursion-guard noise) so spawned children don't flood the stats.
    if (!process.env.MYCELIUM_SUBPROCESS) {
      this.ledger.recordConsult({
        tool: req.tool,
        ...(req.model ? { model: req.model } : {}),
        verdict: res.verdict,
        ...(res.verdict === 'reuse' ? { skill: res.skill } : {}),
      })
    }
    return res
  }

  private decide(req: ConsultRequestT): ConsultResponseT {
    // Recursion guard: the build/research path may spawn an LLM CLI (claude/codex) that ALSO
    // has mycelium wired up. Without this, that child's own consults would cascade again →
    // fork bomb. Children run with MYCELIUM_SUBPROCESS=1 → just pass.
    if (process.env.MYCELIUM_SUBPROCESS) return { verdict: 'pass' }

    // Length gate must be language-agnostic: Chinese has no spaces, so whitespace-splitting a
    // CJK task counts it as 1 "word" and skips the brain entirely. Count match-tokens instead
    // (latin words + CJK bigrams), which is meaningful in both languages.
    if (TRIVIAL.test(req.task)) return { verdict: 'pass' }
    if (tokenize(req.task).length < MIN_WORDS) return { verdict: 'pass' }
    // self-referential smoke checks ("是否可用" / "test if it works") aren't real work.
    if (isMetaQuery(req.task)) return { verdict: 'pass' }

    const prefs = this.prefs()
    // Trigger gate: in keyword mode, a task with no configured keyword never wakes the brain.
    if (!shouldWake(req.task, prefs)) return { verdict: 'pass' }

    // ---- Step 1a: a local skill already covers this → reuse it (strongest outcome) ----
    // Skills are English; tasks may be Chinese. Fold each skill's Chinese keyword aliases
    // (bundled defaults + user overrides from settings) into its tokens before matching.
    const aliasOverrides = this.deps.settings
      ? this.deps.settings.get<Record<string, string[]>>('skillAliases', {})
      : {}
    const matches = this.matcher.match(req.task, aliasedSkills(this.repo.list(), aliasOverrides))
    // Negative learning: drop any skill already marked a misfit for this task-shape, so a wrong
    // suggestion the user corrected before never recurs for the same kind of task.
    const suppressed = this.deps.misfits?.suppressedFor(req.task) ?? new Set<string>()
    const kept = matches.filter((m) => !suppressed.has(m.skill.name))
    if (kept.length > 0) {
      const top = kept[0].skill.name
      this.ledger.recordUsage({
        skill: top,
        tool: req.tool,
        task: req.task,
        ...(req.model ? { model: req.model } : {}),
      })
      const exp = this.ledger.experienceOf(top)
      return {
        verdict: 'reuse',
        skill: top,
        experience: `used ${exp.totalUses}x across [${exp.tools.join(', ')}], strength ${exp.strength.toFixed(2)}`,
      }
    }

    // ---- Step 1b: the user's own memory already covers this → recall those notes ----
    if (this.deps.memoryDir) {
      const hits = recallFromMemory(req.task, this.deps.memoryDir)
      if (hits.length > 0) {
        return {
          verdict: 'recall',
          notes: hits,
          note: 'your memory already covers this — read these before researching',
        }
      }
    }

    // ---- Local miss. Count the recurrence; cheap one-offs never escalate. ----
    const rec = this.deps.recurrence
    const count = rec ? rec.recordMiss(req.task) : 1
    const canSpend = !rec || rec.underQuota(prefs.dailyQuota)

    // Steps 2/3 (online research + skill market → install proposals) run async, quota-gated.
    // Charge the quota the first time we actually spend on a shape so the daily cap is real.
    if (canSpend) {
      this.deps.onMiss?.(req.task, req.tool)
      rec?.chargeQuota()
    }

    // Step 4 signal: this shape recurred enough with no local coverage → the agent should
    // interactively BUILD a skill. Only suggest ONCE per shape: if the user already saw a build
    // suggestion for it and didn't build, don't nag on every later consult — fall through to searching.
    if (rec && count >= prefs.recurrenceThreshold && !rec.wasBuildSuggested(req.task)) {
      rec.markBuildSuggested(req.task)
      return {
        verdict: 'build',
        task: req.task,
        reason: `no local skill or memory; this task-shape has recurred ${count}× (threshold ${prefs.recurrenceThreshold})`,
      }
    }

    return {
      verdict: 'searching',
      note:
        count > 1
          ? `no local match (seen ${count}×); researching ready-made options`
          : 'no local match; researching ready-made options',
    }
  }

  feedback(f: FeedbackRequestT): void {
    // 'reject' = the suggestion was irrelevant (agent's instant judgment). It must NOT touch the
    // skill's global strength — the skill may be excellent for its real domain. It only records a
    // skill×task-shape misfit so the matcher stops offering it for THIS kind of task.
    if (f.outcome === 'reject') {
      if (f.task && this.deps.misfits) this.deps.misfits.record(f.task, f.skill)
      return
    }
    // ok / fail adjust the skill's strength as before.
    this.ledger.recordFeedback({ skill: f.skill, tool: f.tool, outcome: f.outcome, ...(f.model ? { model: f.model } : {}), ...(f.note ? { note: f.note } : {}) })
    if (!f.task || !this.deps.misfits) return
    if (f.outcome === 'fail') {
      // used but failed for this task-shape → record a misfit.
      this.deps.misfits.record(f.task, f.skill)
    } else {
      // ok → positive evidence reverses any prior misfit on this shape (self-healing).
      this.deps.misfits.clear(f.task, f.skill)
    }
  }

  /**
   * Land a skill the agent built interactively (cascade step 4). De-dupes against existing
   * skills by name, writes SKILL.md + a sidecar carrying the human-readable `purpose`, then
   * rescans so the new skill is immediately consultable. Returns the registered name or a reason.
   */
  registerSkill(req: RegisterSkillRequestT): RegisterResult {
    if (!this.deps.skillsDir) return { ok: false, reason: 'no skillsDir configured' }
    // Cross-model contract: every tool/model writes to the SAME shared skill base, so a weaker
    // model must not be able to deposit garbage. Validate the shape before landing it.
    const v = validateSkillContract(req)
    if (!v.ok) return v
    // Language contract: when the user's primary language is CJK, a self-built skill MUST carry
    // keywords — an English-only SKILL.md shares no tokens with the same-language task that
    // prompted it, so without keywords it would be unmatchable by that very task.
    const lang = this.prefs().primaryLanguage
    if (CJK_LANGUAGES.includes(lang) && !req.keywords?.some((k) => k.trim())) {
      return {
        ok: false,
        reason: `primary language is "${lang}" — register_skill must include keywords in that language so the same-language task can find this skill`,
      }
    }
    const name = extractName(req.skillMd)! // validated above
    if (this.repo.list().some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, reason: `a skill named "${name}" already exists` }
    }
    landSynthesized(req.skillMd, {
      skillsDir: this.deps.skillsDir,
      source: req.source,
      sourceUrl: req.sourceUrl,
      purpose: req.purpose,
      ...(req.keywords?.length ? { keywords: req.keywords } : {}),
      addedBy: req.model ? `${req.tool}/${req.model}-interactive` : `${req.tool}-interactive`,
    })
    this.repo.scan()
    return { ok: true, skill: name }
  }
}

/** Skill name rule shared by all tools: lowercase kebab, 2–64 chars. */
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{1,63}$/

/**
 * The unified skill contract every model must satisfy before its skill lands in the shared base.
 * Keeps the brain stable regardless of which tool/model (opus, gpt, glm…) built the skill.
 */
function validateSkillContract(req: RegisterSkillRequestT): RegisterResult {
  const name = extractName(req.skillMd)
  if (!name) return { ok: false, reason: 'SKILL.md missing name: frontmatter' }
  if (!SKILL_NAME.test(name))
    return { ok: false, reason: `skill name "${name}" must be lowercase-kebab, 2–64 chars` }
  if (!/^description:[ \t]*\S/m.test(req.skillMd))
    return { ok: false, reason: 'SKILL.md missing a non-empty description: frontmatter' }
  const body = req.skillMd.replace(/^---[\s\S]*?---/, '').trim()
  if (body.length < 40)
    return { ok: false, reason: 'SKILL.md body too thin (<40 chars) — needs real guidance' }
  if (req.skillMd.length > 100_000)
    return { ok: false, reason: 'SKILL.md too large (>100k chars)' }
  const purpose = req.purpose.trim()
  if (purpose.length < 8 || purpose.length > 280)
    return { ok: false, reason: 'purpose must be a meaningful one-liner (8–280 chars)' }
  return { ok: true, skill: name }
}

function extractName(md: string): string | null {
  const m = md.match(/^name:\s*(.+)$/m)
  return m ? m[1].trim() : null
}
