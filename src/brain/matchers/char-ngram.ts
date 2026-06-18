import type { Match, Matcher } from '../matcher.js'
import type { Skill } from '../../skills/skill.js'
import { normalizeText, skillText } from './common.js'

export interface CharNgramOptions {
  minN?: number
  maxN?: number
  threshold?: number
}

export class CharNgramMatcher implements Matcher {
  private minN: number
  private maxN: number
  private defaultThreshold: number

  constructor(opts: CharNgramOptions = {}) {
    this.minN = opts.minN ?? 2
    this.maxN = opts.maxN ?? 4
    this.defaultThreshold = opts.threshold ?? 0.2
  }

  match(task: string, skills: Skill[], threshold = this.defaultThreshold): Match[] {
    const query = vectorize(ngrams(normalizeText(task), this.minN, this.maxN))
    if (query.size === 0 || skills.length === 0) return []

    const docs = skills.map((skill) => vectorize(ngrams(normalizeText(skillText(skill)), this.minN, this.maxN)))
    const df = new Map<string, number>()
    for (const doc of docs) {
      for (const gram of doc.keys()) df.set(gram, (df.get(gram) ?? 0) + 1)
    }
    const weightedQuery = weight(query, df, docs.length)
    const queryNorm = norm(weightedQuery)
    if (queryNorm === 0) return []

    const out: Match[] = []
    for (let i = 0; i < skills.length; i++) {
      const weightedDoc = weight(docs[i], df, docs.length)
      const score = cosine(weightedQuery, queryNorm, weightedDoc)
      if (score >= threshold) out.push({ skill: skills[i], score })
    }
    return out.sort((a, b) => b.score - a.score)
  }
}

function ngrams(text: string, minN: number, maxN: number): string[] {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return []
  const grams: string[] = []
  for (const token of compact.split(' ')) {
    if (!token) continue
    for (let n = minN; n <= maxN; n++) {
      if (token.length <= n) {
        grams.push(token)
        continue
      }
      for (let i = 0; i <= token.length - n; i++) grams.push(token.slice(i, i + n))
    }
  }
  return grams
}

function vectorize(grams: string[]): Map<string, number> {
  const vec = new Map<string, number>()
  for (const gram of grams) vec.set(gram, (vec.get(gram) ?? 0) + 1)
  return vec
}

function weight(vec: Map<string, number>, df: Map<string, number>, totalDocs: number): Map<string, number> {
  const out = new Map<string, number>()
  for (const [gram, tf] of vec) {
    const idf = Math.log((totalDocs + 1) / ((df.get(gram) ?? 0) + 0.5))
    out.set(gram, (1 + Math.log(tf)) * idf)
  }
  return out
}

function norm(vec: Map<string, number>): number {
  let sum = 0
  for (const value of vec.values()) sum += value * value
  return Math.sqrt(sum)
}

function cosine(query: Map<string, number>, queryNorm: number, doc: Map<string, number>): number {
  const docNorm = norm(doc)
  if (docNorm === 0) return 0
  let dot = 0
  for (const [gram, value] of query) dot += value * (doc.get(gram) ?? 0)
  return dot / (queryNorm * docNorm)
}
