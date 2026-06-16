import type { Skill } from '../skills/skill.js'
import { tokenize } from '../skills/skill.js'

export interface Match {
  skill: Skill
  score: number
}

export interface Matcher {
  match(task: string, skills: Skill[], threshold?: number): Match[]
}

function taskTokens(task: string): Set<string> {
  return new Set(tokenize(task))
}

/**
 * Keyword matcher with weighted signals. The old version scored hits/skillTokens, which let a
 * skill with very few tokens win on a single incidental match, and treated a name word the same
 * as a description word. This version:
 *   - weights NAME and KEYWORD tokens higher than description tokens (they're the strongest signal)
 *   - combines precision (how much of the skill the task covers) with recall (how much of the task
 *     the skill covers), so neither a tiny skill nor a huge vague one games the score
 *   - requires a minimum number of shared tokens so a single common word can't trigger a match
 */
export class KeywordMatcher implements Matcher {
  match(task: string, skills: Skill[], threshold = 0.12): Match[] {
    const t = taskTokens(task)
    if (t.size === 0) return []
    const out: Match[] = []

    for (const s of skills) {
      const nameTokens = new Set([...tokenize(s.name), ...s.keywords.flatMap(tokenize)])
      const allTokens = new Set(s.tokens)
      if (allTokens.size === 0) continue

      let weighted = 0
      let shared = 0
      for (const tok of allTokens) {
        if (!t.has(tok)) continue
        shared++
        weighted += nameTokens.has(tok) ? 2 : 1 // name/keyword hits count double
      }
      if (shared === 0) continue

      // precision: weighted coverage of the skill's own tokens (name words boosted)
      const maxWeighted = allTokens.size + nameTokens.size // each name token can add an extra +1
      const precision = weighted / maxWeighted
      // recall: fraction of the task's tokens the skill accounts for
      const recall = shared / t.size
      // blend, leaning on precision
      const score = 0.6 * precision + 0.4 * recall
      // a single shared token only counts when the task contains the skill's FULL name
      // (e.g. task mentions "usdt-pay" → both name tokens present). A lone generic word that
      // happens to appear in the name (e.g. "report" in "pdf-report") must not trigger a match.
      const fullNameHit = nameTokens.size > 0 && [...nameTokens].every((tok) => t.has(tok))

      if (score >= threshold && (shared > 1 || fullNameHit)) {
        out.push({ skill: s, score })
      }
    }
    return out.sort((a, b) => b.score - a.score)
  }
}
