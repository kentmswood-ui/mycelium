import { mkdirSync, writeFileSync, existsSync, renameSync, cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import type { Proposal, ProposalStore } from './proposals.js'

/**
 * Merge extra keywords into a SKILL.md's frontmatter `keywords:` list. A skill built in response
 * to a Chinese task is English-only, so the SAME task can't find it (shared token = just the lone
 * latin word). Injecting the trigger task's keywords (esp. CJK) into the frontmatter puts them in
 * the skill's token set permanently — so it's matchable by that task, across tools, forever.
 */
export function injectKeywords(skillMd: string, keywords: string[]): string {
  if (!keywords.length) return skillMd
  const parsed = matter(skillMd)
  const existing: string[] = Array.isArray(parsed.data.keywords)
    ? parsed.data.keywords.map(String)
    : []
  const merged = [...new Set([...existing, ...keywords.map((k) => k.trim()).filter(Boolean)])]
  parsed.data.keywords = merged
  return matter.stringify(parsed.content, parsed.data)
}

export interface LandOpts {
  skillsDir: string
  /** required only for approving 'prune' proposals */
  archiveDir?: string
  /** ledger handle so prune approval can mark the skill archived */
  ledger?: { archive(name: string): void }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'skill'
  )
}

/** Build a minimal SKILL.md stub from proposal metadata (used when no skillMd was found). */
function stubSkillMd(p: Proposal): string {
  const name = slugify(p.title)
  const desc = (p.task ?? p.title).replace(/\n/g, ' ').slice(0, 200)
  const snippet = p.payload?.snippet ?? ''
  return [
    '---',
    `name: ${name}`,
    `description: ${desc}`,
    '---',
    `# ${p.title}`,
    '',
    `> Drafted by Mycelium from ${p.sourceUrl ?? p.source ?? 'a search result'}.`,
    `> Review and flesh out before relying on it.`,
    '',
    snippet ? `Source summary: ${snippet}` : '',
    '',
  ].join('\n')
}

/**
 * Land an approved proposal: write SKILL.md + a .mycelium.json sidecar carrying
 * provenance/trust and protected:false (so pruning may later reclaim it — unlike the
 * user's own skills, which are protected). Returns the skill directory path.
 */
export function landProposal(p: Proposal, opts: LandOpts): string {
  const name = slugify(p.payload?.skillMd ? extractName(p.payload.skillMd) ?? p.title : p.title)
  const dir = join(opts.skillsDir, name)
  mkdirSync(dir, { recursive: true })
  const md = p.payload?.skillMd ?? stubSkillMd(p)
  writeFileSync(join(dir, 'SKILL.md'), md, 'utf8')
  const sidecar = {
    source: p.source ?? null,
    sourceUrl: p.sourceUrl ?? null,
    trust: p.trust,
    risk: p.risk ?? '',
    protected: false,
    addedBy: 'mycelium',
    addedAt: new Date().toISOString(),
  }
  writeFileSync(join(dir, '.mycelium.json'), JSON.stringify(sidecar, null, 2), 'utf8')
  return dir
}

function extractName(md: string): string | null {
  const m = md.match(/^name:\s*(.+)$/m)
  return m ? m[1].trim() : null
}

export interface SynthLandOpts {
  skillsDir: string
  source?: string
  sourceUrl?: string
  trust?: number
  /** what this skill is for — recorded in the sidecar so other tools/agents know its purpose */
  purpose?: string
  /** who built it (e.g. 'mycelium-synthesis' or a tool id for interactive builds) */
  addedBy?: string
  /** extra keywords (esp. the trigger task's CJK terms) injected into frontmatter for matchability */
  keywords?: string[]
}

/**
 * Land a fully-built skill WITHOUT going through the approval queue. Used by the interactive
 * build path (agent researched-with-purpose, asked the user, produced a SKILL.md → register_skill)
 * and any direct synthesis. Returns the skill directory path. The sidecar carries a human-readable
 * `purpose` and marks protected:false so pruning can reclaim it if it never gets used.
 */
export function landSynthesized(skillMd: string, opts: SynthLandOpts): string {
  const withKw = opts.keywords?.length ? injectKeywords(skillMd, opts.keywords) : skillMd
  const name = slugify(extractName(withKw) ?? 'skill')
  const dir = join(opts.skillsDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), withKw, 'utf8')
  const sidecar = {
    source: opts.source ?? null,
    sourceUrl: opts.sourceUrl ?? null,
    trust: opts.trust ?? 0.5,
    risk: '',
    purpose: opts.purpose ?? null,
    protected: false,
    addedBy: opts.addedBy ?? 'mycelium-synthesis',
    addedAt: new Date().toISOString(),
  }
  writeFileSync(join(dir, '.mycelium.json'), JSON.stringify(sidecar, null, 2), 'utf8')
  return dir
}

export function rejectProposal(ps: ProposalStore, id: number): void {
  ps.setStatus(id, 'rejected')
}

/**
 * Soft-delete a skill: move its directory into the archive (recoverable for 30 days)
 * and mark it archived in the ledger. Never a hard delete.
 */
export function softDeleteSkill(
  name: string,
  opts: { skillsDir: string; archiveDir: string; ledger?: { archive(name: string): void } },
): void {
  const from = join(opts.skillsDir, name)
  const to = join(opts.archiveDir, name)
  if (existsSync(from)) {
    mkdirSync(opts.archiveDir, { recursive: true })
    try {
      renameSync(from, to)
    } catch {
      // cross-device or busy → copy then remove
      cpSync(from, to, { recursive: true })
      rmSync(from, { recursive: true, force: true })
    }
  }
  opts.ledger?.archive(name)
}

/** Approve = perform the proposal's action + mark approved. Shared by cockpit and boot. */
export function approveProposal(ps: ProposalStore, id: number, opts: LandOpts): string | null {
  const p = ps.get(id)
  if (!p || p.status !== 'pending') return null
  let dir: string | null = null
  if (p.kind === 'new-skill' || p.kind === 'install' || p.kind === 'rewrite') {
    dir = landProposal(p, opts)
  } else if (p.kind === 'prune') {
    const name = p.payload?.skill
    if (name && opts.archiveDir) {
      softDeleteSkill(name, { skillsDir: opts.skillsDir, archiveDir: opts.archiveDir, ledger: opts.ledger })
    }
  }
  ps.setStatus(id, 'approved')
  return dir
}
