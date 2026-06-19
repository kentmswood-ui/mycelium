import { createHash } from 'node:crypto'
import type { DB } from '../ledger/db.js'

/**
 * Ecosystem catalog: a knowledge map of skills that exist in the world (not installed locally).
 * Built by an external crawl (Codex over anthropics/skills, antigravity-awesome-skills, skills.sh,
 * skillsmp) and ingested here. The brain consults it ONLY on a local miss to suggest an install —
 * it is never matched against directly, so the installed-skill matcher's precision is preserved.
 *
 * Safety is enforced HERE, in Mycelium, not by the crawler: every entry is risk-classified and
 * tiered. A red entry is cataloged for awareness but can never be auto-installed.
 */

export type Tier = 'green' | 'yellow' | 'red'
export type RiskLevel = 'L0' | 'L1' | 'L2' | 'L3'

/** Trust by source. Official Anthropic = high; community/marketplace = medium. */
const SOURCE_TRUST: Record<string, 'high' | 'medium'> = {
  anthropics: 'high',
  antigravity: 'medium',
  'skills.sh': 'medium',
  skillsmp: 'medium',
}

/**
 * Dangerous-pattern → risk level. Scanned against the skill's name+purpose+keywords (and any
 * body excerpt the crawler includes). L3 = can own the machine; L2 = runs code / installs; these
 * gate a skill to the red tier (never auto-installable) regardless of source.
 */
