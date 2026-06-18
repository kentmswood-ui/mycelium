import { KeywordMatcher } from '../matcher.js'
import type { Match, Matcher } from '../matcher.js'
import type { Skill } from '../../skills/skill.js'
import { Bm25Matcher } from './bm25.js'
import { CharNgramMatcher } from './char-ngram.js'

export interface HybridOptions {
  keywordWeight?: number
  bm25Weight?: number
  charWeight?: number
  threshold?: number
}

export class HybridMatcher implements Matcher {
  private keywordWeight: number
  private bm25Weight: number
  private charWeight: number
  private defaultThreshold: number

  constructor(opts: HybridOptions = {}) {
    this.keywordWeight = opts.keywordWeight ?? 0.35
    this.bm25Weight = opts.bm25Weight ?? 0.35
    this.charWeight = opts.charWeight ?? 0.3
    this.defaultThreshold = opts.threshold ?? 0.85
  }

  match(task: string, skills: Skill[], threshold = this.defaultThreshold): Match[] {
    if (skills.length === 0) return []
    const scores = new Map<string, number>()
    addScores(scores, new KeywordMatcher().match(task, skills, 0), this.keywordWeight)
    addScores(scores, new Bm25Matcher({ threshold: 0 }).match(task, skills), this.bm25Weight)
    addScores(scores, new CharNgramMatcher({ threshold: 0 }).match(task, skills), this.charWeight)

    const byName = new Map(skills.map((skill) => [skill.name, skill]))
    return [...scores.entries()]
      .map(([name, score]) => ({ skill: byName.get(name)!, score }))
      .filter((hit) => hit.skill && hit.score >= threshold)
      .sort((a, b) => b.score - a.score)
  }
}

function addScores(scores: Map<string, number>, matches: Match[], weight: number) {
  const max = Math.max(...matches.map((match) => match.score), 0)
  if (max === 0) return
  for (const match of matches) {
    scores.set(match.skill.name, (scores.get(match.skill.name) ?? 0) + weight * (match.score / max))
  }
}
