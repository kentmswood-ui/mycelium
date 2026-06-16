import { KeywordMatcher } from '../../src/brain/matcher.js'
import type { Skill } from '../../src/skills/skill.js'

const mk = (name: string, tokens: string[]): Skill => ({
  name,
  description: '',
  keywords: [],
  dir: '',
  source: 'local',
  tokens,
})

test('matcher ranks by token overlap and respects threshold', () => {
  const skills = [
    mk('usdt-pay', ['usdt', 'payment', 'billing', 'trc20']),
    mk('pdf-report', ['pdf', 'report', 'export']),
  ]
  const m = new KeywordMatcher()
  const best = m.match('add usdt payment to billing page', skills)
  expect(best[0].skill.name).toBe('usdt-pay')
  expect(best[0].score).toBeGreaterThan(0)
  // unrelated task → no match above threshold
  expect(m.match('write a haiku about the moon', skills, 0.2)).toHaveLength(0)
})

test('a single incidental shared word does not trigger a match', () => {
  // both share only the generic word "report"; one incidental hit must not match
  const skills = [mk('pdf-report', ['pdf', 'report', 'export', 'invoice', 'table'])]
  const m = new KeywordMatcher()
  expect(m.match('write a report about my vacation', skills)).toHaveLength(0)
})

test('a name-word hit is favored over a description-word hit', () => {
  const skills = [
    // 'deploy' is in the NAME → strong signal
    mk('deploy-helper', ['deploy', 'kubernetes', 'release']),
    // 'deploy' only buried among many description tokens → weak signal
    { ...mk('notes', ['misc', 'deploy', 'random', 'stuff', 'things', 'other', 'words']) },
  ]
  const m = new KeywordMatcher()
  const res = m.match('help me deploy kubernetes', skills)
  expect(res[0].skill.name).toBe('deploy-helper')
})
