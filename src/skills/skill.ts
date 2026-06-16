import matter from 'gray-matter'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export interface Skill {
  name: string
  description: string
  keywords: string[]
  dir: string
  source: string
  tokens: string[]
}

/**
 * Tokenize for matching. Latin runs become whole words (length > 1). CJK has no spaces, so a
 * run of Han characters is segmented into overlapping bigrams (先写失败 → 先写, 写失, 失败) — the
 * standard cheap way to get overlap between a Chinese task and Chinese skill aliases without a
 * full segmenter. Mixed chunks like "tdd测试" yield both the latin word and the CJK bigrams.
 */
export function tokenize(s: string): string[] {
  const lower = s.toLowerCase()
  const out: string[] = []
  for (const chunk of lower.split(/[^a-z0-9一-鿿]+/)) {
    if (!chunk) continue
    for (const latin of chunk.match(/[a-z0-9]+/g) ?? []) {
      if (latin.length > 1) out.push(latin)
    }
    for (const han of chunk.match(/[一-鿿]+/g) ?? []) {
      if (han.length === 1) continue // a lone character is too ambiguous to match on
      for (let i = 0; i < han.length - 1; i++) out.push(han.slice(i, i + 2))
    }
  }
  return out
}

export function parseSkill(dir: string): Skill | null {
  const md = join(dir, 'SKILL.md')
  if (!existsSync(md)) return null
  const fm = matter(readFileSync(md, 'utf8')).data as any
  const name = fm.name ?? basename(dir)
  const description = fm.description ?? ''
  const keywords: string[] = Array.isArray(fm.keywords) ? fm.keywords.map(String) : []
  let source = 'local'
  const sidecar = join(dir, '.mycelium.json')
  if (existsSync(sidecar)) {
    try {
      source = JSON.parse(readFileSync(sidecar, 'utf8')).source ?? 'local'
    } catch {
      // malformed sidecar → keep default source
    }
  }
  const tokens = [
    ...new Set([
      ...tokenize(name),
      ...tokenize(description),
      ...keywords.flatMap(tokenize),
    ]),
  ]
  return { name, description, keywords, dir, source, tokens }
}
