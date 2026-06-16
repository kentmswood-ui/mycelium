import type { Skill } from '../skills/skill.js'
import { tokenize } from '../skills/skill.js'

/**
 * Bilingual bridge. The cc-switch skills are English-only with empty keyword frontmatter, so a
 * Chinese task ("用 TDD 先写失败的测试再实现") shares no tokens with "test-driven-development" and
 * never matches. These aliases live in mycelium's own layer (never touching the upstream SKILL.md)
 * and are folded into each skill's keywords/tokens at match time, so a Chinese phrase can hit the
 * right English skill. Users can extend/override per skill via the `skillAliases` setting.
 *
 * Aliases are matched as bigrams (see tokenize), so a 4-char alias like "失败测试" overlaps a task
 * mentioning "先写失败的测试". Include the common phrasings a user would actually type.
 */
export const DEFAULT_ALIASES: Record<string, string[]> = {
  'test-driven-development': ['测试驱动', '先写测试', '失败测试', '红绿重构', '单元测试', 'tdd'],
  'systematic-debugging': ['调试', '排查', '修复', '报错', '故障', '定位问题', '复现'],
  'writing-plans': ['写计划', '实现计划', '方案', '规划', '设计文档', '需求拆解'],
  'executing-plans': ['执行计划', '按计划', '实施', '落地计划'],
  'subagent-driven-development': ['子代理', '并行开发', '多智能体', '分派任务'],
  'dispatching-parallel-agents': ['并行', '并发任务', '分派代理', '多任务并行'],
  brainstorming: ['头脑风暴', '构思', '探索想法', '需求探索', '创意', '功能设计'],
  'requesting-code-review': ['请求评审', '代码评审', '发起审查', '合并前检查', '提交审查'],
  'receiving-code-review': ['接收评审', '处理评审意见', '回应反馈', '评审反馈'],
  'verification-before-completion': ['完成前验证', '验收', '验证通过', '确认完成', '跑测试确认'],
  'finishing-a-development-branch': ['收尾分支', '完成分支', '合并分支', '集成工作'],
  'using-git-worktrees': ['工作树', 'worktree', '隔离工作区', '分支隔离'],
  'writing-skills': ['写技能', '创建技能', '编辑技能', 'skill 制作', '制作 skill'],
  'using-superpowers': ['超能力', '技能发现', '如何用技能'],
  'frontend-design': ['前端设计', '界面设计', '视觉设计', '排版', '审美', 'ui 风格'],
  'ui-design-brain': ['ui 组件', '界面组件', '组件库', '生产级界面', '网页界面'],
  impeccable: ['后台 ui', '界面重做', '设计重做', '精致设计', '体验优化', '动效', '配色'],
  hallmark: ['防 ai 味', '重设计', '设计审计', '新页面设计', '截图提取设计'],
  anysearch: ['搜索', '联网搜索', '网页搜索', '抓取网页', '实时检索', '批量搜索'],
  last30days: ['近30天', '最新动态', '调研话题', 'reddit', '近期研究', '热点'],
  'agent-reach': ['代理触达', 'agent reach'],
}

/**
 * Return copies of the skills with their (default + override) aliases merged into keywords and
 * tokens. Override arrays are merged with defaults, not replaced, so a user adding one alias keeps
 * the bundled ones. Skills with no alias entry pass through enriched only by overrides.
 */
export function aliasedSkills(
  skills: Skill[],
  overrides: Record<string, string[]> = {},
): Skill[] {
  return skills.map((s) => {
    const extra = [...(DEFAULT_ALIASES[s.name] ?? []), ...(overrides[s.name] ?? [])]
    if (extra.length === 0) return s
    const keywords = [...new Set([...s.keywords, ...extra])]
    const tokens = [...new Set([...s.tokens, ...extra.flatMap(tokenize)])]
    return { ...s, keywords, tokens }
  })
}
