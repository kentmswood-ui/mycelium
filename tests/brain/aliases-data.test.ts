import { DEFAULT_ALIASES, SKILL_KEYWORDS_EN } from '../../src/brain/aliases.js'

function expectTerms(table: Record<string, string[]>, skill: string, terms: string[]) {
  expect(table[skill]).toBeDefined()
  for (const term of terms) expect(table[skill]).toContain(term)
}

test('Chinese aliases cover train-only miss phrasing', () => {
  expect(DEFAULT_ALIASES).toBeDefined()

  expectTerms(DEFAULT_ALIASES, 'writing-plans', ['实施计划', '规划架构', '任务拆解'])
  expectTerms(DEFAULT_ALIASES, 'executing-plans', ['已有计划', '照步骤推进', '计划定稿'])
  expectTerms(DEFAULT_ALIASES, 'systematic-debugging', ['看日志', '定位根因', '复现排查'])
  expectTerms(DEFAULT_ALIASES, 'dispatching-parallel-agents', ['互不依赖', '并行调研', '并行查资料'])
  expectTerms(DEFAULT_ALIASES, 'receiving-code-review', ['收到评审意见', '核验评论'])
  expectTerms(DEFAULT_ALIASES, 'using-superpowers', ['检查适用技能', '会话起步'])
  expectTerms(DEFAULT_ALIASES, 'anysearch', ['提取 URL', '搜索引擎能力'])
  expectTerms(DEFAULT_ALIASES, 'automation-reminders', ['设置提醒', '自动提醒'])
  expectTerms(DEFAULT_ALIASES, 'presentation-deck', ['幻灯片', '演示叙事'])
  expectTerms(DEFAULT_ALIASES, 'gmail-triage', ['邮箱收件箱', '收件箱分流'])
  expectTerms(DEFAULT_ALIASES, 'code-review', ['当前工作树', '本地代码'])
})

test('English keywords cover train-only mixed-language cues', () => {
  expect(SKILL_KEYWORDS_EN).toBeDefined()

  expectTerms(SKILL_KEYWORDS_EN, 'using-superpowers', [
    'check applicable skills',
    'skill check first',
    'before answering',
  ])
  expectTerms(SKILL_KEYWORDS_EN, 'anysearch', ['url extraction', 'batch web search'])
  expectTerms(SKILL_KEYWORDS_EN, 'receiving-code-review', ['comments received', 'verify feedback'])
  expectTerms(SKILL_KEYWORDS_EN, 'executing-plans', ['existing plan', 'step by step'])
  expectTerms(SKILL_KEYWORDS_EN, 'requesting-code-review', ['request review', 'reviewer'])
})
