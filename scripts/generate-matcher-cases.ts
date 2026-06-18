import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

type Lang = 'zh' | 'en' | 'mixed'
type Difficulty = 'easy' | 'medium' | 'hard'
type Split = 'train' | 'test'

interface DraftCase {
  skill: string | null
  lang: Lang
  difficulty: Difficulty
  task: string
  note: string
  notExpect?: string[]
}

interface MatcherCase extends DraftCase {
  id: string
  expect: string | null
  split: Split
}

interface Spec {
  skill: string
  avoid?: string[]
  zh: string
  en: string
  mixed: string
  hard: string
  minimal: string
}

function hashId(id: string): number {
  let h = 2166136261
  for (const ch of id) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function splitFor(id: string): Split {
  return hashId(id) % 10 < 7 ? 'train' : 'test'
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const specs: Spec[] = [
  {
    skill: 'writing-plans',
    avoid: ['test-driven-development', 'executing-plans'],
    zh: '帮我根据这个需求写实现计划，先拆任务和文件边界，不要直接改代码',
    en: 'Write an implementation plan from these requirements before coding',
    mixed: '把这个 feature spec 拆成 implementation roadmap 和 checklist',
    hard: '我已经有需求但还没有动手，请先产出工程实施计划；不要进入 red green 测试循环，也不要开始执行',
    minimal: '实现计划',
  },
  {
    skill: 'test-driven-development',
    avoid: ['writing-plans', 'systematic-debugging'],
    zh: '先写失败测试，再用红绿重构实现这个功能',
    en: 'Use TDD and add a failing regression test before fixing the bug',
    mixed: '这个 API bug 先补 vitest red test 再改 implementation',
    hard: '不是让我写计划；我要你先让测试失败，确认失败原因，再写最小实现让它通过',
    minimal: 'TDD failing test',
  },
  {
    skill: 'systematic-debugging',
    avoid: ['test-driven-development'],
    zh: '排查这个失败，先复现并看日志，不要猜原因',
    en: 'Debug the flaky failure by inspecting logs and producing a repro',
    mixed: 'CI 失败了，先 diagnose logs 和 stack trace',
    hard: '测试偶发失败但我不知道是不是新代码导致的，请从现象、日志、最小复现一路查清楚再动手',
    minimal: 'debug logs',
  },
  {
    skill: 'executing-plans',
    avoid: ['writing-plans', 'subagent-driven-development'],
    zh: '按已经写好的实现计划逐步执行，每个 checkpoint 后复核',
    en: 'Execute the existing implementation plan step by step with review checkpoints',
    mixed: '已有 plan，请 inline execution 按 task checklist 推进',
    hard: '不要重新写计划，计划文件已经定稿；现在按步骤执行并在每个阶段验证',
    minimal: 'execute plan',
  },
  {
    skill: 'subagent-driven-development',
    avoid: ['executing-plans', 'dispatching-parallel-agents'],
    zh: '这个计划有多个独立任务，请给每个任务派一个新 subagent 并逐个审查',
    en: 'Use fresh subagents per task to implement this multi-part plan',
    mixed: '这个 implementation plan 适合 subagent-driven development',
    hard: '几个任务相互独立但都属于同一个实现计划；请拆给子代理，主会话负责 review 和整合',
    minimal: 'subagent implementation',
  },
  {
    skill: 'dispatching-parallel-agents',
    avoid: ['subagent-driven-development'],
    zh: '同时调研三个互不依赖的问题，分别派并行 agent',
    en: 'Dispatch parallel agents for independent research tasks',
    mixed: '这 4 个 tasks 没共享状态，parallel agents 一起跑',
    hard: '我要比较三个方案，每个方案可以独立查资料和总结，最后汇总，不需要共享工作树',
    minimal: 'parallel agents',
  },
  {
    skill: 'using-git-worktrees',
    avoid: ['git-worktree'],
    zh: '开始功能开发前先建隔离 worktree，避免污染当前工作区',
    en: 'Create an isolated git worktree before starting feature work',
    mixed: '这个 feature work 需要 isolated git worktree',
    hard: '当前工作树可能有用户改动，我要开新分支做实现，请先建立隔离环境再动代码',
    minimal: 'isolated worktree',
  },
  {
    skill: 'git-worktree',
    avoid: ['using-git-worktrees'],
    zh: '用 git worktree 创建一个分支目录',
    en: 'Create a git worktree for this branch',
    mixed: 'git worktree add 一个 feature branch',
    hard: '只需要执行 git worktree 管理动作，不需要完整的开发隔离流程说明',
    minimal: 'git worktree add',
  },
  {
    skill: 'finishing-a-development-branch',
    avoid: ['requesting-code-review'],
    zh: '实现完成且测试通过后，帮我整理合并、PR、清理分支的收尾选项',
    en: 'Finish the development branch after tests pass and decide merge or PR cleanup',
    mixed: 'feature branch done，帮我 finish branch and PR options',
    hard: '代码已经实现完成，不是再审代码；我要知道现在应该 merge、开 PR、还是清理分支',
    minimal: 'finish branch',
  },
  {
    skill: 'requesting-code-review',
    avoid: ['receiving-code-review', 'code-review'],
    zh: '我完成了一个大功能，提交前请帮我请求一次代码审查',
    en: 'Request a code review before merging this completed feature',
    mixed: 'major feature done，need requesting-code-review before merge',
    hard: '不是处理别人已经留下的评论，而是我想主动找 reviewer 检查这批实现',
    minimal: 'request review',
  },
  {
    skill: 'receiving-code-review',
    avoid: ['requesting-code-review', 'code-review'],
    zh: '收到评审意见了，先判断哪些建议合理再改',
    en: 'Address received code review feedback carefully before implementing suggestions',
    mixed: 'PR review comments 已收到，先 verify feedback 再改',
    hard: '评审说要重构，但我不确定对不对；请先技术核验评论再决定是否采纳',
    minimal: 'received review',
  },
  {
    skill: 'code-review',
    avoid: ['github-pr-review', 'requesting-code-review'],
    zh: '审本地代码，列出 bug、风险和缺测试，不要去 GitHub',
    en: 'Review the local code for bugs, regressions, risks, and missing tests',
    mixed: 'local code review findings，不看 PR comments',
    hard: '这不是 GitHub PR；只看当前工作树里的代码，按严重程度列发现',
    minimal: 'local code review',
  },
  {
    skill: 'github-pr-review',
    avoid: ['code-review', 'receiving-code-review'],
    zh: '查看这个 GitHub PR 的 review comments、checks 和 diff',
    en: 'Inspect GitHub pull request review comments, checks, and diff',
    mixed: 'GitHub PR requested changes 和 checks 帮我整理',
    hard: '上下文在 GitHub PR，不是本地随便审；请读取未解决评审线程和 CI 检查',
    minimal: 'PR comments',
  },
  {
    skill: 'verification-before-completion',
    avoid: ['test-driven-development'],
    zh: '声称完成前先跑验证命令，读输出再汇报',
    en: 'Before claiming completion, run the full verification command and read output',
    mixed: 'finish 前必须 fresh verification evidence',
    hard: '不要说应该能过；先用命令证明测试、构建或检查真的通过，再做完成声明',
    minimal: 'verify before completion',
  },
  {
    skill: 'using-superpowers',
    avoid: ['verification-before-completion'],
    zh: '新会话开始时先检查有没有适用的 skill，再回答',
    en: 'At conversation start, invoke relevant skills before responding',
    mixed: 'new turn 先 use superpowers skill check',
    hard: '我还没问具体代码问题；这条是关于会话起步流程，先做 skill discovery',
    minimal: 'skill check first',
  },
  {
    skill: 'brainstorming',
    avoid: ['writing-plans'],
    zh: '这个功能想法还模糊，先一起探索目标、用户和边界',
    en: 'Brainstorm the product idea before turning it into implementation work',
    mixed: '这个 creative feature 先 brainstorming，不要立刻 code',
    hard: '我只有一个概念，还没有规格；请先问好问题并探索方案，不要写实现计划',
    minimal: 'brainstorm idea',
  },
  {
    skill: 'writing-skills',
    avoid: ['writing-plans'],
    zh: '创建一个新的 Codex skill，并验证触发说明和部署效果',
    en: 'Create or edit a reusable skill and verify it before deployment',
    mixed: '帮我写 SKILL.md 和 keywords，让下次任务能命中',
    hard: '目标不是写项目实现计划，而是沉淀一个 agent 可复用的技能说明',
    minimal: 'write skill',
  },
  {
    skill: 'agent-reach',
    avoid: ['anysearch', 'web-research'],
    zh: '全网调研这个话题，尤其看 Reddit、B站和小红书讨论',
    en: 'Research this topic across Reddit, X, YouTube, and web sources',
    mixed: '查一下 V2EX 和 GitHub code search 上有什么讨论',
    hard: '用户给了一个外部链接和平台名，要抓取互联网上的内容，不是写报告本身',
    minimal: 'Reddit 调研',
  },
  {
    skill: 'anysearch',
    avoid: ['agent-reach', 'last30days'],
    zh: '用实时搜索引擎查网页并提取 URL 内容',
    en: 'Run parallel web search and URL content extraction',
    mixed: 'batch web search + extract URLs for these domains',
    hard: '这是搜索引擎能力调用本身，不要求平台专门路由，也不是只看最近 30 天',
    minimal: 'web search extraction',
  },
  {
    skill: 'last30days',
    avoid: ['agent-reach', 'anysearch'],
    zh: '研究最近 30 天 Reddit、X 和网页上的趋势，并写可复制 prompt',
    en: 'Research the last 30 days on Reddit, X, and web, then write prompts',
    mixed: 'last 30 days Reddit+X+Web trend research',
    hard: '时间窗口明确是最近 30 天，而且交付物是给目标工具的 copy-paste prompt',
    minimal: 'last 30 days',
  },
  {
    skill: 'web-research',
    avoid: ['browser-automation'],
    zh: '搜索最新资料并列出来源，不需要控制浏览器',
    en: 'Search the web for current sources and summarize them',
    mixed: '查一下 Reddit 上大家怎么评价这个工具，给 sources',
    hard: '要联网找资料和来源；不是打开本地 localhost 页面截图',
    minimal: 'web research',
  },
  {
    skill: 'browser-automation',
    avoid: ['web-research', 'agent-reach'],
    zh: '打开本地页面，点击按钮并截图验证 UI',
    en: 'Use Playwright to click through localhost and take screenshots',
    mixed: 'browser 自动输入 localhost form 并截图',
    hard: '目标在本地应用，需要真实浏览器交互，不是搜索互联网资料',
    minimal: 'browser screenshot',
  },
  {
    skill: 'frontend-design',
    avoid: ['ui-ux-review', 'impeccable'],
    zh: '设计一个新的前端页面和组件布局',
    en: 'Design a new frontend page with polished components and layout',
    mixed: 'build new SaaS UI page，不是 review existing screenshot',
    hard: '从零搭一个页面体验，需要视觉方向、排版和组件，而不是审查已有界面',
    minimal: 'new frontend UI',
  },
  {
    skill: 'ui-ux-review',
    avoid: ['frontend-design', 'impeccable'],
    zh: '审查这张截图的层级、间距和可用性问题',
    en: 'Review this existing UI screenshot for spacing and accessibility issues',
    mixed: 'audit app UI 的 UX 可用性和 visual hierarchy',
    hard: '已有屏幕，不要新建页面；只输出问题、风险和改进建议',
    minimal: 'UI review',
  },
  {
    skill: 'hallmark',
    avoid: ['frontend-design', 'ui-ux-review'],
    zh: '用反 AI 味设计标准重做这个落地页，让它不模板化',
    en: 'Apply Hallmark anti-AI-slop design to redesign this landing page',
    mixed: 'Hallmark audit this website and redesign direction',
    hard: '重点是识别模板化 AI 设计痕迹并提炼更有辨识度的页面方向',
    minimal: 'Hallmark redesign',
  },
  {
    skill: 'impeccable',
    avoid: ['frontend-design', 'ui-ux-review'],
    zh: '打磨现有 dashboard 的信息架构、视觉层级、响应式和微交互',
    en: 'Polish an existing frontend interface across UX, hierarchy, accessibility, and motion',
    mixed: 'impeccable polish existing app shell and empty states',
    hard: '不是从零生成页面，也不只是列问题；要把现有界面改得更清晰、更高级',
    minimal: 'polish UI',
  },
  {
    skill: 'ui-design-brain',
    avoid: ['frontend-design', 'impeccable'],
    zh: '用成熟组件模式生成生产级 SaaS 表单和导航',
    en: 'Generate production-grade UI using component patterns and design-system conventions',
    mixed: 'UI design brain for dashboard cards navigation forms',
    hard: '重点是借助组件模式和设计系统惯例，避免泛泛的 AI 默认界面',
    minimal: 'component UI patterns',
  },
  {
    skill: 'data-dashboard',
    avoid: ['spreadsheet-analysis'],
    zh: '做一个 KPI 数据看板，包含指标卡、图表和筛选器',
    en: 'Build an analytics dashboard with KPI scorecards, charts, and filters',
    mixed: 'metrics dashboard for revenue by segment',
    hard: '数据来自业务指标，需要可探索的看板，不是只清洗一个表格文件',
    minimal: 'KPI dashboard',
  },
  {
    skill: 'spreadsheet-analysis',
    avoid: ['data-dashboard'],
    zh: '分析这个 xlsx 表格里的公式、透视表和图表',
    en: 'Clean a CSV workbook and add formulas and charts',
    mixed: 'Excel pivot table 和 formula 帮我检查',
    hard: '任务对象是一个工作簿文件，重点是单元格、公式和表格结构',
    minimal: 'spreadsheet formulas',
  },
  {
    skill: 'document-editing',
    avoid: ['presentation-deck'],
    zh: '编辑 Word 文档，增加批注、修订和排版',
    en: 'Format this DOCX and add redline comments',
    mixed: '这个 docx 帮我排版 document comments',
    hard: '交付物是可审阅的文档，不是幻灯片或数据表',
    minimal: 'DOCX redline',
  },
  {
    skill: 'presentation-deck',
    avoid: ['document-editing'],
    zh: '做一份 PPT 路演幻灯片和讲稿',
    en: 'Create a PowerPoint deck with speaker notes',
    mixed: '把报告转成 slides deck 和 keynote 风格',
    hard: '目标是演示叙事和幻灯片结构，而不是编辑原始 Word 文档',
    minimal: 'slide deck',
  },
  {
    skill: 'image-generation',
    avoid: ['frontend-design'],
    zh: '生成一张插画图标素材，并按参考图改图',
    en: 'Edit this image mockup and generate an icon asset',
    mixed: 'generate image mockup for 产品首屏',
    hard: '需要生成或编辑位图视觉资产，不是用前端 CSS 搭页面',
    minimal: 'generate image',
  },
  {
    skill: 'video-composition',
    avoid: ['image-generation'],
    zh: '制作一个带字幕动画的视频片头',
    en: 'Render a video with captions and animated overlays',
    mixed: 'HTML video composition with motion graphics',
    hard: '输出是带时间轴的动画视频，不是静态图片素材',
    minimal: 'captioned video',
  },
  {
    skill: 'gmail-triage',
    avoid: ['document-editing'],
    zh: '整理 Gmail 收件箱里今天需要回复的邮件',
    en: 'Triage my Gmail inbox and draft replies for urgent threads',
    mixed: '找 gmail label 里的 unread email thread',
    hard: '这是连接邮箱后的收件箱分流，不是编辑一个文档',
    minimal: 'Gmail inbox',
  },
  {
    skill: 'openai-docs',
    avoid: ['web-research'],
    zh: '查 OpenAI API 官方文档，解释 Responses API 模型选择',
    en: 'Use official OpenAI docs to explain embeddings and model upgrades',
    mixed: 'OpenAI Codex API docs 最新用法',
    hard: '信息源必须优先官方 OpenAI 文档，不是泛泛网页搜索',
    minimal: 'OpenAI docs',
  },
  {
    skill: 'automation-reminders',
    avoid: ['executing-plans'],
    zh: '提醒我明天上午回访客户，并设成每周跟进',
    en: 'Create a recurring reminder monitor for next Monday',
    mixed: 'schedule followup automation and wakeup',
    hard: '目标是创建自动提醒或监控，不是执行开发计划',
    minimal: 'recurring reminder',
  },
  {
    skill: 'usdt-pay',
    avoid: ['openai-docs'],
    zh: '在 checkout 页面接入 USDT TRC20 支付',
    en: 'Integrate USDT TRC20 payment into the billing checkout',
    mixed: 'USDT crypto payment for subscription billing page',
    hard: '这是加密货币支付集成，不是普通 Stripe 或 PayPal 文档解释',
    minimal: 'USDT payment',
  },
  {
    skill: 'rust-embedded-isr',
    avoid: ['test-driven-development'],
    zh: '写 Rust 嵌入式中断处理 ISR，注意固件安全',
    en: 'Write a safe interrupt handler in Rust embedded firmware',
    mixed: 'Rust bare-metal ISR for MIDI 中断',
    hard: '目标是裸机固件里的中断处理，不是一般后端 bugfix',
    minimal: 'Rust ISR',
  },
]

const negatives: DraftCase[] = [
  {
    skill: null,
    lang: 'zh',
    difficulty: 'easy',
    task: '我头痛发烧该吃什么药',
    note: 'medical advice should not route to coding skills',
    notExpect: ['systematic-debugging'],
  },
  {
    skill: null,
    lang: 'en',
    difficulty: 'easy',
    task: 'What is the capital of France?',
    note: 'general knowledge question',
    notExpect: ['web-research', 'agent-reach'],
  },
  {
    skill: null,
    lang: 'zh',
    difficulty: 'easy',
    task: '今天上海天气怎么样',
    note: 'weather question without requested web research',
    notExpect: ['agent-reach', 'anysearch'],
  },
  {
    skill: null,
    lang: 'en',
    difficulty: 'easy',
    task: 'Tell me a joke about coffee',
    note: 'casual chat should not match',
    notExpect: ['writing-plans'],
  },
  {
    skill: null,
    lang: 'zh',
    difficulty: 'medium',
    task: '不要启动 anysearch，也不要联网；只把这句话翻译成英文',
    note: 'skill name appears in a negated translation request',
    notExpect: ['anysearch', 'agent-reach'],
  },
  {
    skill: null,
    lang: 'en',
    difficulty: 'hard',
    task: 'Do not use test-driven-development here; just explain in one paragraph what TDD means',
    note: 'skill name appears but intent is explanation, not workflow',
    notExpect: ['test-driven-development'],
  },
  {
    skill: null,
    lang: 'mixed',
    difficulty: 'hard',
    task: '我不是要 Hallmark redesign，只是问 hallmark 这个英文单词怎么读',
    note: 'proper noun collision should stay negative',
    notExpect: ['hallmark'],
  },
  {
    skill: null,
    lang: 'zh',
    difficulty: 'medium',
    task: '给咖啡店起一个中文名字，别做网页也别设计 logo',
    note: 'naming request is unrelated to UI and image generation',
    notExpect: ['frontend-design', 'image-generation'],
  },
  {
    skill: null,
    lang: 'en',
    difficulty: 'medium',
    task: 'Calculate 15 percent of 240 and show the arithmetic',
    note: 'math question',
    notExpect: ['spreadsheet-analysis'],
  },
  {
    skill: null,
    lang: 'mixed',
    difficulty: 'hard',
    task: 'OpenAI 这个词出现在句子里，但我只想让你改英文语法，不要查 docs',
    note: 'official docs skill name appears in a negated editing request',
    notExpect: ['openai-docs'],
  },
  {
    skill: null,
    lang: 'zh',
    difficulty: 'medium',
    task: '帮我写一首关于月亮的短诗，不要做文档排版',
    note: 'creative writing is not document editing',
    notExpect: ['document-editing'],
  },
  {
    skill: null,
    lang: 'en',
    difficulty: 'hard',
    task: 'The word dashboard appears in this sentence; summarize it, do not build analytics UI',
    note: 'keyword appears but intent is summarization',
    notExpect: ['data-dashboard'],
  },
  {
    skill: null,
    lang: 'mixed',
    difficulty: 'hard',
    task: 'GitHub 只是公司名上下文，不要打开 PR，不要 review code，帮我翻译新闻标题',
    note: 'platform word plus negated PR/code review',
    notExpect: ['github-pr-review', 'code-review'],
  },
  {
    skill: null,
    lang: 'zh',
    difficulty: 'hard',
    task: '不要给我安排提醒；我只是想知道 reminder 这个词是什么意思',
    note: 'automation term in a vocabulary question',
    notExpect: ['automation-reminders'],
  },
]

const cases: DraftCase[] = []
for (const spec of specs) {
  cases.push(
    {
      skill: spec.skill,
      lang: 'zh',
      difficulty: 'easy',
      task: spec.zh,
      note: `${spec.skill}: Chinese direct request`,
      notExpect: spec.avoid,
    },
    {
      skill: spec.skill,
      lang: 'en',
      difficulty: 'easy',
      task: spec.en,
      note: `${spec.skill}: English direct request`,
      notExpect: spec.avoid,
    },
    {
      skill: spec.skill,
      lang: 'mixed',
      difficulty: 'medium',
      task: spec.mixed,
      note: `${spec.skill}: mixed-language request`,
      notExpect: spec.avoid,
    },
    {
      skill: spec.skill,
      lang: spec.hard.match(/[一-鿿]/) ? 'mixed' : 'en',
      difficulty: 'hard',
      task: spec.hard,
      note: `${spec.skill}: adversarial disambiguation`,
      notExpect: spec.avoid,
    },
    {
      skill: spec.skill,
      lang: spec.minimal.match(/[一-鿿]/) ? 'mixed' : 'en',
      difficulty: 'hard',
      task: spec.minimal,
      note: `${spec.skill}: minimal pair keyword`,
      notExpect: spec.avoid,
    },
  )
}
cases.push(...negatives)

const out: MatcherCase[] = cases.map((item, index) => {
  const base = item.skill === null ? `negative-${slug(item.note)}` : `${item.skill}-${item.difficulty}`
  const id = `${base}-${String(index + 1).padStart(3, '0')}`
  const { skill, ...rest } = item
  return {
    id,
    ...rest,
    expect: skill,
    split: splitFor(id),
  }
})

const outPath = join(process.cwd(), 'tests', 'fixtures', 'matcher-cases.json')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
console.log(`wrote ${out.length} matcher cases to ${outPath}`)
