import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

interface MatcherCase {
  id: string
  split: 'train' | 'test'
}

test('legacy matcher test split membership stays frozen while new cases may extend the exam', () => {
  const cases = JSON.parse(
    readFileSync(join(process.cwd(), 'tests', 'fixtures', 'matcher-cases.json'), 'utf8'),
  ) as MatcherCase[]
  const testIds = cases
    .filter((item) => item.split === 'test')
    .map((item) => item.id)
    .sort()

  const legacyTestIds = testIds.filter((id) => !id.startsWith('alias-'))

  expect(legacyTestIds).toHaveLength(62)
  expect(hash(legacyTestIds)).toBe('b83ffebc608c5f9625f9b6b6539fdbd4352a9ddcca118ac9713ff8f74631feb1')
  expect(testIds.length).toBeGreaterThanOrEqual(62)
})

function hash(ids: string[]) {
  return createHash('sha256').update(ids.join('\n')).digest('hex')
}
