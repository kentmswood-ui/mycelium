import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { KeywordMatcher } from '../../../src/brain/matcher.js'
import { PrecisionGuardMatcher } from '../../../src/brain/matchers/precision-guard.js'
import { evaluateMatcher, selectCases, type MatcherCase } from '../../../src/brain/matchers/harness.js'
import { parseSkill, tokenize, type Skill } from '../../../src/skills/skill.js'

interface SnapshotSkill {
  name: string
  description: string
  keywords: string[]
}

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

const routingSkills = [
  skill('github-pr-review', 'Inspect GitHub pull request review comments checks and diff', [
    'github',
    'pull request',
    'pr review',
  ]),
  skill('code-review', 'Review local code for bugs regressions risks and missing tests', [
    'local code',
    'code review',
  ]),
  skill('web-research', 'Search the web for sources and citations', ['web search', 'research']),
  skill('agent-reach', 'Research across Reddit X YouTube Bilibili Xiaohongshu and web sources', [
    'reddit',
    'x',
    'youtube',
    '小红书',
  ]),
  skill('last30days', 'Research the last 30 days across Reddit X and web trends and write prompts', [
    'last 30 days',
    '最近 30 天',
    'trend research',
  ]),
  skill('browser-automation', 'Control a local browser page localhost app screenshot or interaction', [
    'localhost',
    'browser interaction',
    '截图',
  ]),
  skill('hallmark', 'Audit AI-looking design and produce a distinctive redesign direction', [
    'hallmark audit',
    'anti-ai design',
  ]),
  skill('frontend-design', 'Design and build a new frontend page with layout and components', [
    'new ui',
    'build page',
  ]),
  skill('ui-ux-review', 'Review existing UI screenshots for spacing accessibility and hierarchy', [
    'ui audit',
    'screenshot review',
  ]),
  skill('impeccable', 'Polish an existing interface to improve hierarchy responsiveness and motion', [
    'polish ui',
    '打磨',
  ]),
  skill('git-worktree', 'Run git worktree add and related git worktree commands', ['git worktree add']),
  skill('using-git-worktrees', 'Create isolated worktrees before feature work to avoid dirty state', [
    'isolated worktree',
    'feature work',
  ]),
  skill('data-dashboard', 'Build analytics dashboards and charts', ['dashboard']),
  skill('test-driven-development', 'Use failing tests before implementation', ['tdd']),
]

test('rejects meta-language tasks that mention skill words but ask for explanation or translation', () => {
  const matcher = new PrecisionGuardMatcher()

  expect(
    matcher.match(
      'Do not use test-driven-development here; just explain in one paragraph what TDD means',
      routingSkills,
    ),
  ).toHaveLength(0)
  expect(
    matcher.match('The word dashboard appears in this sentence; summarize it, do not build analytics UI', routingSkills),
  ).toHaveLength(0)
  expect(
    matcher.match('GitHub is only a word in this headline; translate the sentence, do not open PRs or review code', routingSkills),
  ).toHaveLength(0)
})

test('prefers local code review over GitHub PR review when the task excludes GitHub', () => {
  const result = new PrecisionGuardMatcher().match(
    '这不是 GitHub PR；只看当前工作树里的代码，按严重程度列发现',
    routingSkills,
  )

  expect(result).toHaveLength(1)
  expect(result[0].skill.name).toBe('code-review')
})

test('keeps platform-wide research separate from plain web research', () => {
  const result = new PrecisionGuardMatcher().match(
    'Research this topic across Reddit, X, YouTube, and web sources',
    routingSkills,
  )

  expect(result).toHaveLength(1)
  expect(result[0].skill.name).toBe('agent-reach')
})

test('keeps last-30-days trend research separate from broad platform research', () => {
  const result = new PrecisionGuardMatcher().match(
    '研究最近 30 天 Reddit、X 和网页上的趋势，并写可复制 prompt',
    routingSkills,
  )

  expect(result).toHaveLength(1)
  expect(result[0].skill.name).toBe('last30days')
})

