import type { Match, Matcher } from '../matcher.js'
import type { Skill } from '../../skills/skill.js'
import { CharNgramMatcher, type CharNgramOptions } from './char-ngram.js'

export interface ConservativeCharOptions extends CharNgramOptions {
  maxResults?: number
}

/**
 * Recall-friendly but conservative candidate: use low-threshold character n-grams for typo
 * tolerance, then emit only the best hit so near-neighbor skills do not pollute top-3.
 */
export class ConservativeCharMatcher implements Matcher {
  private inner: CharNgramMatcher
  private defaultThreshold: number
  private maxResults: number

  constructor(opts: ConservativeCharOptions = {}) {
    const { maxResults = 1, threshold = 0.08, ...charOpts } = opts
    this.inner = new CharNgramMatcher({ ...charOpts, threshold })
    this.defaultThreshold = threshold
    this.maxResults = maxResults
  }

  match(task: string, skills: Skill[], threshold = this.defaultThreshold): Match[] {
    return this.inner.match(task, skills, threshold).slice(0, this.maxResults)
  }
}
