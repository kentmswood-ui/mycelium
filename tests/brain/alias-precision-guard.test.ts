import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AliasPrecisionGuardMatcher } from '../../src/brain/matchers/alias-precision-guard.js'
import { aliasedSkills } from '../../src/brain/aliases.js'
import { parseSkill, tokenize, type Skill } from '../../src/skills/skill.js'

interface SnapshotSkill {
  name: string
  description: string
  keywords: string[]
}

function loadSkills() {
  const root = process.cwd()
  const snapshots = JSON.parse(
    readFileSync(join(root, 'tests', 'fixtures', 'real-skills.snapshot.json'), 'utf8'),
  ) as SnapshotSkill[]
  const snapshotSkills: Skill[] = snapshots.map((skill) => ({
    ...skill,
    dir: '<snapshot>',
    source: 'snapshot',
    tokens: [
      ...new Set([
        ...tokenize(skill.name),
        ...tokenize(skill.description),
        ...skill.keywords.flatMap(tokenize),
      ]),
    ],
  }))
  const fixtureRoot = join(root, 'tests', 'fixtures', 'skills')
  const fixtureSkills = readdirSync(fixtureRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseSkill(join(fixtureRoot, entry.name)))
    .filter((skill): skill is Skill => skill !== null)

  const byName = new Map<string, Skill>()
  for (const skill of [...snapshotSkills, ...fixtureSkills]) byName.set(skill.name, skill)
  return aliasedSkills([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)))
}

test('alias precision guard rejects meta-language negatives mentioning skill terms', () => {
  const matcher = new AliasPrecisionGuardMatcher()
  const skills = loadSkills()
  const tasks = [
    '不要联网搜索，只把下面这段英文改成更自然的中文',
    '我不是要 Hallmark audit，只想知道 hallmark 这个词的发音',
    '不要制作视频，只列出 video composition 的中文意思',
    '不要开 worktree，只告诉我 git worktree 这个命令的用途',
    '这不是 UI audit，我只是问 UI 这两个字母代表什么',
    '只是问 USDT 是什么，不要设计支付集成',
    'What does PR mean in public relations, not GitHub?',
    'Recommend a quick dinner recipe without using any coding tools',
    '请总结这句话里的 reminder 一词，不要给我设置提醒',
    '不要生成图片，解释一下 image generation 的概念',
  ]

  for (const task of tasks) expect(matcher.match(task, skills)).toEqual([])
})

test('alias precision guard reroutes train neighbor conflicts', () => {
  const matcher = new AliasPrecisionGuardMatcher()
  const skills = loadSkills()
  const cases: Array<[string, string]> = [
    ['只看当前工作树，不去 GitHub PR', 'code-review'],
    ['Please check applicable skills before answering', 'using-superpowers'],
    ['PR comments 已收到，先判断哪些合理，给我可执行结果', 'receiving-code-review'],
    ['UI review', 'ui-ux-review'],
    ['Please run web search and URL extraction', 'anysearch'],
    ['当前工作树可能有用户改动，我要开新分支做实现，请先建立隔离环境再动代码', 'using-git-worktrees'],
    ['Inspect GitHub pull request review comments, checks, and diff', 'github-pr-review'],
    ['去 GitHub 看 PR review thread，不是本地代码审查', 'github-pr-review'],
    ['我需要 GitHub PR comments 和 checks 总结，不是相邻的另一类流程', 'github-pr-review'],
    ['我只有一个概念，还没有规格；请先问好问题并探索方案，不要写实现计划', 'brainstorming'],
  ]

  for (const [task, expected] of cases) {
    expect(matcher.match(task, skills)[0]?.skill.name).toBe(expected)
  }
})

test('alias precision guard recovers remaining lexical train misses', () => {
  const matcher = new AliasPrecisionGuardMatcher()
  const skills = loadSkills()
  const cases: Array<[string, string]> = [
    ['请帮我复现并排查这个故障', 'systematic-debugging'],
    ['先 red test 再 implementation，给我可执行结果', 'test-driven-development'],
    ['目标是 slides，不是 Word 文档', 'presentation-deck'],
    ['这是加密货币支付，不是普通文档解释', 'usdt-pay'],
    ['请帮我先检查有没有适用技能', 'using-superpowers'],
    ['交付物是可审阅的文档，不是幻灯片或数据表', 'document-editing'],
    ['Research three independent vendor options in parallel agents and summarize; do not edit the codebase', 'dispatching-parallel-agents'],
    ['目标是沉淀 agent skill，不是项目实施计划', 'writing-skills'],
    ['对象是邮箱收件箱，不是文档编辑', 'gmail-triage'],
    ['我需要 remind me tomorrow and repeat weekly，不是相邻的另一类流程', 'automation-reminders'],
  ]

  for (const [task, expected] of cases) {
    expect(matcher.match(task, skills)[0]?.skill.name).toBe(expected)
  }
})
