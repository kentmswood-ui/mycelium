import { KeywordMatcher } from '../matcher.js'
import type { Matcher } from '../matcher.js'
import { Bm25Matcher } from './bm25.js'
import { CharNgramMatcher } from './char-ngram.js'
import { HybridMatcher } from './hybrid.js'

export type MatcherName = 'keyword' | 'bm25' | 'char-ngram' | 'hybrid'

export function createMatcher(name = process.env.MYCELIUM_MATCHER ?? 'keyword'): Matcher {
  switch (name) {
    case 'keyword':
      return new KeywordMatcher()
    case 'bm25':
      return new Bm25Matcher()
    case 'char-ngram':
      return new CharNgramMatcher()
    case 'hybrid':
      return new HybridMatcher()
    default:
      throw new Error(`unknown matcher "${name}"`)
  }
}
