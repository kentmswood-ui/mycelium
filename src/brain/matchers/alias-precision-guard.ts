import type { Match, Matcher } from '../matcher.js'
import type { Skill } from '../../skills/skill.js'
import { PrecisionGuardMatcher, type PrecisionGuardOptions } from './precision-guard.js'

interface ForcedRule {
  skill: string
  patterns: RegExp[]
  block?: RegExp[]
}

export class AliasPrecisionGuardMatcher implements Matcher {
  private base: PrecisionGuardMatcher

  constructor(opts: PrecisionGuardOptions = {}) {
    this.base = new PrecisionGuardMatcher(opts)
  }

  match(task: string, skills: Skill[], threshold?: number): Match[] {
    const lower = task.toLowerCase()
    if (isMetaLanguageOnly(lower)) return []

    const base = this.base.match(task, skills, threshold)
    const forcedName = forcedSkill(lower)
    if (!forcedName) return base

    const skill = skills.find((item) => item.name === forcedName)
    if (!skill) return base

    const baseScore = base.find((hit) => hit.skill.name === forcedName)?.score ?? base[0]?.score ?? 0
    return [{ skill, score: Math.max(1, baseScore + 0.5) }]
  }
}

const FORCED_RULES: ForcedRule[] = [
  {
    skill: 'anysearch',
    patterns: [
      /\burl\s+(content|extraction)\b/,
      /\bextract\s+urls?\b/,
      /\bbatch\s+web\s+search\b/,
      /提取\s*url/,
      /url\s*内容/,
      /搜索引擎能力/,
      /实时搜索引擎/,
    ],
  },
  {
    skill: 'github-pr-review',
    patterns: [
      /github.*pull\s+request/,
      /github\s+pr/,
      /pr\s+review\s+thread/,
      /pull\s+request\s+review\s+comments/,
      /github.*(comments|checks|diff)/,
      /github\s+pr\s+comments/,
      /pr\s+comments.*checks/,
      /checks\s+总结/,
    ],
    block: [/not\s+github/, /不是\s*github/, /不去\s*github/],
  },
  {
    skill: 'using-git-worktrees',
    patterns: [
      /保护当前工作区/,
      /建立隔离环境/,
      /隔离环境.*动代码/,
      /开新分支做实现/,
      /用户改动.*隔离/,
      /isolated\s+worktree/,
      /dirty\s+worktree/,
    ],
  },
  {
    skill: 'code-review',
    patterns: [
      /当前工作树/,
      /本地代码/,
      /local\s+code\s+review/,
      /current\s+worktree/,
      /不去\s*github\s*pr/,
      /不是\s*github\s*pr/,
    ],
    block: [/建立隔离环境/, /开新分支做实现/, /isolated\s+worktree/],
  },
  {
    skill: 'using-superpowers',
    patterns: [
      /check\s+applicable\s+skills/,
      /skill\s+check\s+first/,
      /applicable\s+skills\s+before/,
      /invoke\s+relevant\s+skills\s+before/,
      /检查.*适用.*(skill|技能)/,
      /会话起步/,
      /新会话.*(skill|技能)/,
    ],
    block: [/skill\.md/, /create.*skill/, /write.*skill/, /写.*skill/, /创建.*技能/],
  },
  {
    skill: 'receiving-code-review',
    patterns: [
      /comments?\s+received/,
      /verify\s+feedback/,
      /pr\s+comments\s*已收到/,
      /收到评审意见/,
      /已经收到.*评审/,
      /核验评论/,
      /别人已经\s*review/,
    ],
  },
  {
    skill: 'requesting-code-review',
    patterns: [/request\s+review/, /找\s*reviewer/, /主动发起\s*review/, /主动请求.*审查/],
    block: [/comments?\s+received/, /已收到/, /收到评审/],
  },
  {
    skill: 'ui-ux-review',
    patterns: [/\bui\s+review\b/, /\bux\s+review\b/, /interface\s+audit/, /界面审查/, /体验审查/],
  },
  {
    skill: 'systematic-debugging',
    patterns: [/复现.*排查/, /定位根因/, /看日志/, /查清楚/, /root\s+cause/],
  },
  {
    skill: 'test-driven-development',
    patterns: [/red\s+test/, /先.*测试失败/, /先让测试失败/, /红绿重构/, /最小实现.*通过/],
  },
  {
    skill: 'writing-plans',
    patterns: [/实施计划/, /工程实施计划/, /规划架构/, /任务拆解/, /不要直接开始写代码/],
    block: [/已有计划/, /按已有计划/, /执行/, /不是.*实施计划/, /not.*implementation\s+plan/],
  },
  {
    skill: 'executing-plans',
    patterns: [/已有\s*plan/, /已有计划/, /按已有计划/, /照步骤推进/, /计划已经定稿/, /inline\s+execution/],
  },
  {
    skill: 'dispatching-parallel-agents',
    patterns: [
      /并行调研/,
      /互不依赖/,
      /独立查资料/,
      /并行查资料/,
      /parallel\s+agents/,
      /independent\s+vendor\s+options/,
    ],
    block: [/子代理实现/, /subagent.*implementation/],
  },
  {
    skill: 'brainstorming',
    patterns: [/探索.*想法/, /探索方案/, /想法模糊/, /问问题.*厘清/, /问好问题/, /厘清用户/, /没有规格/, /只有一个概念/, /idea.*discovery/],
  },
  {
    skill: 'writing-skills',
    patterns: [/skill\.md/, /skill\s+keywords/, /reusable\s+skill/, /agent\s+skill/, /沉淀.*skill/, /可复用技能/, /技能说明/],
    block: [/check\s+applicable\s+skills/, /skill\s+check\s+first/, /适用技能/],
  },
  {
    skill: 'presentation-deck',
    patterns: [/\bslides\b/, /幻灯片/, /演示叙事/, /presentation\s+deck/],
    block: [/不是.*幻灯片/, /不是.*slides/, /not.*slides/],
  },
  {
    skill: 'document-editing',
    patterns: [/可审阅.*文档/, /文档编辑/, /word\s+文档/, /word\s+document/],
    block: [/不是.*文档编辑/],
  },
  {
    skill: 'usdt-pay',
    patterns: [/加密货币支付/, /crypto\s+payment/, /trc20/],
  },
  {
    skill: 'automation-reminders',
    patterns: [/提醒我/, /设置提醒/, /自动提醒/, /周期监控/, /每周跟进/, /\bremind\s+me\b/, /repeat\s+weekly/, /\brecurring\s+reminder/],
  },
  {
    skill: 'data-dashboard',
    patterns: [/业务指标/, /可探索看板/, /\bdashboard\b.*\bmetrics\b/],
  },
  {
    skill: 'spreadsheet-analysis',
    patterns: [/工作簿/, /单元格/, /公式/, /表格结构/, /\bworkbook\b/, /\bspreadsheet\b/],
  },
  {
    skill: 'gmail-triage',
    patterns: [/邮箱收件箱/, /收件箱分流/, /\bgmail\s+triage\b/, /\binbox\s+triage\b/],
  },
  {
    skill: 'video-composition',
    patterns: [/视频动画/, /时间轴/, /制作.*视频/, /\bvideo\s+composition\b/, /\btimeline\s+animation\b/],
  },
  {
    skill: 'image-generation',
    patterns: [/图片素材/, /生成图片/, /\bimage\s+generation\b/, /\bimage\s+asset\b/],
  },
]

