import type { Match, Matcher } from '../matcher.js'
import type { Skill } from '../../skills/skill.js'
import { CharNgramMatcher, type CharNgramOptions } from './char-ngram.js'

export interface PrecisionGuardOptions extends CharNgramOptions {
  candidateLimit?: number
  maxResults?: number
}

/**
 * Conservative char n-gram retrieval plus lexical domain guards for known FP clusters.
 *
 * This stays deliberately narrow: it does not try to understand arbitrary language, only to
 * reject meta-language non-workflow requests and rerank tight matcher pairs when the task text
 * carries explicit lexical anchors.
 */
export class PrecisionGuardMatcher implements Matcher {
  private inner: CharNgramMatcher
  private defaultThreshold: number
  private candidateLimit: number
  private maxResults: number

  constructor(opts: PrecisionGuardOptions = {}) {
    const { candidateLimit = 8, maxResults = 1, threshold = 0.08, ...charOpts } = opts
    this.inner = new CharNgramMatcher({ ...charOpts, threshold })
    this.defaultThreshold = threshold
    this.candidateLimit = candidateLimit
    this.maxResults = maxResults
  }

  match(task: string, skills: Skill[], threshold = this.defaultThreshold): Match[] {
    const ctx = classifyTask(task)
    if (ctx.metaOnly) return []

    const base = this.inner
      .match(task, skills, threshold)
      .slice(0, this.candidateLimit)
    const candidates = addPreferredSkills(base, skills, ctx)

    return candidates
      .filter((hit) => !isBlocked(hit.skill.name, ctx))
      .map((hit) => ({ hit, adjusted: hit.score + bonusFor(hit.skill.name, ctx) }))
      .sort((a, b) => b.adjusted - a.adjusted || b.hit.score - a.hit.score)
      .slice(0, this.maxResults)
      .map(({ hit, adjusted }) => ({ skill: hit.skill, score: adjusted }))
  }
}

interface TaskContext {
  lower: string
  metaOnly: boolean
  last30Days: boolean
  hallmark: boolean
  localCodeReview: boolean
  platformResearch: boolean
  onlineResearch: boolean
  localBrowserWork: boolean
  newUiBuild: boolean
  existingUiReview: boolean
  polishUi: boolean
  isolatedWorktree: boolean
  rawGitWorktree: boolean
}

function classifyTask(task: string): TaskContext {
  const lower = task.toLowerCase()
  const hasNegation = /\bdo not\b|\bdon't\b|\bnot\b|不要|不是|只想|只是|\bonly\b|\bjust\b/.test(lower)
  const metaOnly =
    /是什么意思|怎么读|改英文语法|英文语法|语法/.test(lower) ||
    (hasNegation && /\bexplain\b|\btranslate\b|\btranslation\b|\bsummarize\b|\bheadline\b|\bsentence\b|\bword\b|解释|翻译|总结|概括/.test(lower))
  const last30Days = /\blast\s*30\s*days\b|最近\s*30\s*天|近\s*30\s*天/.test(lower)
  const hallmark = /\bhallmark\b|anti-ai|反\s*ai|模板化|设计痕迹|redesign direction/.test(lower)

  const platformCount = countMatches(lower, [
    /\breddit\b/,
    /\btwitter\b/,
    /\bx\b/,
    /\byoutube\b/,
    /b站|bilibili/,
    /小红书|xiaohongshu|xhs/,
  ])
  const localCodeContext = /\blocal\b|\bcurrent worktree\b|当前工作树|本地|不要去\s*github|不是\s*github\s*pr|不是\s*github/.test(lower)
  const codeReviewIntent = /\bcode review\b|\breview code\b|\blocal code\b|审.*代码|代码.*(严重|发现|风险|bug|缺测试)|按严重程度列发现/.test(lower)
  const localCodeReview = localCodeContext && codeReviewIntent
  const platformResearch =
    !last30Days &&
    (platformCount >= 2 ||
      (platformCount >= 1 && /调研|research/.test(lower)) ||
      /全网调研|跨平台|reddit.*x.*web|reddit.*youtube|外部链接|平台名/.test(lower))
  const onlineResearch =
    /联网|找资料|来源|source|sources|web search|search the web|research this topic|全网/.test(lower)
  const negatedLocalBrowser = /不是.*(localhost|截图|浏览器|本地)|not.*(localhost|browser|screenshot)|不要.*(localhost|截图|浏览器)/.test(lower)
  const localBrowserWork = !negatedLocalBrowser && /localhost|本地应用|真实浏览器|浏览器交互|screenshot|截图/.test(lower)
  const explicitNotNewUi = /不要新建|不是.*新建|not.*new|not.*build/.test(lower)
  const newUiBuild = !explicitNotNewUi && /\bnew\b.*\bui\b|\bbuild\b.*\bui\b|\bbuild\b.*\bpage\b|\bdesign\b.*\bnew\b|从零|新建页面|新的前端|新的页面/.test(
      lower,
    )
  const uiContext = /\bui\b|\bux\b|\bapp\b|\bscreenshot\b|界面|页面|屏幕|视觉|层级|可用性|响应式|微交互|截图/.test(lower)
  const existingUiReview =
    !hallmark && !negatedLocalBrowser && uiContext && /\bexisting\b|\bscreenshot\b|\baudit\b|\breview existing\b|已有|现有|审查|问题|风险|改进建议|截图/.test(
      lower,
    )
  const polishUi = /\bpolish\b|打磨|更清晰|更高级|视觉层级|响应式|微交互/.test(lower)
  const isolatedWorktree = /\bisolated worktree\b|隔离\s*worktree|feature work.*worktree|worktree.*dirty/.test(lower)
  const rawGitWorktree = /\bgit worktree add\b|\bgit worktree\b.*\b(create|command|commands)\b|创建一个分支目录/.test(lower)

  return {
    lower,
    metaOnly,
    last30Days,
    hallmark,
    localCodeReview,
    platformResearch,
    onlineResearch,
    localBrowserWork,
    newUiBuild,
    existingUiReview,
    polishUi,
    isolatedWorktree,
    rawGitWorktree,
  }
}

