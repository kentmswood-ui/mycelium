import { describe, it, expect } from 'vitest'
import { aliasedSkills, DEFAULT_ALIASES } from '../../src/brain/aliases.js'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import type { Skill } from '../../src/skills/skill.js'
import { tokenize } from '../../src/skills/skill.js'

function skill(name: string, description = ''): Skill {
  const tokens = [...new Set([...tokenize(name), ...tokenize(description)])]
  return { name, description, keywords: [], dir: `/x/${name}`, source: 'local', tokens }
}

describe('aliasedSkills', () => {
  it('folds bundled Chinese aliases into tokens so a Chinese task matches the English skill', () => {
    const tdd = skill('test-driven-development', 'Use when implementing any feature')
    const [enriched] = aliasedSkills([tdd])
    expect(enriched.tokens).toContain('测试') // from 单元测试/失败测试 bigrams
    const m = new KeywordMatcher()
    const res = m.match('用 TDD 先写失败的测试再实现这个功能', aliasedSkills([tdd]))
    expect(res[0]?.skill.name).toBe('test-driven-development')
  })

  it('merges user overrides with defaults rather than replacing them', () => {
    const tdd = skill('test-driven-development')
    const [enriched] = aliasedSkills([tdd], { 'test-driven-development': ['契约测试'] })
    expect(enriched.keywords).toContain('契约测试')
    expect(enriched.keywords).toContain('tdd') // default still present
  })

  it('passes a skill through unchanged when it has no alias entry and no override', () => {
    const s = skill('some-unknown-skill')
    const [out] = aliasedSkills([s])
    expect(out).toBe(s)
  })

  it('every default alias key is a plausible skill name (no stray keys)', () => {
    for (const k of Object.keys(DEFAULT_ALIASES)) {
      expect(k).toMatch(/^[a-z0-9-]+$/)
    }
  })
})
