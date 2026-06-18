import type { Skill } from '../../skills/skill.js'
import { tokenize } from '../../skills/skill.js'

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

export function skillTerms(skill: Skill): string[] {
  return [
    ...skill.tokens,
    ...tokenize(skill.name),
    ...tokenize(skill.name),
    ...tokenize(skill.name),
    ...skill.keywords.flatMap(tokenize),
    ...skill.keywords.flatMap(tokenize),
  ]
}

export function skillText(skill: Skill): string {
  return [
    skill.name,
    skill.name,
    skill.name,
    skill.description,
    ...skill.keywords,
    ...skill.keywords,
  ].join(' ')
}

export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ')
}
