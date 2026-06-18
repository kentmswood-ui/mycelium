import type { Matcher } from '../matcher.js'
import type { Skill } from '../../skills/skill.js'

export type Lang = 'zh' | 'en' | 'mixed'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Split = 'train' | 'test'
export type SplitArg = Split | 'all'

export interface MatcherCase {
  id: string
  task: string
  lang: Lang
  expect: string | null
  notExpect?: string[]
  note: string
  difficulty: Difficulty
  split: Split
}

export interface Hit {
  skill: string
  score: number
}

export interface CaseResult {
  id: string
  task: string
  lang: Lang
  difficulty: Difficulty
  expected: string | null
  actual: string | null
  notExpectHit: string | null
  top3: Hit[]
  top1Ok: boolean
  falsePositive: boolean
  note: string
}

export interface Metrics {
  total: number
  positive: number
  predictedPositive: number
  top1Hits: number
  falsePositives: number
  top1Accuracy: number
  falsePositiveRate: number
  precision: number
  recall: number
  f1: number
}

export interface MatcherEvaluation {
  matcher: string
  metrics: Metrics
  byLang: Record<Lang, Metrics>
  byDifficulty: Record<Difficulty, Metrics>
  results: CaseResult[]
  confusions: CaseResult[]
}

export function splitForCaseId(id: string): Split {
  let h = 2166136261
  for (const ch of id) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 10 < 7 ? 'train' : 'test'
}

export function selectCases(cases: MatcherCase[], split: SplitArg): MatcherCase[] {
  return split === 'all' ? cases : cases.filter((item) => item.split === split)
}

export function warningForSplit(split: SplitArg): string | null {
  if (split === 'test') {
    return 'ANTI-CHEAT WARNING: TEST split may be evaluated ONLY ONCE at the end of phase 4; do not tune from this output.'
  }
  if (split === 'all') {
    return 'ANTI-CHEAT WARNING: --split=all includes TEST rows; use only for final reporting, never for tuning.'
  }
  return null
}

export function evaluateMatcher(
  name: string,
  matcher: Matcher,
  skills: Skill[],
  cases: MatcherCase[],
): MatcherEvaluation {
  const results = cases.map((item) => {
    const matches = matcher.match(item.task, skills)
    const top3 = matches.slice(0, 3).map((match) => ({
      skill: match.skill.name,
      score: match.score,
    }))
    const actual = top3[0]?.skill ?? null
    const notExpected = new Set(item.notExpect ?? [])
    const notExpectHit = top3.find((hit) => notExpected.has(hit.skill))?.skill ?? null
    const top1Ok = item.expect === actual
    const falsePositive = (item.expect === null && actual !== null) || notExpectHit !== null
    return {
      id: item.id,
      task: item.task,
      lang: item.lang,
      difficulty: item.difficulty,
      expected: item.expect,
      actual,
      notExpectHit,
      top3,
      top1Ok,
      falsePositive,
      note: item.note,
    }
  })

  return {
    matcher: name,
    metrics: metricsFor(results),
    byLang: {
      zh: metricsFor(results.filter((item) => item.lang === 'zh')),
      en: metricsFor(results.filter((item) => item.lang === 'en')),
      mixed: metricsFor(results.filter((item) => item.lang === 'mixed')),
    },
    byDifficulty: {
      easy: metricsFor(results.filter((item) => item.difficulty === 'easy')),
      medium: metricsFor(results.filter((item) => item.difficulty === 'medium')),
      hard: metricsFor(results.filter((item) => item.difficulty === 'hard')),
    },
    results,
    confusions: results.filter((item) => !item.top1Ok || item.falsePositive),
  }
}

function metricsFor(results: CaseResult[]): Metrics {
  const total = results.length
  const positive = results.filter((item) => item.expected !== null).length
  const predictedPositive = results.filter((item) => item.actual !== null).length
  const top1Hits = results.filter((item) => item.expected !== null && item.top1Ok).length
  const falsePositives = results.filter((item) => item.falsePositive).length
  const precision = predictedPositive === 0 ? 0 : top1Hits / predictedPositive
  const recall = positive === 0 ? 0 : top1Hits / positive
  return {
    total,
    positive,
    predictedPositive,
    top1Hits,
    falsePositives,
    top1Accuracy: positive === 0 ? 0 : top1Hits / positive,
    falsePositiveRate: total === 0 ? 0 : falsePositives / total,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
  }
}
