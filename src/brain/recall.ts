import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tokenize } from '../skills/skill.js'

/**
 * Step 1 of the cascade (local recall): before searching online or building anything, check
 * whether the user's own memory already covers this task. We scan a memory directory of
 * markdown notes, token-match against the task, and return the best hit (if any).
 *
 * This is deliberately read-only and cheap (no LLM): it surfaces "you already have notes on
 * this" so the agent can read them instead of re-researching. Mycelium does not parse meaning,
 * only overlap — the agent reads the actual file.
 */

export interface RecallHit {
  /** note title (first # heading or filename) */
  title: string
  /** absolute path so the agent can read the full note */
  path: string
  /** overlap score 0..1 */
  score: number
}

export interface RecallOpts {
  /** how many notes to return */
  limit?: number
  /** minimum overlap score to count as a hit */
  floor?: number
}

function listMarkdown(dir: string, acc: string[] = [], depth = 0): string[] {
  if (depth > 4) return acc
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const e of entries) {
    const full = join(dir, e)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) listMarkdown(full, acc, depth + 1)
    else if (e.toLowerCase().endsWith('.md')) acc.push(full)
  }
  return acc
}

function titleOf(content: string, fallback: string): string {
  const m = content.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : fallback
}

/**
 * Scan `memoryDir` for markdown notes whose content overlaps the task. Returns the top hits.
 * Best-effort: a missing/unreadable dir yields []. Caps total notes scanned for safety.
 */
/**
 * Scan `memoryDir` for markdown notes whose content overlaps the task. Returns the top hits.
 * Best-effort: a missing/unreadable dir yields []. Caps total notes scanned for safety.
 *
 * Scoring is IDF-weighted, not raw overlap. CJK has no spaces, so we tokenize into bigrams —
 * but that means very common fragments (一个/处理/这个…) appear in nearly every note and would
 * inflate a plain overlap ratio, making unrelated tasks falsely "recall". Weighting each shared
 * token by its rarity across the corpus (log(N/df)) collapses those common bigrams toward zero
 * and lets a genuinely distinctive token (a product name, a rare term) carry the match.
 */
export function recallFromMemory(task: string, memoryDir: string, opts: RecallOpts = {}): RecallHit[] {
  const limit = opts.limit ?? 3
  const floor = opts.floor ?? 0.18
  if (!memoryDir || !existsSync(memoryDir)) return []

  const taskTokens = new Set(tokenize(task))
  if (taskTokens.size === 0) return []

  const files = listMarkdown(memoryDir).slice(0, 500)

  // Pass 1: read every note once, tokenize, and count document frequency per task token.
  const notes: { path: string; content: string; tokens: Set<string> }[] = []
  const df = new Map<string, number>()
  for (const path of files) {
    let content: string
    try {
      content = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    const tokens = new Set(tokenize(content))
    if (tokens.size === 0) continue
    notes.push({ path, content, tokens })
    for (const t of taskTokens) if (tokens.has(t)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const N = notes.length
  if (N === 0) return []

  // Smoothed IDF: a token in every note contributes ~0; a rare/distinctive token contributes most.
  const idf = (t: string) => Math.log((N + 1) / ((df.get(t) ?? 0) + 0.5))
  let totalIdf = 0
  for (const t of taskTokens) totalIdf += idf(t)
  if (totalIdf <= 0) return []

  // Pass 2: score each note as the IDF-weighted fraction of the task it covers.
  const hits: RecallHit[] = []
  for (const { path, content, tokens } of notes) {
    let weighted = 0
    for (const t of taskTokens) if (tokens.has(t)) weighted += idf(t)
    const score = weighted / totalIdf
    if (score >= floor) {
      hits.push({ title: titleOf(content, path.split(/[/\\]/).pop() ?? path), path, score })
    }
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}
