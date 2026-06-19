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
 *
 * Two-pass design: the first crawl ingests name+purpose (thin scan). A deep re-scan resubmits the
 * full SKILL.md body as `scanText`; `ingest` upserts — same content_hash → re-classify + update —
 * so the verdict sharpens as more text is seen. This is how false positives get rescued and hidden
 * malware gets caught.
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
 * Dangerous-pattern detectors. `hard:true` patterns gate a skill to RED (never auto-installable)
 * regardless of source — they indicate the skill can own the machine, move money, or exfiltrate.
 * `hard:false` patterns are NOTED (raise the risk level / shown as flags) but only push to yellow,
 * because tons of legitimate dev skills merely MENTION npm/network/tokens in their docs. Patterns
 * are tightened to fire on actual dangerous USAGE, not incidental mention (the old classifier
 * flagged `bun-development` L3 for the words "rm -rf" appearing in prose).
 */
const RISK_PATTERNS: { re: RegExp; label: string; level: RiskLevel; hard: boolean }[] = [
  // ── HARD: own the machine / steal / move money ──
  { re: /(curl|wget|fetch)(\s+\S+)?\s*\|\s*(ba|z|fi)?sh\b/i, label: 'pipe-to-shell', level: 'L3', hard: true },
  { re: /\brm\s+-rf\s+(\/|~|\$HOME|\*|%USERPROFILE%|C:\\)/i, label: 'rm -rf dangerous target', level: 'L3', hard: true },
  { re: /\b(bash|sh|nc|ncat)\s+-i\b|\/dev\/tcp\/|reverse\s+shell|bind\s+shell/i, label: 'reverse-shell', level: 'L3', hard: true },
  { re: /(send|transfer|withdraw|drain|sweep)\s+(funds|crypto|tokens|money|balance)|private[_-]?key|seed\s+phrase|mnemonic/i, label: 'financial-action', level: 'L3', hard: true },
  { re: /(curl|wget|fetch|http[s]?|post|upload)[^\n]{0,60}(\.env|id_rsa|\.ssh|credentials|secret|api[_-]?key|token)/i, label: 'credential-exfil', level: 'L3', hard: true },
  { re: /\bexfiltrat/i, label: 'exfiltration', level: 'L3', hard: true },
  { re: /(ignore|disregard|override)\s+(previous|all|your)\s+(instructions|prompt|rules)|system\s+prompt\s+(leak|override)/i, label: 'prompt-injection', level: 'L3', hard: true },
  { re: /\b(chmod\s+777|setuid|sudo\s+su|privilege\s+escalation)\b/i, label: 'privilege', level: 'L3', hard: true },
  // ── SOFT: noted, but not auto-red (legit skills mention these) ──
  { re: /\beval\s*\(|new\s+Function\s*\(/i, label: 'dynamic-exec', level: 'L2', hard: false },
  { re: /\b(npm|pip|pip3|apt|brew|cargo|gem)\s+(install|add|i)\b/i, label: 'installs-packages', level: 'L1', hard: false },
  { re: /base64\s+-d|atob\(/i, label: 'base64-decode', level: 'L2', hard: false },
  { re: /\b(api[_-]?key|secret|password|access[_-]?token)\b/i, label: 'credential-handling', level: 'L1', hard: false },
  { re: /\b(https?:\/\/|fetch\(|axios|requests\.(get|post))/i, label: 'network', level: 'L1', hard: false },
]

export interface CatalogInput {
  name: string
  purpose?: string
  source: string
  url?: string
  domain?: string
  keywords?: string[]
  stars?: number
  /** optional extra text (full SKILL.md body) to scan for risk beyond name/purpose */
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
  let hardHit = false
  for (const p of RISK_PATTERNS) {
    if (p.re.test(hay)) {
      flags.push(p.label)
      if (p.hard) hardHit = true
      if (LEVEL_ORDER.indexOf(p.level) > LEVEL_ORDER.indexOf(risk)) risk = p.level
    }
  }
  const trust = SOURCE_TRUST[input.source] ?? 'medium'
  // red: a HARD danger signal, regardless of source — never auto-installable.
  // green: high-trust source AND no hard signal (soft mentions are fine for official skills).
  // yellow: everything else — installable only with explicit approval.
  let tier: Tier
  if (hardHit) tier = 'red'
  else if (trust === 'high') tier = 'green'
  else tier = 'yellow'
  return { tier, risk, riskFlags: flags }
}

function hashOf(input: CatalogInput): string {
  const norm = `${input.name.trim().toLowerCase()}|${(input.purpose ?? '').trim().toLowerCase()}`
  return createHash('sha256').update(norm).digest('hex').slice(0, 16)
}

export class CatalogStore {
  constructor(private db: DB) {}

  /**
   * Ingest/upsert one entry (dedupe by content hash). First sight → insert. Same hash again (a deep
   * re-scan carrying full `scanText`) → re-classify and UPDATE the verdict + enrich metadata.
   * Returns which happened.
   */
  ingest(input: CatalogInput): { inserted: boolean; updated: boolean; entry: CatalogEntry } {
    const contentHash = hashOf(input)
    const { tier, risk, riskFlags } = classify(input)
    const entry: CatalogEntry = { ...input, contentHash, tier, risk, riskFlags }
    const existing = this.db.prepare('SELECT content_hash FROM catalog WHERE content_hash=?').get(contentHash)
    if (existing) {
      this.db
        .prepare(
          `UPDATE catalog SET tier=?, risk=?, risk_flags=?,
             url=COALESCE(?,url), domain=COALESCE(?,domain),
             keywords=CASE WHEN ?='[]' THEN keywords ELSE ? END,
             stars=COALESCE(?,stars)
           WHERE content_hash=?`,
        )
        .run(
          tier, risk, riskFlags.join(','),
          input.url ?? null, input.domain ?? null,
          JSON.stringify(input.keywords ?? []), JSON.stringify(input.keywords ?? []),
          input.stars ?? null, contentHash,
        )
      return { inserted: false, updated: true, entry }
    }
    this.db
      .prepare(
        `INSERT INTO catalog
           (content_hash, name, purpose, source, url, domain, keywords, tier, risk, risk_flags, stars)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        contentHash, input.name, input.purpose ?? null, input.source, input.url ?? null,
        input.domain ?? null, JSON.stringify(input.keywords ?? []), tier, risk,
        riskFlags.join(','), input.stars ?? null,
      )
    return { inserted: true, updated: false, entry }
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