function forcedSkill(lower: string): string | null {
  for (const rule of FORCED_RULES) {
    if (rule.block?.some((pattern) => pattern.test(lower))) continue
    if (rule.patterns.some((pattern) => pattern.test(lower))) return rule.skill
  }
  return null
}

function isMetaLanguageOnly(lower: string): boolean {
  if (/parallel\s+agents|independent\s+vendor\s+options/.test(lower)) return false
  if (/github\s+pr\s+comments|pr\s+comments.*checks|github.*checks/.test(lower)) return false
  if (/只有一个概念|没有规格|问好问题|探索方案/.test(lower)) return false

  const limiting =
    /\bdo not\b|\bdon't\b|\bnot\b|\bno\b|\bwithout\b|\bonly\b|\bjust\b|不要|不是|只想|只是|只把|只列出|只告诉/.test(
      lower,
    )
  if (!limiting) return false

  return (
    /\bwhat\s+does\b|\bwhat\s+is\b|\bwhat\b.*\bmean\b|\bmeaning\b|\bmeans\b|\btranslate\b|\btranslation\b|\bsummarize\b|\bpronunciation\b|\bheadline\b|\btagline\b|\bsentence\b|\bthe\s+word\b|\bword\s+appears\b|\bonly\s+a\s+word\b/.test(
      lower,
    ) ||
    /中文意思|什么意思|是什么意思|代表什么|只是问.*是什么|只想知道.*是什么|这个词|一词|词.*意思|发音|用途|改成.*中文|改英文语法|翻译|语法|总结|解释一下|概念|一句话回答|普通语言问题|不要调用工具/.test(
      lower,
    ) ||
    /coding\s+tools|dinner\s+recipe|quick\s+dinner\s+recipe/.test(lower)
  )
}
