import type { Skill } from '../../src/skills/skill.js'
import { cosine, normalizeVector, PrecomputedEmbeddingMatcher } from '../../scripts/embedding-eval/embedding-matcher.js'

function skill(name: string): Skill {
  return {
    name,
    description: '',
    keywords: [],
    dir: '',
    source: 'test',
    tokens: [name],
  }
}

test('normalizeVector returns a unit vector and leaves zero vectors stable', () => {
  expect(normalizeVector([3, 4])).toEqual([0.6, 0.8])
  expect(normalizeVector([0, 0])).toEqual([0, 0])
})

test('cosine scores aligned vectors above unrelated vectors', () => {
  expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
  expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
})

test('PrecomputedEmbeddingMatcher ranks by cosine and applies the threshold', () => {
  const skills = [skill('alpha'), skill('beta'), skill('gamma')]
  const matcher = new PrecomputedEmbeddingMatcher({
    queryVectors: new Map([['route this task', normalizeVector([1, 0])]]),
    skillVectors: new Map([
      ['alpha', normalizeVector([0.9, 0.1])],
      ['beta', normalizeVector([0.4, 0.6])],
      ['gamma', normalizeVector([0, 1])],
    ]),
    threshold: 0.8,
  })

  const hits = matcher.match('route this task', skills)

  expect(hits.map((hit) => hit.skill.name)).toEqual(['alpha'])
  expect(hits[0].score).toBeGreaterThan(0.99)
})
