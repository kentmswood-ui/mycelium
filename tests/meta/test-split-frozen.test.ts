import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

interface MatcherCase {
  id: string
  split: 'train' | 'test'
}

test('matcher test split membership stays frozen', () => {
  const cases = JSON.parse(
    readFileSync(join(process.cwd(), 'tests', 'fixtures', 'matcher-cases.json'), 'utf8'),
  ) as MatcherCase[]
  const testIds = cases
    .filter((item) => item.split === 'test')
    .map((item) => item.id)
    .sort()

  expect(testIds).toHaveLength(62)
  expect(hash(testIds)).toBe('b83ffebc608c5f9625f9b6b6539fdbd4352a9ddcca118ac9713ff8f74631feb1')
})

function hash(ids: string[]) {
  return createHash('sha256').update(ids.join('\n')).digest('hex')
}
