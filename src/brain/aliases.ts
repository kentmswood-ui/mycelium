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
  'test-driven-development': ['测试驱动', '先写测试', '失败测试', '测试失败', '先让测试失败', '最小实现', '红绿重构', '单元测试', 'tdd'],
  'systematic-debugging': ['调试', '排查', '修复', '报错', '故障', '定位问题', '定位根因', '根因', '复现', '复现排查', '看日志', '查清楚'],
  'writing-plans': ['写计划', '实现计划', '实施计划', '工程实施计划', '方案', '规划', '规划架构', '任务拆解', '产出计划', '设计文档', '需求拆解'],
  'executing-plans': ['执行计划', '按计划', '已有计划', '按已有计划', '逐步执行', '照步骤推进', '计划定稿', '实施', '落地计划'],
  'subagent-driven-development': ['子代理', '多个子代理', '拆给子代理', '子代理实现', '主会话整合', '并行开发', '多智能体', '分派任务'],
  'dispatching-parallel-agents': ['并行', '并发任务', '互不依赖', '并行调研', '独立查资料', '并行查资料', '分派代理', '多任务并行'],
  brainstorming: ['头脑风暴', '构思', '探索想法', '探索产品想法', '想法模糊', '问问题', '厘清用户', '边界', '需求探索', '创意', '功能设计'],
  'requesting-code-review': ['请求评审', '代码评审', '请求代码审查', '主动请求', '主动发起 review', '找 reviewer', '发起审查', '合并前检查', '提交审查'],
  'receiving-code-review': ['接收评审', '收到评审意见', '已经收到', '核验评论', '别人已经 review', '处理评论', '处理评审意见', '回应反馈', '评审反馈'],
  'verification-before-completion': ['完成前验证', '验收', '验证通过', '确认完成', '完成声明', '跑测试确认', '跑验证命令', '命令输出证明', '先用命令证明', '真的通过'],
  'finishing-a-development-branch': ['收尾分支', '完成分支', '合并分支', '合并收尾', '收尾选项', '清理分支', '实现完成后', '集成工作'],
  'using-git-worktrees': ['工作树', 'worktree', '隔离工作区', '隔离目录', '保护当前工作区', '用户改动', '开新分支做实现', '分支隔离'],
  'writing-skills': ['写技能', '创建技能', '编辑技能', 'skill 制作', '制作 skill', '技能说明', '可复用技能'],
  'using-superpowers': ['超能力', '技能发现', '检查适用技能', '适用技能', '会话起步', '如何用技能'],
  'frontend-design': ['前端设计', '界面设计', '视觉设计', '排版', '审美', 'ui 风格', '新建页面'],
  'ui-design-brain': ['ui 组件', '界面组件', '组件库', '组件模式', '生产级界面', '生产级 UI', 'SaaS 表单', '导航', '网页界面'],
  impeccable: ['后台 ui', '界面重做', '设计重做', '精致设计', '体验优化', '动效', '配色'],
  hallmark: ['防 ai 味', '重设计', '设计审计', '新页面设计', '截图提取设计'],
  anysearch: ['搜索', '联网搜索', '网页搜索', '抓取网页', '实时检索', '批量搜索', 'URL 内容', '提取 URL', '搜索引擎能力'],
  last30days: ['近30天', '最新动态', '调研话题', 'reddit', '近期研究', '热点'],
  'agent-reach': ['代理触达', 'agent reach'],
  'automation-reminders': ['提醒我', '设置提醒', '自动提醒', '周期监控', '每周跟进'],
  'presentation-deck': ['幻灯片', '演示叙事'],
  'image-generation': ['图片素材', '生成图片'],
  'video-composition': ['视频动画', '时间轴', '制作视频'],
  'gmail-triage': ['邮箱收件箱', '收件箱分流'],
  'usdt-pay': ['加密货币支付'],
  'data-dashboard': ['业务指标', '可探索看板'],
  'spreadsheet-analysis': ['工作簿', '单元格', '公式', '表格结构'],
  'document-editing': ['可审阅文档', '文档编辑', 'Word 文档'],
  'ui-ux-review': ['界面审查', '体验审查'],
  'code-review': ['本地代码', '当前工作树', '代码风险', '缺测试'],
  'loop-goal': ['循环', '跑到完成', '自动迭代', '反复验证', '迭代直到完成', '自治循环', '一直做到', '直到通过', '目标循环', '运行到完成'],
}

/**
 * Curated ENGLISH trigger keywords per skill. The matcher otherwise leans on each skill's prose
 * description, which is full of filler ("use when ... and ... to ...") — low signal. These are the
 * high-signal terms a task would actually contain, folded in as name-weighted keywords so the right
 * skill wins on the words that matter, not on incidental filler overlap.
 */
