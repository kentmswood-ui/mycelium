import type { Skill } from '../../../src/skills/skill.js'
import { tokenize } from '../../../src/skills/skill.js'
import { Bm25Matcher } from '../../../src/brain/matchers/bm25.js'
import { CharNgramMatcher } from '../../../src/brain/matchers/char-ngram.js'
import { ConservativeCharMatcher } from '../../../src/brain/matchers/conservative-char.js'
import { HybridMatcher } from '../../../src/brain/matchers/hybrid.js'

function skill(name: string, description: string, keywords: string[] = []): Skill {
  return {
    name,
    description,
    keywords,
    dir: '',
    source: 'test',
    tokens: [...new Set([...tokenize(name), ...tokenize(description), ...keywords.flatMap(tokenize)])],
  }
}

const processSkills = [
  skill('writing-plans', 'Create implementation plans from specs and requirements', [
    'plan',
    'roadmap',
    '实现计划',
  ]),
  skill('test-driven-development', 'Use failing tests and red green refactor workflow', [
    'tdd',
    'test',
    '红绿重构',
  ]),
  skill('systematic-debugging', 'Debug failures by reading logs and reproducing bugs', [
    'debug',
    'repro',
    '日志',
  ]),
]

test('BM25 ranks the implementation-plan skill above nearby process skills', () => {
  const result = new Bm25Matcher().match(
    'write an implementation roadmap from the requirements before coding',
    processSkills,
  )

  expect(result[0].skill.name).toBe('writing-plans')
  expect(result.map((hit) => hit.skill.name)).not.toContain('test-driven-development')
})

test('character n-grams recover from misspelled PR review wording', () => {
  const skills = [
    skill('github-pr-review', 'Inspect GitHub pull request review comments checks and diff', [
      'github',
      'pull request',
      'comments',
    ]),
    skill('code-review', 'Review local code for bugs regressions risks and missing tests', [
      'local code',
      'findings',
    ]),
  ]

  const result = new CharNgramMatcher().match('githb pul request reveiw coments and cheks', skills)

  expect(result[0].skill.name).toBe('github-pr-review')
})

test('conservative character matcher keeps only the best typo-tolerant hit', () => {
  const skills = [
    skill('github-pr-review', 'Inspect GitHub pull request review comments checks and diff', [
      'github',
      'pull request',
      'comments',
    ]),
    skill('code-review', 'Review local code for bugs regressions risks and missing tests', [
      'local code',
      'findings',
    ]),
  ]

  const result = new ConservativeCharMatcher().match('githb pul request reveiw coments and cheks', skills)

  expect(result).toHaveLength(1)
  expect(result[0].skill.name).toBe('github-pr-review')
})

test('hybrid matcher can combine typo-tolerant and keyword signals', () => {
  const result = new HybridMatcher({ threshold: 0.35 }).match(
    'implemntation plan roadmp from product requirments',
    processSkills,
  )

  expect(result[0].skill.name).toBe('writing-plans')
})

test('candidate matchers do not match an unrelated casual request', () => {
  const task = 'recommend a tofu dinner recipe for tonight'

  expect(new Bm25Matcher().match(task, processSkills)).toHaveLength(0)
  expect(new CharNgramMatcher().match(task, processSkills)).toHaveLength(0)
  expect(new ConservativeCharMatcher().match(task, processSkills)).toHaveLength(0)
  expect(new HybridMatcher().match(task, processSkills)).toHaveLength(0)
})