test('does not treat negated localhost browser wording as a local browser task', () => {
  const result = new PrecisionGuardMatcher().match(
    '要联网找资料和来源；不是打开本地 localhost 页面截图',
    routingSkills,
  )

  expect(result).toHaveLength(1)
  expect(result[0].skill.name).toBe('web-research')
})

test('routes Hallmark audit wording to the Hallmark design skill', () => {
  const result = new PrecisionGuardMatcher().match('Hallmark audit this website and redesign direction', routingSkills)

  expect(result).toHaveLength(1)
  expect(result[0].skill.name).toBe('hallmark')
})

test('separates new UI design, UI review, and UI polish minimal pairs', () => {
  const matcher = new PrecisionGuardMatcher()

  expect(matcher.match('build new SaaS UI page，不是 review existing screenshot', routingSkills)[0].skill.name).toBe(
    'frontend-design',
  )
  expect(matcher.match('已有屏幕，不要新建页面；只输出问题、风险和改进建议', routingSkills)[0].skill.name).toBe(
    'ui-ux-review',
  )
  expect(matcher.match('polish UI', routingSkills)[0].skill.name).toBe('impeccable')
})

test('routes isolated worktree process requests away from raw git worktree commands', () => {
  const matcher = new PrecisionGuardMatcher()

  expect(matcher.match('isolated worktree', routingSkills)[0].skill.name).toBe('using-git-worktrees')
  expect(matcher.match('git worktree add', routingSkills)[0].skill.name).toBe('git-worktree')
})

test('train split FP improves over KeywordMatcher while train top-1 stays above baseline', () => {
  const skills = loadCorpus()
  const cases = selectCases(
    JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'matcher-cases.json'), 'utf8')) as MatcherCase[],
    'train',
  )

  const keyword = evaluateMatcher('keyword', new KeywordMatcher(), skills, cases).metrics
  const guarded = evaluateMatcher('precision-guard', new PrecisionGuardMatcher(), skills, cases).metrics

  expect(guarded.top1Accuracy).toBeGreaterThanOrEqual(keyword.top1Accuracy)
  expect(guarded.falsePositiveRate).toBeLessThan(keyword.falsePositiveRate)
})

function loadCorpus() {
  const snapshots = (
    JSON.parse(
      readFileSync(join(process.cwd(), 'tests', 'fixtures', 'real-skills.snapshot.json'), 'utf8'),
    ) as SnapshotSkill[]
  ).map(snapshotToSkill)
  return mergeSkills([...snapshots, ...loadFixtureSkills()])
}

function snapshotToSkill(item: SnapshotSkill): Skill {
  return {
    name: item.name,
    description: item.description,
    keywords: item.keywords,
    dir: `snapshot:${item.name}`,
    source: 'cc-switch-snapshot',
    tokens: uniqueTokens(item),
  }
}

function loadFixtureSkills() {
  const skillsRoot = join(process.cwd(), 'tests', 'fixtures', 'skills')
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseSkill(join(skillsRoot, entry.name)))
    .filter((item): item is Skill => item !== null)
}

function mergeSkills(skills: Skill[]): Skill[] {
  const byName = new Map<string, Skill>()
  for (const item of skills) {
    const prev = byName.get(item.name)
    if (!prev) {
      byName.set(item.name, item)
      continue
    }
    byName.set(item.name, {
      ...prev,
      description: `${prev.description}\n${item.description}`.trim(),
      keywords: [...new Set([...prev.keywords, ...item.keywords])].sort(),
      tokens: [...new Set([...prev.tokens, ...item.tokens])],
    })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function uniqueTokens(item: Pick<Skill, 'name' | 'description' | 'keywords'>) {
  return [
    ...new Set([
      ...tokenize(item.name),
      ...tokenize(item.description),
      ...item.keywords.flatMap(tokenize),
    ]),
  ]
}
