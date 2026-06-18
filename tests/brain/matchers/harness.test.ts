import type { Matcher, Match } from '../../../src/brain/matcher.js'
import type { Skill } from '../../../src/skills/skill.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  evaluateMatcher,
  selectCases,
  splitForCaseId,
  warningForSplit,
  type MatcherCase,
} from '../../../src/brain/matchers/harness.js'

const skill = (name: string): Skill => ({
  name,
  description: '',
  keywords: [],
  dir: '',
  source: 'test',
  tokens: [name],
})

const skills = [skill('alpha'), skill('beta'), skill('gamma')]

const fixedMatcher = (byTask: Record<string, string[]>): Matcher => ({
  match(task: string, corpus: Skill[]): Match[] {
    const names = byTask[task] ?? []
    return names.map((name, index) => ({
      skill: corpus.find((s) => s.name === name)!,
      score: 1 - index * 0.1,
    }))
  },
})

const baseCase = (id: string, task: string, expect: string | null): MatcherCase => ({
  id,
  task,
  lang: 'en',
  expect,
  note: id,
  difficulty: 'medium',
  split: splitForCaseId(id),
})

test('split selection is deterministic from case id', () => {
  const cases = [
    baseCase('case-alpha', 'alpha task', 'alpha'),
    baseCase('case-beta', 'beta task', 'beta'),
    baseCase('case-gamma', 'gamma task', 'gamma'),
  ]

  expect(selectCases(cases, 'all')).toHaveLength(3)
  expect(selectCases(cases, 'train').every((item) => item.split === 'train')).toBe(true)
  expect(selectCases(cases, 'test').every((item) => item.split === 'test')).toBe(true)
})

test('evaluation reports top-1 accuracy, false positives, groups, and confusion rows', () => {
  const cases: MatcherCase[] = [
    { ...baseCase('case-1', 'right', 'alpha'), lang: 'zh', difficulty: 'easy' },
    { ...baseCase('case-2', 'wrong', 'beta'), lang: 'en', difficulty: 'medium' },
    { ...baseCase('case-3', 'negative', null), lang: 'mixed', difficulty: 'hard' },
    {
      ...baseCase('case-4', 'not-expect', 'gamma'),
      notExpect: ['beta'],
      lang: 'en',
      difficulty: 'hard',
    },
  ]
  const matcher = fixedMatcher({
    right: ['alpha'],
    wrong: ['alpha', 'beta'],
    negative: ['gamma'],
    'not-expect': ['gamma', 'beta'],
  })

  const result = evaluateMatcher('fixed', matcher, skills, cases)

  expect(result.metrics.total).toBe(4)
  expect(result.metrics.positive).toBe(3)
  expect(result.metrics.top1Accuracy).toBeCloseTo(2 / 3)
  expect(result.metrics.falsePositiveRate).toBeCloseTo(2 / 4)
  expect(result.metrics.precision).toBeCloseTo(2 / 4)
  expect(result.metrics.recall).toBeCloseTo(2 / 3)
  expect(result.byLang.en.total).toBe(2)
  expect(result.byDifficulty.hard.falsePositiveRate).toBe(1)
  expect(result.confusions.map((row) => row.id)).toEqual(['case-2', 'case-3', 'case-4'])
  expect(result.confusions[0].top3.map((hit) => hit.skill)).toEqual(['alpha', 'beta'])
})

test('test split warning is loud and absent for train runs', () => {
  expect(warningForSplit('train')).toBeNull()
  expect(warningForSplit('test')).toContain('ONLY ONCE')
  expect(warningForSplit('all')).toContain('includes TEST')
})

test('eval CLI carries the anti-cheat contract in source comments', () => {
  const source = readFileSync(join(process.cwd(), 'scripts', 'eval-matcher.ts'), 'utf8')

  expect(source).toContain('ANTI-CHEAT CONTRACT')
  expect(source).toContain('--split=test')
  expect(source).toContain('train split')
})