export const SKILL_KEYWORDS_EN: Record<string, string[]> = {
  'test-driven-development': ['tdd', 'failing', 'unit', 'red-green', 'red test', 'refactor', 'spec-first', 'minimal implementation'],
  'systematic-debugging': ['debug', 'bug', 'stacktrace', 'traceback', 'reproduce', 'rootcause', 'root cause', 'crash'],
  'writing-plans': ['plan', 'spec', 'requirements', 'breakdown', 'design-doc', 'roadmap', 'implementation plan'],
  'executing-plans': ['execute', 'checkpoint', 'implement-plan', 'existing plan', 'step by step', 'task checklist', 'inline execution'],
  'subagent-driven-development': ['subagent', 'fresh subagents', 'multi-part plan', 'parallel', 'orchestrate'],
  'dispatching-parallel-agents': ['parallel', 'parallel agents', 'concurrent', 'dispatch', 'fanout', 'vendor options'],
  brainstorming: ['brainstorm', 'ideate', 'explore', 'intent', 'idea discovery'],
  'requesting-code-review': ['review', 'merge', 'pullrequest', 'request review', 'reviewer'],
  'receiving-code-review': ['feedback', 'review', 'critique', 'comments received', 'verify feedback'],
  'verification-before-completion': ['verify', 'verification', 'confirm', 'validate', 'command output'],
  'finishing-a-development-branch': ['branch', 'merge', 'integrate', 'finish', 'cleanup branch'],
  'using-git-worktrees': ['worktree', 'git', 'isolated', 'workspace', 'dirty worktree'],
  'writing-skills': ['skill', 'authoring', 'create-skill', 'skill keywords'],
  'using-superpowers': ['superpowers', 'discovery', 'check applicable skills', 'skill check first', 'before answering'],
  'frontend-design': ['frontend', 'design', 'visual', 'typography', 'aesthetic', 'layout', 'new saas ui page', 'build ui page'],
  'ui-design-brain': ['ui', 'component', 'interface', 'widget', 'production ui'],
  impeccable: ['redesign', 'polish', 'animation', 'oklch', 'color', 'motion', 'cockpit'],
  hallmark: ['redesign', 'audit', 'aislop', 'screenshot', 'extraction'],
  anysearch: ['search', 'web', 'scrape', 'extract', 'crawl', 'url extraction', 'batch web search'],
  last30days: ['recent', 'reddit', 'trend', 'news', 'research'],
  'agent-reach': ['research', 'social', 'github', 'rss', 'reach'],
  'automation-reminders': ['reminder', 'recurring', 'monitor'],
  'presentation-deck': ['slides', 'deck', 'presentation'],
  'image-generation': ['image generation', 'image asset'],
  'video-composition': ['video composition', 'timeline animation'],
  'gmail-triage': ['gmail triage', 'inbox triage'],
  'usdt-pay': ['crypto payment', 'trc20'],
  'data-dashboard': ['dashboard', 'business metrics'],
  'spreadsheet-analysis': ['workbook', 'spreadsheet', 'formula'],
  'document-editing': ['document editing', 'word document'],
  'ui-ux-review': ['ui review', 'ux review', 'interface audit'],
  'code-review': ['local code review', 'current worktree'],
  'github-pr-review': ['github pr comments', 'checks summary'],
  'loop-goal': ['loop', 'run-until-done', 'autonomous loop', 'iterate', 'iterative', 'until tests pass', 'until complete', 'keep working', 'verifiable goal', 'agent loop', 'run until green'],
}

/** Coarse domain per skill. NOT a hard gate (a task isn't domain-classified) — surfaced in the
 *  cockpit for filtering/grouping and available for future routing. */
export type Domain = 'dev' | 'design' | 'research' | 'meta'
export const SKILL_DOMAINS: Record<string, Domain> = {
  'test-driven-development': 'dev', 'systematic-debugging': 'dev', 'writing-plans': 'meta',
  'executing-plans': 'meta', 'subagent-driven-development': 'dev', 'dispatching-parallel-agents': 'dev',
  brainstorming: 'meta', 'requesting-code-review': 'dev', 'receiving-code-review': 'dev',
  'verification-before-completion': 'dev', 'finishing-a-development-branch': 'dev',
  'using-git-worktrees': 'dev', 'writing-skills': 'meta', 'using-superpowers': 'meta',
  'frontend-design': 'design', 'ui-design-brain': 'design', impeccable: 'design', hallmark: 'design',
  anysearch: 'research', last30days: 'research', 'agent-reach': 'research',
  'loop-goal': 'meta',
}

/**
 * Return copies of the skills enriched for matching: bundled Chinese aliases + curated English
 * keywords + per-skill user overrides, all merged into keywords (name-weighted) and tokens.
 * Overrides merge with bundled, never replace. Skills with no entry pass through unchanged.
 */
export function aliasedSkills(
  skills: Skill[],
  overrides: Record<string, string[]> = {},
): Skill[] {
  return skills.map((s) => {
    const extra = [
      ...(DEFAULT_ALIASES[s.name] ?? []),
      ...(SKILL_KEYWORDS_EN[s.name] ?? []),
      ...(overrides[s.name] ?? []),
    ]
    if (extra.length === 0) return s
    const keywords = [...new Set([...s.keywords, ...extra])]
    const tokens = [...new Set([...s.tokens, ...extra.flatMap(tokenize)])]
    return { ...s, keywords, tokens }
  })
}