function addPreferredSkills(candidates: Match[], skills: Skill[], ctx: TaskContext) {
  const out = [...candidates]
  const present = new Set(out.map((hit) => hit.skill.name))
  const names = preferredSkillNames(ctx)
  for (const name of names) {
    if (present.has(name)) continue
    const skill = skills.find((item) => item.name === name)
    if (!skill) continue
    out.push({ skill, score: 0 })
    present.add(name)
  }
  return out
}

function preferredSkillNames(ctx: TaskContext) {
  const names: string[] = []
  if (ctx.last30Days) names.push('last30days')
  if (ctx.hallmark) names.push('hallmark')
  if (ctx.localCodeReview) names.push('code-review')
  if (ctx.platformResearch) names.push('agent-reach')
  if (ctx.onlineResearch && !ctx.localBrowserWork) names.push('web-research')
  if (ctx.localBrowserWork) names.push('browser-automation')
  if (ctx.newUiBuild) names.push('frontend-design')
  if (ctx.existingUiReview) names.push('ui-ux-review')
  if (ctx.polishUi) names.push('impeccable')
  if (ctx.isolatedWorktree) names.push('using-git-worktrees')
  if (ctx.rawGitWorktree) names.push('git-worktree')
  return names
}

function isBlocked(skillName: string, ctx: TaskContext) {
  if (ctx.localCodeReview && skillName === 'github-pr-review') return true
  if (ctx.last30Days && skillName === 'agent-reach') return true
  if (ctx.hallmark && (skillName === 'ui-ux-review' || skillName === 'frontend-design' || skillName === 'impeccable')) {
    return true
  }
  if (ctx.platformResearch && skillName === 'web-research') return true
  if (ctx.onlineResearch && !ctx.localBrowserWork && skillName === 'browser-automation') return true
  if (ctx.localBrowserWork && skillName === 'web-research') return true
  if (ctx.newUiBuild && skillName === 'ui-ux-review') return true
  if (ctx.existingUiReview && !ctx.newUiBuild && skillName === 'frontend-design') return true
  if (ctx.polishUi && (skillName === 'frontend-design' || skillName === 'ui-ux-review')) return true
  if (ctx.isolatedWorktree && skillName === 'git-worktree') return true
  if (ctx.rawGitWorktree && !ctx.isolatedWorktree && skillName === 'using-git-worktrees') return true
  return false
}

function bonusFor(skillName: string, ctx: TaskContext) {
  if (ctx.localCodeReview && skillName === 'code-review') return 0.75
  if (ctx.last30Days && skillName === 'last30days') return 0.85
  if (ctx.hallmark && skillName === 'hallmark') return 0.85
  if (ctx.platformResearch && skillName === 'agent-reach') return 0.75
  if (ctx.onlineResearch && skillName === 'web-research') return 0.35
  if (ctx.localBrowserWork && skillName === 'browser-automation') return 0.55
  if (ctx.newUiBuild && skillName === 'frontend-design') return 0.65
  if (ctx.existingUiReview && skillName === 'ui-ux-review') return 0.65
  if (ctx.polishUi && skillName === 'impeccable') return 0.75
  if (ctx.isolatedWorktree && skillName === 'using-git-worktrees') return 0.75
  if (ctx.rawGitWorktree && skillName === 'git-worktree') return 0.55
  return 0
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0)
}
