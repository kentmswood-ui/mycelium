import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { createMatcher } from '../../src/brain/matchers/factory.js'

test('production boot still wires KeywordMatcher directly', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8')

  expect(source).toContain('new KeywordMatcher()')
})

test('candidate matcher factory defaults to KeywordMatcher', () => {
  const previous = process.env.MYCELIUM_MATCHER
  delete process.env.MYCELIUM_MATCHER
  try {
    expect(createMatcher()).toBeInstanceOf(KeywordMatcher)
  } finally {
    if (previous === undefined) delete process.env.MYCELIUM_MATCHER
    else process.env.MYCELIUM_MATCHER = previous
  }
})
