import { describe, it, expect } from 'vitest'
import { tokenize } from '../../src/skills/skill.js'

describe('tokenize — CJK + latin', () => {
  it('splits latin runs into whole words', () => {
    expect(tokenize('use TDD then implement')).toEqual(['use', 'tdd', 'then', 'implement'])
  })

  it('segments a CJK run into overlapping bigrams', () => {
    expect(tokenize('失败测试')).toEqual(['失败', '败测', '测试'])
  })

  it('drops a lone CJK character (too ambiguous)', () => {
    expect(tokenize('写 a')).toEqual([]) // 写 is single char, "a" is len 1
  })

  it('handles mixed latin+CJK in one chunk', () => {
    const toks = tokenize('tdd测试')
    expect(toks).toContain('tdd')
    expect(toks).toContain('测试')
  })

  it('a spaced Chinese task yields enough tokens to clear a 3-token gate', () => {
    expect(tokenize('用 TDD 先写失败的测试再实现').length).toBeGreaterThanOrEqual(3)
  })
})
