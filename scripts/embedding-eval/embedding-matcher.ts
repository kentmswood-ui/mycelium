import type { Match, Matcher } from '../../src/brain/matcher.js'
import type { Skill } from '../../src/skills/skill.js'

export type Vector = number[]

export function normalizeVector(vector: Vector): Vector {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm === 0) return [...vector]
  return vector.map((value) => value / norm)
}

export function cosine(a: Vector, b: Vector): number {
  const length = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < length; i += 1) dot += a[i] * b[i]
  return dot
}

export interface PrecomputedEmbeddingMatcherOpts {
  queryVectors: Map<string, Vector>
  skillVectors: Map<string, Vector>
  threshold: number
}

export class PrecomputedEmbeddingMatcher implements Matcher {
  constructor(private opts: PrecomputedEmbeddingMatcherOpts) {}

  match(task: string, skills: Skill[], threshold = this.opts.threshold): Match[] {
    const query = this.opts.queryVectors.get(task)
    if (!query) return []

    return skills
      .map((skill) => {
        const vector = this.opts.skillVectors.get(skill.name)
        return vector ? { skill, score: cosine(query, vector) } : null
      })
      .filter((hit): hit is Match => hit !== null && hit.score >= threshold)
      .sort((a, b) => b.score - a.score)
  }
}