const RISK_PATTERNS: { re: RegExp; label: string; level: RiskLevel }[] = [
  { re: /\|\s*(ba)?sh\b|curl\s+\S+\s*\|\s*(ba)?sh|wget\s+\S+\s*\|\s*(ba)?sh/i, label: 'pipe-to-shell', level: 'L3' },
  { re: /\brm\s+-rf\b/i, label: 'rm -rf', level: 'L3' },
  { re: /\b(wallet|private[_-]?key|seed[_-]?phrase|banking|payment\s+api|send\s+(funds|crypto))\b/i, label: 'financial', level: 'L3' },
  { re: /\b(sudo|root\s+access|chmod\s+777|setuid)\b/i, label: 'privilege', level: 'L3' },
  { re: /\bexfiltrat|upload\s+.*(env|secret|credential)/i, label: 'exfiltration', level: 'L3' },
  { re: /\beval\s*\(|new\s+Function\s*\(|exec\s*\(/i, label: 'dynamic-exec', level: 'L2' },
  { re: /\b(npm\s+install|pip\s+install|apt\s+(get\s+)?install|brew\s+install)\b/i, label: 'installs-packages', level: 'L2' },
  { re: /base64\s+-d|atob\(/i, label: 'base64-decode', level: 'L2' },
  { re: /\b(token|api[_-]?key|secret|password)\b/i, label: 'credential-handling', level: 'L1' },
  { re: /\b(http|fetch|request|network|download)\b/i, label: 'network', level: 'L1' },
]

export interface CatalogInput {
  name: string
  purpose?: string
  source: string
  url?: string
  domain?: string
  keywords?: string[]
  stars?: number
  /** optional extra text (body excerpt) to scan for risk beyond name/purpose */
  scanText?: string
}

export interface CatalogEntry extends CatalogInput {
  contentHash: string
  tier: Tier
  risk: RiskLevel
  riskFlags: string[]
}

const LEVEL_ORDER: RiskLevel[] = ['L0', 'L1', 'L2', 'L3']

/** Classify risk + assign tier from source trust and matched dangerous patterns. */
export function classify(input: CatalogInput): { tier: Tier; risk: RiskLevel; riskFlags: string[] } {
  const hay = `${input.name} ${input.purpose ?? ''} ${(input.keywords ?? []).join(' ')} ${input.scanText ?? ''}`
  const flags: string[] = []
  let risk: RiskLevel = 'L0'
  for (const p of RISK_PATTERNS) {
    if (p.re.test(hay)) {
      flags.push(p.label)
      if (LEVEL_ORDER.indexOf(p.level) > LEVEL_ORDER.indexOf(risk)) risk = p.level
    }
  }
  const trust = SOURCE_TRUST[input.source] ?? 'medium'
  // red: anything that can run code / own the machine, regardless of source.
  // green: high-trust source AND no risk above L1.
  // yellow: everything else (clean-ish, but install needs explicit approval).
  let tier: Tier
  if (risk === 'L3' || risk === 'L2') tier = 'red'
  else if (trust === 'high' && (risk === 'L0' || risk === 'L1')) tier = 'green'
  else tier = 'yellow'
  return { tier, risk, riskFlags: flags }
}

function hashOf(input: CatalogInput): string {
  const norm = `${input.name.trim().toLowerCase()}|${(input.purpose ?? '').trim().toLowerCase()}`
  return createHash('sha256').update(norm).digest('hex').slice(0, 16)
}

export class CatalogStore {
  constructor(private db: DB) {}

  /** Ingest one entry (dedupe by content hash). Returns {inserted} — false if it was a duplicate. */
  ingest(input: CatalogInput): { inserted: boolean; entry: CatalogEntry } {
    const contentHash = hashOf(input)
    const { tier, risk, riskFlags } = classify(input)
    const entry: CatalogEntry = { ...input, contentHash, tier, risk, riskFlags }
    const info = this.db
      .prepare(
        `INSERT OR IGNORE INTO catalog
           (content_hash, name, purpose, source, url, domain, keywords, tier, risk, risk_flags, stars)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        contentHash,
        input.name,
        input.purpose ?? null,
        input.source,
        input.url ?? null,
        input.domain ?? null,
        JSON.stringify(input.keywords ?? []),
        tier,
        risk,
        riskFlags.join(','),
        input.stars ?? null,
      )
    return { inserted: info.changes > 0, entry }
  }

  /** Aggregate counts for the cockpit (total, by tier, by source). */
  stats(): { total: number; byTier: Record<string, number>; bySource: Record<string, number> } {
    const total = (this.db.prepare('SELECT COUNT(*) c FROM catalog').get() as any).c
    const tierRows = this.db.prepare('SELECT tier, COUNT(*) c FROM catalog GROUP BY tier').all() as any[]
    const srcRows = this.db.prepare('SELECT source, COUNT(*) c FROM catalog GROUP BY source').all() as any[]
    const byTier: Record<string, number> = {}
    const bySource: Record<string, number> = {}
    for (const r of tierRows) byTier[r.tier] = r.c
    for (const r of srcRows) bySource[r.source] = r.c
    return { total, byTier, bySource }
  }

  /**
   * Catalog candidates relevant to a task, for install suggestion on a local miss. Token overlap
   * on name+purpose+keywords. RED entries are excluded — they are never installable. Green ranks
   * above yellow.
   */
  suggest(taskTokens: Set<string>, limit = 5): CatalogEntry[] {
    if (taskTokens.size === 0) return []
    const rows = this.db
      .prepare("SELECT * FROM catalog WHERE tier != 'red'")
      .all() as any[]
    const scored: { e: CatalogEntry; score: number }[] = []
    for (const r of rows) {
      const kws: string[] = r.keywords ? JSON.parse(r.keywords) : []
      const hay = `${r.name} ${r.purpose ?? ''} ${kws.join(' ')}`.toLowerCase()
      const toks = new Set(hay.split(/[^a-z0-9一-鿿]+/).filter((t) => t.length > 1))
      let shared = 0
      for (const t of taskTokens) if (toks.has(t)) shared++
      if (shared < 2) continue
      const score = shared / taskTokens.size + (r.tier === 'green' ? 0.15 : 0)
      scored.push({
        e: {
          name: r.name, purpose: r.purpose, source: r.source, url: r.url, domain: r.domain,
          keywords: kws, stars: r.stars, contentHash: r.content_hash, tier: r.tier,
          risk: r.risk, riskFlags: r.risk_flags ? r.risk_flags.split(',') : [],
        },
        score,
      })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.e)
  }
}
