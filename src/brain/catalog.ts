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
 * Controlled capability vocabulary for the semantic audit. Codex reports which of these a body
 * actually INVOKES; if a 'performs' verdict carries any SEVERE cap, Mycelium keeps it red. These
 * names are the exact strings the Codex prompt must use, mirroring the severe risk patterns above.
 */
export const SEVERE_CAPS = new Set([
  'pipe-to-shell',
  'reverse-shell',
  'rm-rf-dangerous',
  'privilege-escalation',
  'credential-exfil',
  'financial-action',
  'exfiltration',
  'prompt-injection',
  'path-traversal',
])

/**
 * Detect path-traversal / arbitrary-file-read intent in stored text. Deliberately requires an
 * EXPLICIT phrase or a CHAINED `../../` (a single `../` is a normal relative path/import and must
 * not trip). Used to re-derive the severe `path-traversal` cap on already-assessed rows whose crawl
 * predated that capability label — fixes the file-path-traversal gap an AV catch exposed.
 */
export function hasPathTraversal(text: string): boolean {
  if (!text) return false
  return (
    /\b(path|directory)\s+traversal\b/i.test(text) ||
    /\b(read|access|include|fetch)\s+arbitrary\s+files?\b/i.test(text) ||
    /\blocal\s+file\s+inclusion\b|\bLFI\b/.test(text) ||
    /(\.\.[\/\\]){2,}|%2e%2e(%2f|%5c)/i.test(text)
  )
}

/**
 * Dangerous-pattern detectors. `hard:true` patterns gate a skill to RED (never auto-installable)
 * regardless of source — they indicate the skill can own the machine, move money, or exfiltrate.
 * `hard:false` patterns are NOTED (raise the risk level / shown as flags) but only push to yellow,
 * because tons of legitimate dev skills merely MENTION npm/network/tokens in their docs. Patterns
 * are tightened to fire on actual dangerous USAGE, not incidental mention (the old classifier
 * flagged `bun-development` L3 for the words "rm -rf" appearing in prose).
 */
