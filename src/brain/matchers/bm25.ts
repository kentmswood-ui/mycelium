import type { Match, Matcher } from '../matcher.js'
import type { Skill } from '../../skills/skill.js'
import { tokenize } from '../../skills/skill.js'
import { skillTerms } from './common.js'

export interface Bm25Options {
  k1?: number
  b?: number
  threshold?: number
}

export class Bm25Matcher implements Matcher {
  private k1: number
  private b: number
  private defaultThreshold: number

  constructor(opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.4
    this.b = opts.b ?? 0.72
    this.defaultThreshold = opts.threshold ?? 1.2
  }

  match(task: string, skills: Skill[], threshold = this.defaultThreshold): Match[] {
    const query = [...new Set(tokenize(task))]
    if (query.length === 0 || skills.length === 0) return []

    const docs = skills.map((skill) => termCounts(skillTerms(skill)))
    const lengths = docs.map((doc) => [...doc.values()].reduce((sum, count) => sum + count, 0))
    const avgLen = lengths.reduce((sum, len) => sum + len, 0) / Math.max(lengths.length, 1)
    const df = new Map<string, number>()
    for (const doc of docs) {
      for (const term of doc.keys()) df.set(term, (df.get(term) ?? 0) + 1)
    }

    const out: Match[] = []
    for (let i = 0; i < skills.length; i++) {
      let score = 0
      for (const term of query) {
        const tf = docs[i].get(term) ?? 0
        if (tf === 0) continue
        const idf = Math.log(1 + (skills.length - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5))
        const denom = tf + this.k1 * (1 - this.b + this.b * (lengths[i] / avgLen))
        score += idf * ((tf * (this.k1 + 1)) / denom)
      }
      if (score >= threshold) out.push({ skill: skills[i], score })
    }
    return out.sort((a, b) => b.score - a.score)
  }
}

function termCounts(terms: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1)
  return counts
}
