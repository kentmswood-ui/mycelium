import type { Skill } from '../skills/skill.js'
import { tokenize } from '../skills/skill.js'

export interface Match {
  skill: Skill
  score: number
}

export interface Matcher {
  match(task: string, skills: Skill[], threshold?: number): Match[]
}

/**
 * Filler words that carry no routing signal. They appear in nearly every skill description
 * ("use when ... and ... to ...") AND in an agent's restated task ("help the user decide which
 * ... to use"), so without removing them two incidental matches sneak past the threshold and a
 * medical/general question falsely matches a dev skill. Latin only — CJK bigrams self-limit.
 */
const STOPWORDS = new Set([
  // articles / conjunctions / prepositions
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from',
  'as', 'is', 'are', 'be', 'been', 'was', 'were', 'it', 'its', 'this', 'that', 'these', 'those',
  // generic verbs / pronouns / fillers common to task restatements and skill prose
  'use', 'used', 'using', 'when', 'how', 'what', 'which', 'you', 'your', 'we', 'our', 'i', 'me',
  'my', 'they', 'them', 'help', 'need', 'want', 'make', 'do', 'does', 'doing', 'get', 'got',
  'can', 'could', 'should', 'would', 'will', 'may', 'about', 'into', 'out', 'up', 'down', 'so',
  'if', 'then', 'than', 'but', 'not', 'no', 'yes', 'all', 'any', 'some', 'more', 'most', 'new',
  'one', 'two', 'other', 'others', 'work', 'task', 'thing', 'things', 'user', 'users', 'please',
  'before', 'after', 'over', 'guidance', 'helps', 'via', 'etc',
])

function contentTokens(s: string): string[] {
  return tokenize(s).filter((t) => !STOPWORDS.has(t))
}

/**
 * Keyword matcher with IDF weighting + stopword filtering + a distinctive-token gate.
 *
 * The previous version scored plain token overlap, so a skill description full of filler words
 * ("use/when/and/to") could be matched by an agent's restated task that happened to reuse those
 * same fillers — a medical question falsely matching `frontend-design`. This version:
 *   - drops stopwords from both task and skill tokens (filler can't contribute),
 *   - weights each shared token by its IDF across the skill corpus, so a word common to many
 *     skills (low signal) counts far less than a distinctive one,
 *   - keeps the name/keyword 2x boost,
 *   - and gates on at least 2 DISTINCTIVE shared tokens (or the task containing the skill's full
 *     name), so a lone generic overlap can never trigger a reuse.
 */
export class KeywordMatcher implements Matcher {
  match(task: string, skills: Skill[], threshold = 0.2): Match[] {
    const taskTokens = new Set(contentTokens(task))
    if (taskTokens.size === 0) return []

    // Document frequency per token across the skill corpus (content tokens only).
    const df = new Map<string, number>()
    const skillContent = skills.map((s) => {
      const toks = new Set(contentTokens([...s.tokens].join(' ')))
      for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1)
      return toks
    })
    const N = skills.length || 1
    // Smoothed IDF: a token in every skill ~0; a distinctive one (1 skill) is highest.
    const idf = (t: string) => Math.log((N + 1) / ((df.get(t) ?? 0) + 0.5))
    // A shared token is "distinctive" unless it's near-ubiquitous across a corpus big enough to
    // judge. With a tiny corpus (tests, fresh installs) IDF is meaningless, so any non-stopword
    // shared token counts — the stopword filter already removed the filler that caused false hits.
    const isDistinctive = (t: string) => !(N >= 5 && (df.get(t) ?? 0) / N > 0.5)

    const out: Match[] = []
    for (let i = 0; i < skills.length; i++) {
      const s = skills[i]
      const content = skillContent[i]
      if (content.size === 0) continue
      const nameTokens = new Set([
        ...contentTokens(s.name),
        ...s.keywords.flatMap((k) => contentTokens(k)),
      ])

      let weighted = 0 // IDF-weighted shared mass (name hits doubled)
      let skillMass = 0 // total IDF mass of the skill (denominator)
      let taskMass = 0 // total IDF mass of the task (denominator)
      let distinct = 0 // count of shared tokens that are reasonably distinctive

      for (const tok of content) {
        const w = idf(tok) * (nameTokens.has(tok) ? 2 : 1)
        skillMass += w
        if (taskTokens.has(tok)) {
          weighted += w
          if (isDistinctive(tok)) distinct++ // not a near-ubiquitous token (corpus-aware)
        }
      }
      for (const tok of taskTokens) taskMass += idf(tok)
      if (weighted === 0 || skillMass === 0 || taskMass === 0) continue

      const precision = weighted / skillMass
      const recall = weighted / taskMass
      const score = 0.6 * precision + 0.4 * recall

      // Full-name hit lets a single distinctive keyword match (e.g. task names "anysearch").
      const fullNameHit = nameTokens.size > 0 && [...nameTokens].every((t) => taskTokens.has(t))

      if (score >= threshold && (distinct >= 2 || fullNameHit)) {
        out.push({ skill: s, score })
      }
    }
    return out.sort((a, b) => b.score - a.score)
  }
}
