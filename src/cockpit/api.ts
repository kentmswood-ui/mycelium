import express, { type Express } from 'express'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SkillRepository } from '../skills/repository.js'
import type { SynapseLedger } from '../ledger/synapse.js'
import type { ProposalStore } from '../brain/proposals.js'
import type { DiscoveryStore } from '../brain/discoveries.js'
import type { SettingsStore } from '../brain/settings.js'
import { ALL_TIERS, DEFAULT_TIERS, TIERS, type Tier } from '../brain/sources.js'
import { readPrefs, PREF_KEYS, TRIGGER_MODES, LANGUAGES, type TriggerMode } from '../brain/prefs.js'
import { approveProposal, rejectProposal, softDeleteSkill } from '../brain/landing.js'
import { parseFeedback } from '../brain/feedback-nl.js'
import { DEFAULT_ALIASES } from '../brain/aliases.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Estimated HOST-model tokens each verdict tends to cost downstream. The brain itself spends
 * zero LLM tokens (it's local) — but a `searching`/`build` verdict triggers the host model to do
 * research + dialogue, and that's the real cost. These are deliberately rough defaults the user
 * can tune in the cockpit; the panel always labels the figure an ESTIMATE, never a measurement.
 */
export const DEFAULT_TOKEN_WEIGHTS: Record<string, number> = {
  pass: 0,
  reuse: 400,
  recall: 800,
  searching: 3000,
  build: 15000,
}

export interface SkillRegistrar {
  (req: { skillMd: string; purpose: string; tool: string; model?: string; keywords?: string[]; source?: string; sourceUrl?: string }): {
    ok: boolean
    skill?: string
    reason?: string
  }
}

export interface CockpitExtras {
  proposals?: ProposalStore
  discoveries?: DiscoveryStore
  settings?: SettingsStore
  skillsDir?: string
  archiveDir?: string
  ledger?: { archive(name: string): void }
  /** soft-delete guard: which skill names are protected (boot-present, shared with cc-switch) */
  isProtected?: (name: string) => boolean
  /** lands a hand-added skill through the same contract-validated path as register_skill */
  registerSkill?: SkillRegistrar
  /** for the one-line NL feedback endpoint */
  feedbackLedger?: { recordFeedback(f: { skill: string; tool: string; outcome: 'ok' | 'fail'; note?: string }): void }
}

export function createCockpit(
  repo: SkillRepository,
  ledger: SynapseLedger,
  extras: CockpitExtras = {},
): Express {
  const app = express()
  app.use(express.json())

  app.get('/api/skills', (_req, res) => {
    res.json(
      repo.list().map((s) => {
        const e = ledger.experienceOf(s.name)
        return {
          name: s.name,
          description: s.description,
          source: s.source,
          keywords: s.keywords,
          strength: e.strength,
          totalUses: e.totalUses,
          tools: e.tools,
          lastUsedAt: e.lastUsedAt,
          protected: extras.isProtected ? extras.isProtected(s.name) : false,
        }
      }),
    )
  })

  // Full SKILL.md + sidecar for the detail panel. Read-only.
  app.get('/api/skills/:name/view', (req, res) => {
    const s = repo.get(String(req.params.name))
    if (!s) return res.status(404).json({ error: 'no such skill' })
    let content = ''
    let purpose: string | null = null
    try {
      content = readFileSync(join(s.dir, 'SKILL.md'), 'utf8')
    } catch {
      /* best-effort */
    }
    try {
      const sc = JSON.parse(readFileSync(join(s.dir, '.mycelium.json'), 'utf8'))
      purpose = sc.purpose ?? null
    } catch {
      /* no sidecar */
    }
    res.json({ name: s.name, content, purpose, keywords: s.keywords, source: s.source })
  })

  app.get('/api/activity', (_req, res) => res.json(ledger.recentActivity(50)))

  // Usage + token ESTIMATE panel. The brain is local/free; the figure estimates the host-model
  // spend each verdict provokes downstream, using user-tunable weights (settings: token_weights).
  app.get('/api/usage', (req, res) => {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30))
    const weights = settings
      ? settings.get<Record<string, number>>('token_weights', DEFAULT_TOKEN_WEIGHTS)
      : DEFAULT_TOKEN_WEIGHTS
    res.json({ ...ledger.usageStats({ days, weights }), weights, days })
  })

  const { proposals, discoveries, settings, skillsDir, archiveDir, ledger: pruneLedger, feedbackLedger, isProtected, registerSkill } = extras
  if (proposals) {
    app.get('/api/proposals', (_req, res) => res.json(proposals.listPendingDestructive()))

    app.post('/api/proposals/:id/approve', (req, res) => {
      if (!skillsDir) return res.status(500).json({ error: 'no skillsDir configured' })
      const id = Number(req.params.id)
      const dir = approveProposal(proposals, id, { skillsDir, archiveDir, ledger: pruneLedger })
      if (dir === null && proposals.get(id)?.status !== 'approved')
        return res.status(409).json({ error: 'not pending or not found' })
      repo.scan() // surface the freshly-landed skill (or drop a pruned one)
      res.json({ ok: true, dir })
    })

    app.post('/api/proposals/:id/reject', (req, res) => {
      const id = Number(req.params.id)
      rejectProposal(proposals, id)
      res.json({ ok: true })
    })
  }

  // Read-only discovery log: what the search path found and what it did. No actions here.
  if (discoveries) {
    app.get('/api/discoveries', (_req, res) => res.json(discoveries.recent(50)))
  }

  // Data-source tiers the search path is allowed to use. The UI toggles these.
  if (settings) {
    app.get('/api/sources', (_req, res) => {
      const enabled = settings.get<Tier[]>('source_tiers', DEFAULT_TIERS)
      res.json({ tiers: TIERS.map((t) => ({ id: t.id, label: t.label })), enabled })
    })
    app.put('/api/sources', (req, res) => {
      const incoming = (req.body?.enabled ?? []) as unknown[]
      const valid = incoming.filter((t): t is Tier => ALL_TIERS.includes(t as Tier))
      settings.set('source_tiers', valid)
      res.json({ ok: true, enabled: valid })
    })

    // Behavior prefs: trigger mode + keywords + recurrence threshold + daily quota.
    app.get('/api/prefs', (_req, res) => {
      res.json({ prefs: readPrefs(settings), triggerModes: TRIGGER_MODES, languages: LANGUAGES })
    })
    app.put('/api/prefs', (req, res) => {
      const b = req.body ?? {}
      if (typeof b.triggerMode === 'string') {
        const valid: TriggerMode[] = ['explicit', 'session', 'keyword']
        if (valid.includes(b.triggerMode)) settings.set(PREF_KEYS.triggerMode, b.triggerMode)
      }
      if (Array.isArray(b.keywords)) {
        settings.set(
          PREF_KEYS.keywords,
          b.keywords.map((k: unknown) => String(k).trim()).filter(Boolean),
        )
      }
      if (b.recurrenceThreshold != null) {
        const n = Math.max(1, Math.floor(Number(b.recurrenceThreshold) || 1))
        settings.set(PREF_KEYS.recurrenceThreshold, n)
      }
      if (b.dailyQuota != null) {
        const n = Math.max(0, Math.floor(Number(b.dailyQuota) || 0))
        settings.set(PREF_KEYS.dailyQuota, n)
      }
      if (typeof b.primaryLanguage === 'string') {
        const valid = ['auto', 'zh', 'en']
        if (valid.includes(b.primaryLanguage)) settings.set(PREF_KEYS.primaryLanguage, b.primaryLanguage)
      }
      res.json({ ok: true, prefs: readPrefs(settings) })
    })

    // Per-verdict token-cost estimate weights (host-model spend each verdict tends to provoke).
    app.get('/api/token-weights', (_req, res) => {
      res.json({ weights: settings.get('token_weights', DEFAULT_TOKEN_WEIGHTS), defaults: DEFAULT_TOKEN_WEIGHTS })
    })
    app.put('/api/token-weights', (req, res) => {
      const b = (req.body?.weights ?? {}) as Record<string, unknown>
      const merged: Record<string, number> = { ...DEFAULT_TOKEN_WEIGHTS }
      for (const k of Object.keys(merged)) {
        if (b[k] != null) merged[k] = Math.max(0, Math.floor(Number(b[k]) || 0))
      }
      settings.set('token_weights', merged)
      res.json({ ok: true, weights: merged })
    })

    // Bilingual alias overrides per skill (merged with bundled DEFAULT_ALIASES at match time).
    app.get('/api/aliases', (_req, res) => {
      const overrides = settings.get<Record<string, string[]>>('skillAliases', {})
      res.json({ defaults: DEFAULT_ALIASES, overrides })
    })
    app.put('/api/aliases', (req, res) => {
      const incoming = (req.body?.overrides ?? {}) as Record<string, unknown>
      const clean: Record<string, string[]> = {}
      for (const [name, arr] of Object.entries(incoming)) {
        if (!Array.isArray(arr)) continue
        const terms = [...new Set(arr.map((a) => String(a).trim().toLowerCase()).filter(Boolean))]
        if (terms.length) clean[name] = terms
      }
      settings.set('skillAliases', clean)
      res.json({ ok: true, overrides: clean })
    })
  }

  // One-line natural-language feedback: "这个不好用" / "that worked great".
  if (feedbackLedger) {
    app.post('/api/feedback', (req, res) => {
      const { skill, tool, text } = req.body ?? {}
      if (!skill || !text) return res.status(400).json({ error: 'skill and text required' })
      const parsed = parseFeedback(String(text))
      if (parsed.outcome === null)
        return res.json({ ok: true, recorded: false, reason: 'sentiment unclear' })
      feedbackLedger.recordFeedback({
        skill: String(skill),
        tool: String(tool ?? 'cockpit'),
        outcome: parsed.outcome,
        note: parsed.note,
      })
      res.json({ ok: true, recorded: true, outcome: parsed.outcome })
    })
  }

  // mycelium's OWN memory (the SQLite ledger) — size visibility + log retention. The user's
  // MEMORY.md notes are NOT here: those are read-only to mycelium and edited by the user directly.
  app.get('/api/ledger/stats', (_req, res) => res.json(ledger.ledgerStats()))
  app.post('/api/ledger/prune', (req, res) => {
    const days = Math.max(0, Math.floor(Number(req.body?.days) || 0))
    if (!days) return res.status(400).json({ error: 'days must be a positive integer' })
    res.json({ ok: true, deleted: ledger.pruneLogs(days) })
  })

  // Skill management. ADD goes through the same contract-validated path as register_skill.
  // ARCHIVE is a reversible soft-delete; it refuses protected (boot-present, cc-switch-shared)
  // skills unless force=true, because archiving moves the dir out of the shared cc-switch store.
  if (registerSkill) {
    app.post('/api/skills/add', (req, res) => {
      const { skillMd, purpose, source, sourceUrl, keywords } = req.body ?? {}
      if (!skillMd || !purpose)
        return res.status(400).json({ error: 'skillMd and purpose required' })
      const kw = Array.isArray(keywords)
        ? keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
        : []
      const r = registerSkill({
        skillMd: String(skillMd),
        purpose: String(purpose),
        tool: 'cockpit',
        ...(kw.length ? { keywords: kw } : {}),
        ...(source ? { source: String(source) } : {}),
        ...(sourceUrl ? { sourceUrl: String(sourceUrl) } : {}),
      })
      if (!r.ok) return res.status(400).json({ error: r.reason })
      repo.scan()
      res.json({ ok: true, skill: r.skill })
    })
  }
  if (skillsDir && archiveDir) {
    app.post('/api/skills/:name/archive', (req, res) => {
      const name = String(req.params.name)
      if (!repo.get(name)) return res.status(404).json({ error: 'no such skill' })
      const force = req.body?.force === true
      if (isProtected?.(name) && !force) {
        return res.status(409).json({
          error: 'protected',
          protected: true,
          note: 'This skill was present at boot and is shared with cc-switch. Archiving moves its folder out of the shared store. Re-send with force:true to confirm.',
        })
      }
      softDeleteSkill(name, { skillsDir, archiveDir, ledger: pruneLedger })
      repo.scan()
      res.json({ ok: true, archived: name })
    })
  }

  app.use('/', express.static(join(here, 'public')))
  return app
}
