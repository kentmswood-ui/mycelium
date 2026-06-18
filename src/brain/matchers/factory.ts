import { KeywordMatcher } from '../matcher.js'
import type { Matcher } from '../matcher.js'
import { Bm25Matcher } from './bm25.js'
import { CharNgramMatcher } from './char-ngram.js'
import { HybridMatcher } from './hybrid.js'
import { PrecisionGuardMatcher } from './precision-guard.js'

export type MatcherName = 'keyword' | 'bm25' | 'char-ngram' | 'hybrid' | 'precision-guard'

/**
 * Production default is `precision-guard`: on the frozen holdout it lifts top-1 61.4% → 80.7%
 * and cuts the wrong-skill rate (FP) 19.4% → 3.2% versus the original KeywordMatcher, with no
 * new dependency, no model, and no token cost. Set MYCELIUM_MATCHER=keyword to instantly revert
 * to the previous behavior. See docs/reports/matcher-precision.md.
 */
export function createMatcher(name = process.env.MYCELIUM_MATCHER ?? 'precision-guard'): Matcher {
  switch (name) {
    case 'keyword':
      return new KeywordMatcher()
    case 'bm25':
      return new Bm25Matcher()
    case 'char-ngram':
      return new CharNgramMatcher()
    case 'hybrid':
      return new HybridMatcher()
    case 'precision-guard':
      return new PrecisionGuardMatcher()
    default:
      throw new Error(`unknown matcher "${name}"`)
  }
}