type Severity = 'severe' | 'suspect' | 'soft'
const RISK_PATTERNS: { re: RegExp; label: string; level: RiskLevel; sev: Severity }[] = [
  // ── SEVERE: own the machine. No benign reading inside a skill body → red for ANY source. ──
  { re: /(curl|wget|fetch)(\s+\S+)?\s*\|\s*(ba|z|fi)?sh\b/i, label: 'pipe-to-shell', level: 'L3', sev: 'severe' },
  { re: /\brm\s+-rf\s+(\/(\s|$)|~|\$HOME|\*|%USERPROFILE%|C:\\)/i, label: 'rm -rf dangerous target', level: 'L3', sev: 'severe' },
  { re: /\b(bash|sh|nc|ncat)\s+-i\b|\/dev\/tcp\/|reverse\s+shell|bind\s+shell/i, label: 'reverse-shell', level: 'L3', sev: 'severe' },
  { re: /\b(chmod\s+777|setuid|sudo\s+su|privilege\s+escalation)\b/i, label: 'privilege', level: 'L3', sev: 'severe' },
  // ── SUSPECT: malicious in intent, but legit skills/docs may mention it in prose or warnings.
  //    Red for medium-trust; a high-trust source needs ≥2 suspect hits before red (else yellow).
  //    Patterns require an ACTION + a real secret target, so API docs that merely say
  //    "POST with your api_key" no longer trip credential-exfil. ──
  { re: /(curl|wget|fetch|upload|post)\b[^\n]{0,40}(\.env\b|id_rsa\b|\.ssh\/|credentials\.(json|ya?ml)|\.aws\/credentials|\.npmrc\b)/i, label: 'credential-exfil', level: 'L3', sev: 'severe' },
  { re: /(send|transfer|withdraw|drain|sweep)\s+(funds|crypto|tokens|money|balance)|\b(private[_-]?key|seed\s+phrase|mnemonic)\b[^\n]{0,40}\b(send|post|upload|export|leak|exfiltrat)/i, label: 'financial-action', level: 'L3', sev: 'suspect' },
  { re: /\bexfiltrat\w*\b[^\n]{0,40}\b(data|files?|secrets?|credentials?|keys?|tokens?)|\b(send|upload|post|leak)\b[^\n]{0,30}\bexfiltrat/i, label: 'exfiltration', level: 'L3', sev: 'suspect' },
  { re: /(ignore|disregard|override)\s+(all\s+)?(previous|prior|your)\s+(instructions|prompts|rules)|system\s+prompt\s+(leak|override|extract)/i, label: 'prompt-injection', level: 'L3', sev: 'suspect' },
  // ── SOFT: noted, never red on their own (legit skills mention these constantly). ──
  { re: /\beval\s*\(|new\s+Function\s*\(/i, label: 'dynamic-exec', level: 'L2', sev: 'soft' },
  { re: /\b(npm|pip|pip3|apt|brew|cargo|gem)\s+(install|add|i)\b/i, label: 'installs-packages', level: 'L1', sev: 'soft' },
  { re: /base64\s+-d|atob\(/i, label: 'base64-decode', level: 'L2', sev: 'soft' },
  { re: /\b(api[_-]?key|secret|password|access[_-]?token)\b/i, label: 'credential-handling', level: 'L1', sev: 'soft' },
  { re: /\b(https?:\/\/|fetch\(|axios|requests\.(get|post))/i, label: 'network', level: 'L1', sev: 'soft' },
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
  let severeHit = false
  let suspectHits = 0
  for (const p of RISK_PATTERNS) {
    if (p.re.test(hay)) {
      flags.push(p.label)
      if (p.sev === 'severe') severeHit = true
      else if (p.sev === 'suspect') suspectHits++
      if (LEVEL_ORDER.indexOf(p.level) > LEVEL_ORDER.indexOf(risk)) risk = p.level
    }
  }
  const trust = SOURCE_TRUST[input.source] ?? 'medium'
  // red    = never auto-installable. A SEVERE signal reds any source. A SUSPECT signal reds a
  //          medium-trust source on the first hit, but a high-trust (first-party) source only on
  //          ≥2 suspect hits — one prose mention in official docs is a false positive, not intent.
  // green   = high-trust source with no severe/suspect signal (soft mentions are fine).
  // yellow  = everything else — installable only with explicit approval.
  let tier: Tier
  if (severeHit) tier = 'red'
  else if (suspectHits >= (trust === 'high' ? 2 : 1)) tier = 'red'
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
    // Cap stored body so the catalog stays bounded; the head holds the dangerous-pattern signal.
    const scanText = input.scanText ? input.scanText.slice(0, 32_000) : null
    const existing = this.db.prepare('SELECT content_hash FROM catalog WHERE content_hash=?').get(contentHash)
    if (existing) {
      this.db
        .prepare(
          `UPDATE catalog SET tier=?, risk=?, risk_flags=?,
             url=COALESCE(?,url), domain=COALESCE(?,domain),
             keywords=CASE WHEN ?='[]' THEN keywords ELSE ? END,
             stars=COALESCE(?,stars),
             scan_text=COALESCE(?,scan_text)
           WHERE content_hash=?`,
        )
        .run(
          tier, risk, riskFlags.join(','),
          input.url ?? null, input.domain ?? null,
          JSON.stringify(input.keywords ?? []), JSON.stringify(input.keywords ?? []),
          input.stars ?? null, scanText, contentHash,
        )
      return { inserted: false, updated: true, entry }
    }
    this.db
      .prepare(
        `INSERT INTO catalog
           (content_hash, name, purpose, source, url, domain, keywords, tier, risk, risk_flags, stars, scan_text)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        contentHash, input.name, input.purpose ?? null, input.source, input.url ?? null,
        input.domain ?? null, JSON.stringify(input.keywords ?? []), tier, risk,
        riskFlags.join(','), input.stars ?? null, scanText,
      )
    return { inserted: true, updated: false, entry }
  }

  /**
   * Apply ONE semantic-audit verdict from Codex over a cataloged row. Codex supplies EVIDENCE
   * (does the body PERFORM a dangerous op, only DETECT/audit it, or merely DISCUSS it) + the
   * capability labels it actually invokes + a short quote. MYCELIUM decides the tier — the crawler
   * never sets safety. This fixes the regex false-positives: a security/audit skill that only
   * DETECTS or DISCUSSES danger is downgraded out of red; only a skill that truly PERFORMS a severe
   * capability stays red. Keyed by name+purpose (same hash as ingest). Returns the resulting tier.
   */
  assess(input: {
    name: string
    purpose?: string
    source: string
    klass: 'performs' | 'detects' | 'discusses'
    caps?: string[]
    evidence?: string
  }): { found: boolean; tier: Tier } {
    const contentHash = hashOf({ name: input.name, purpose: input.purpose, source: input.source })
    const row = this.db
      .prepare('SELECT content_hash, source FROM catalog WHERE content_hash=?')
      .get(contentHash) as { content_hash: string; source: string } | undefined
    if (!row) return { found: false, tier: 'yellow' }

    const caps = (input.caps ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean)
    const hasSevere = caps.some((c) => SEVERE_CAPS.has(c))
    const trust = SOURCE_TRUST[row.source] ?? 'medium'

    // VERDICT (Mycelium owns this). HARD RULE learned from a real AV catch: if the body actually
    // carries a SEVERE capability (a working reverse shell, exfil code, path-traversal exploit…),
    // it is red REGARDLESS of klass. "I'm just teaching/detecting the attack" is exactly the cover
    // a malicious skill hides behind, and an agent that auto-loads such a body can be prompt-injected
    // into running the payload. The detects/discusses rescue applies ONLY to soft capabilities
    // (a security doc that merely mentions credentials/network) — never to a severe payload.
    let tier: Tier
    if (hasSevere) tier = 'red'
    else if (caps.length > 0 && input.klass === 'performs') tier = trust === 'high' ? 'green' : 'yellow'
    else tier = trust === 'high' ? 'green' : 'yellow' // detects / discusses / benign soft performs

    const risk: RiskLevel = hasSevere ? 'L3' : caps.length ? 'L2' : 'L0'
    this.db
      .prepare(
        `UPDATE catalog SET tier=?, risk=?, assess_class=?, assess_caps=?, assess_evidence=?,
           assessed_at=datetime('now') WHERE content_hash=?`,
      )
      .run(tier, risk, input.klass, caps.join(','), (input.evidence ?? '').slice(0, 500), contentHash)
    return { found: true, tier }
  }

  /** Audit coverage for the cockpit / report: how many rows carry a semantic verdict, by class. */
  assessStats(): { assessed: number; byClass: Record<string, number> } {
    const assessed = (this.db.prepare('SELECT COUNT(*) c FROM catalog WHERE assess_class IS NOT NULL').get() as any).c
    const rows = this.db
      .prepare('SELECT assess_class k, COUNT(*) c FROM catalog WHERE assess_class IS NOT NULL GROUP BY assess_class')
      .all() as any[]
    const byClass: Record<string, number> = {}
    for (const r of rows) byClass[r.k] = r.c
    return { assessed, byClass }
  }

  /**
   * Re-derive tiers over ALREADY-ASSESSED rows locally — no Codex re-crawl. Applies the hardened
   * verdict (any severe cap → red, regardless of klass) and BACKFILLS the `path-traversal` severe
   * cap on rows whose crawl predated that label, by scanning stored name/purpose/evidence/scan_text.
   * This is how an AV-exposed gap gets closed across the whole catalog for free. Returns counts.
   */
  reassessTiers(): { scanned: number; changed: number; toRed: number } {
    const rows = this.db
      .prepare(
        "SELECT content_hash, name, purpose, source, tier, assess_class, assess_caps, assess_evidence, scan_text FROM catalog WHERE assess_class IS NOT NULL",
      )
      .all() as any[]
    const upd = this.db.prepare('UPDATE catalog SET tier=?, risk=?, assess_caps=? WHERE content_hash=?')
    let changed = 0
    let toRed = 0
    const tx = this.db.transaction(() => {
      for (const r of rows) {
        const caps = new Set<string>((r.assess_caps || '').split(',').map((c: string) => c.trim()).filter(Boolean))
        // backfill path-traversal from stored text (label didn't exist at crawl time)
        const text = `${r.name} ${r.purpose ?? ''} ${r.assess_evidence ?? ''} ${r.scan_text ?? ''}`
        if (hasPathTraversal(text)) caps.add('path-traversal')
        const capArr = [...caps]
        const hasSevere = capArr.some((c) => SEVERE_CAPS.has(c))
        const trust = SOURCE_TRUST[r.source] ?? 'medium'
        let tier: Tier
        if (hasSevere) tier = 'red'
        else if (capArr.length > 0 && r.assess_class === 'performs') tier = trust === 'high' ? 'green' : 'yellow'
        else tier = trust === 'high' ? 'green' : 'yellow'
        const risk: RiskLevel = hasSevere ? 'L3' : capArr.length ? 'L2' : 'L0'
        if (tier !== r.tier) {
          changed++
          if (tier === 'red') toRed++
        }
        upd.run(tier, risk, capArr.join(','), r.content_hash)
      }
    })
    tx()
    return { scanned: rows.length, changed, toRed }
  }

  /**
   * Re-run the classifier over every cataloged row using its STORED name/purpose/keywords/scan_text.
   * Lets the risk model be re-tuned locally and applied for free — no Codex re-crawl. Returns how
   * many rows changed tier, plus the net tier deltas, for the cockpit / a report.
   */
  reclassifyAll(): { scanned: number; changed: number; deltas: Record<string, number> } {
    const rows = this.db
      .prepare('SELECT content_hash, name, purpose, source, keywords, scan_text, tier FROM catalog')
      .all() as any[]
    const upd = this.db.prepare('UPDATE catalog SET tier=?, risk=?, risk_flags=? WHERE content_hash=?')
    const deltas: Record<string, number> = {}
    let changed = 0
    const tx = this.db.transaction(() => {
      for (const r of rows) {
        const kws: string[] = r.keywords ? JSON.parse(r.keywords) : []
        const { tier, risk, riskFlags } = classify({
          name: r.name, purpose: r.purpose ?? undefined, source: r.source,
          keywords: kws, scanText: r.scan_text ?? undefined,
        })
        if (tier !== r.tier) {
          changed++
          const key = `${r.tier}->${tier}`
          deltas[key] = (deltas[key] ?? 0) + 1
        }
        upd.run(tier, risk, riskFlags.join(','), r.content_hash)
      }
    })
    tx()
    return { scanned: rows.length, changed, deltas }
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
