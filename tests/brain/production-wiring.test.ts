import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { Bm25Matcher } from '../../src/brain/matchers/bm25.js'
import { CharNgramMatcher } from '../../src/brain/matchers/char-ngram.js'
import { HybridMatcher } from '../../src/brain/matchers/hybrid.js'
import { createMatcher } from '../../src/brain/matchers/factory.js'

test('production boot still wires KeywordMatcher directly', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8')

  expect(source).toContain('new KeywordMatcher()')
})

test('factory defaults to KeywordMatcher unless explicitly configured', () => {
  const previous = process.env.MYCELIUM_MATCHER
  delete process.env.MYCELIUM_MATCHER
  try {
    expect(createMatcher()).toBeInstanceOf(KeywordMatcher)
    expect(createMatcher('keyword')).toBeInstanceOf(KeywordMatcher)
  } finally {
    if (previous === undefined) delete process.env.MYCELIUM_MATCHER
    else process.env.MYCELIUM_MATCHER = previous
  }
})

test('factory can opt into candidate matchers explicitly or via env', () => {
  const previous = process.env.MYCELIUM_MATCHER
  try {
    expect(createMatcher('bm25')).toBeInstanceOf(Bm25Matcher)
    expect(createMatcher('char-ngram')).toBeInstanceOf(CharNgramMatcher)
    expect(createMatcher('hybrid')).toBeInstanceOf(HybridMatcher)

    process.env.MYCELIUM_MATCHER = 'hybrid'
    expect(createMatcher()).toBeInstanceOf(HybridMatcher)
  } finally {
    if (previous === undefined) delete process.env.MYCELIUM_MATCHER
    else process.env.MYCELIUM_MATCHER = previous
  }
})

test('factory rejects unknown matcher names', () => {
  expect(() => createMatcher('unknown')).toThrow('unknown matcher')
})
