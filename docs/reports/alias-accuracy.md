# Alias Accuracy Report

Date: 2026-06-19

## Step 0: Measure The Real Production-Like Baseline

The previous matcher reports measured bare skill metadata. Production consult enriches skills with `aliasedSkills()` before matching, so the old numbers understated what Chinese aliases already do.

Step 0 changed `scripts/eval-matcher.ts` to evaluate `aliasedSkills(mergeSkills(...))` and added `precision-guard` to the candidate table. `tests/brain/matcher-golden.test.ts` now uses the same alias-enriched fixture corpus. No production source was changed.

Current 209-case test split baseline, with aliases:

| matcher | split | cases | top-1 | FP | precision | recall | F1 |
|---|---|---:|---:|---:|---:|---:|---:|
| keyword | test | 62 | 75.4% | 19.4% | 0.977 | 0.754 | 0.851 |
| precision-guard | test | 62 | 77.2% | 3.2% | 0.898 | 0.772 | 0.830 |

Current 209-case train split baseline, with aliases:

| matcher | split | cases | top-1 | FP | precision | recall | F1 |
|---|---|---:|---:|---:|---:|---:|---:|
| keyword | train | 147 | 65.0% | 14.3% | 0.890 | 0.650 | 0.751 |
| precision-guard | train | 147 | 78.8% | 0.0% | 0.982 | 0.788 | 0.874 |

New anchor for this task:
- Default matcher: `precision-guard`.
- Baseline FP ceiling: **0.0% train FP** and **3.2% current test FP** before expanding the exam.
- Baseline top-1 to improve: **78.8% train** and **77.2% current test**.

## Step 1: Expand The Frozen Exam

Added 308 deterministic `alias-*` cases to `tests/fixtures/matcher-cases.json`, bringing the corpus to 517 cases. The split remains hash-derived by case id: 363 train cases and 154 test cases. Existing cases were not edited or deleted.

Coverage added:
- Natural Chinese requests for the local skill workflows.
- Mixed Chinese/English phrasing such as `batch web search + extract URLs`.
- Minimal-pair positives for neighboring workflows.
- `expect:null` negatives where the text mentions a skill name but explicitly asks for a language/meta answer.

Guard rails added in tests:
- `tests/brain/cases-integrity.test.ts` now requires at least 500 cases and checks deterministic split, required fields, known skill names, and lang/difficulty/split coverage.
- `tests/meta/test-split-frozen.test.ts` keeps the legacy 62-case test split frozen, while allowing newly appended `alias-*` cases to join the hash-derived test split.

Expanded train-only baseline with aliases:

| matcher | split | cases | top-1 | FP | precision | recall | F1 |
|---|---|---:|---:|---:|---:|---:|---:|
| keyword | train | 363 | 57.2% | 15.2% | 0.837 | 0.572 | 0.680 |
| precision-guard | train | 363 | 76.1% | 7.4% | 0.866 | 0.761 | 0.810 |

Train miss pattern after expansion:
- Alias gaps dominate Chinese and mixed-language requests: implementation plans, received review feedback, skill discovery, reminders, URL extraction, and dashboard/document/media workflows.
- False positives mostly come from meta-language negatives (`what does X mean`, translation, pronunciation) and neighboring GitHub PR vs local code-review wording.
- The new test split has not been used after expansion; it is reserved for the final milestone.

## Step 2: Feed Train-Derived Aliases

Changed only the two data tables in `src/brain/aliases.ts`: `DEFAULT_ALIASES` and `SKILL_KEYWORDS_EN`. The `aliasedSkills()` function body remains hash-locked by `tests/meta/aliases-logic-frozen.test.ts`.

Train-only before/after:

| matcher | before top-1 | before FP | after top-1 | after FP | after precision | after recall | after F1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| keyword | 57.2% | 15.2% | 75.1% | 15.2% | 0.888 | 0.751 | 0.814 |
| precision-guard | 76.1% | 7.4% | 90.2% | 6.3% | 0.902 | 0.902 | 0.902 |

Precision-guard train slices after aliases:

| slice | top-1 | FP |
|---|---:|---:|
| zh | 86.1% | 5.7% |
| en | 96.2% | 4.7% |
| mixed | 87.5% | 8.2% |
| easy | 96.1% | 0.0% |
| medium | 90.4% | 10.3% |
| hard | 84.8% | 7.6% |

Chinese/mixed alias motivations:

| skill | added aliases | motivation |
|---|---|---|
| `test-driven-development` | `测试失败`, `先让测试失败`, `最小实现` | Users often ask for the red phase and minimal implementation without saying TDD. |
| `systematic-debugging` | `定位根因`, `根因`, `复现排查`, `看日志`, `查清楚` | Train misses described debugging as reproduction, logs, and root cause. |
| `writing-plans` | `实施计划`, `工程实施计划`, `规划架构`, `任务拆解`, `产出计划` | Chinese planning requests commonly say implementation plan, architecture planning, or task breakdown. |
| `executing-plans` | `已有计划`, `按已有计划`, `逐步执行`, `照步骤推进`, `计划定稿` | Execution requests refer to an existing/finalized plan and stepwise follow-through. |
| `subagent-driven-development` | `多个子代理`, `拆给子代理`, `子代理实现`, `主会话整合` | Users describe implementation by splitting work to subagents and integrating in the main thread. |
| `dispatching-parallel-agents` | `互不依赖`, `并行调研`, `独立查资料`, `并行查资料` | Parallel dispatch often appears as independent research or independent questions. |
| `brainstorming` | `探索产品想法`, `想法模糊`, `问问题`, `厘清用户`, `边界` | Train misses asked to clarify an early idea and boundaries before implementation. |
| `requesting-code-review` | `请求代码审查`, `主动请求`, `主动发起 review`, `找 reviewer` | This skill is for initiating review, not reacting to already received comments. |
| `receiving-code-review` | `收到评审意见`, `已经收到`, `核验评论`, `别人已经 review`, `处理评论` | Received-review tasks mention comments already left and validating them before editing. |
| `verification-before-completion` | `完成声明`, `跑验证命令`, `命令输出证明`, `先用命令证明`, `真的通过` | Users ask for proof from command output before claiming completion. |
| `finishing-a-development-branch` | `合并收尾`, `收尾选项`, `清理分支`, `实现完成后` | Branch completion is phrased as merge/cleanup choices after implementation. |
| `using-git-worktrees` | `隔离目录`, `保护当前工作区`, `用户改动`, `开新分支做实现` | Worktree setup is requested as protecting a dirty/current workspace before feature work. |
| `writing-skills` | `技能说明`, `可复用技能` | Skill authoring requests mention reusable skill docs rather than project plans. |
| `using-superpowers` | `检查适用技能`, `适用技能`, `会话起步` | The trigger is session startup skill discovery, distinct from writing a new skill. |
| `frontend-design` | `新建页面` | New UI/page build wording helps separate creation from review of existing screens. |
| `ui-design-brain` | `组件模式`, `生产级 UI`, `SaaS 表单`, `导航` | UI generation misses asked for production component patterns and SaaS forms/navigation. |
| `anysearch` | `URL 内容`, `提取 URL`, `搜索引擎能力` | Anysearch-specific work is web search plus URL extraction, not broad research. |
| `automation-reminders` | `提醒我`, `设置提醒`, `自动提醒`, `周期监控`, `每周跟进` | Reminder tasks are naturally phrased as setting recurring reminders or monitors. |
| `presentation-deck` | `幻灯片`, `演示叙事` | Deck tasks mention slides and presentation narrative. |
| `image-generation` | `图片素材`, `生成图片` | Image work is often described as needing generated visual assets. |
| `video-composition` | `视频动画`, `时间轴`, `制作视频` | Video tasks mention making video/timeline animation. |
| `gmail-triage` | `邮箱收件箱`, `收件箱分流` | Gmail triage asks about inbox routing rather than document editing. |
| `usdt-pay` | `加密货币支付` | Payment integration requests mention crypto payment, not generic payment docs. |
| `data-dashboard` | `业务指标`, `可探索看板` | Dashboard tasks are tied to business metrics and explorable views. |
| `spreadsheet-analysis` | `工作簿`, `单元格`, `公式`, `表格结构` | Spreadsheet tasks focus on workbook/cell/formula/table structure. |
| `document-editing` | `可审阅文档`, `文档编辑`, `Word 文档` | Document work describes reviewable docs or Word documents. |
| `ui-ux-review` | `界面审查`, `体验审查` | Existing-screen critique is often called interface or UX review in Chinese. |
| `code-review` | `本地代码`, `当前工作树`, `代码风险`, `缺测试` | Local code review requests mention current worktree, bugs, risk, and missing tests. |

English/mixed keyword additions mirror the same train evidence: `red test`, `existing plan`, `step by step`, `fresh subagents`, `parallel agents`, `request review`, `comments received`, `verify feedback`, `check applicable skills`, `url extraction`, `batch web search`, and skill-specific asset/document/dashboard keywords.

Remaining train ceiling after aliases:
- Most remaining false positives are not alias gaps; they are meta-language negatives or close lexical neighbors (`UI review` vs code review, Anysearch vs web research, local code review vs GitHub PR).
- Further reduction needs a guarded lexical candidate under `src/brain/matchers/**`, not more aliases. Adding more aliases would mainly increase overlap with negative wording.

## Step 3: Lexical Candidate And Final Holdout

Added `src/brain/matchers/alias-precision-guard.ts` as a review-only candidate. It wraps the current `PrecisionGuardMatcher`, then adds narrow lexical guards for:
- Meta-language negatives that mention skill names (`what does X mean`, translation, pronunciation, `中文意思`, `一词`, `概念`, `不要调用工具`).
- Close train neighbor pairs such as GitHub PR review vs local code review, Anysearch URL extraction vs broad web research, worktree isolation vs raw git-worktree commands, and document vs presentation tasks.
- Explicit Chinese/mixed intent anchors that aliases alone could not lift above the char-ngram threshold.

Production wiring was not changed. `createMatcher()` still defaults to `precision-guard`, and `MYCELIUM_MATCHER=keyword` remains the rollback path.

Train after freezing the candidate:

| matcher | split | cases | top-1 | FP | precision | recall | F1 |
|---|---|---:|---:|---:|---:|---:|---:|
| alias-precision-guard | train | 363 | 100.0% | 0.0% | 1.000 | 1.000 | 1.000 |
| precision-guard | train | 363 | 90.2% | 6.3% | 0.902 | 0.902 | 0.902 |
| keyword | train | 363 | 75.1% | 15.2% | 0.888 | 0.751 | 0.814 |

Final milestone: new test split evaluated once, after tuning was frozen.

| matcher | split | cases | top-1 | FP | precision | recall | F1 |
|---|---|---:|---:|---:|---:|---:|---:|
| alias-precision-guard | test | 154 | 85.6% | 2.6% | 0.947 | 0.856 | 0.899 |
| precision-guard | test | 154 | 80.8% | 9.1% | 0.842 | 0.808 | 0.824 |
| keyword | test | 154 | 72.0% | 13.6% | 0.918 | 0.720 | 0.807 |
| hybrid | test | 154 | 87.2% | 21.4% | 0.779 | 0.872 | 0.823 |
| bm25 | test | 154 | 93.6% | 58.4% | 0.760 | 0.936 | 0.839 |

Final alias-precision-guard slices:

| slice | top-1 | FP |
|---|---:|---:|
| zh | 65.7% | 2.5% |
| en | 95.8% | 3.6% |
| mixed | 90.5% | 1.7% |
| easy | 84.0% | 3.8% |
| medium | 96.8% | 0.0% |
| hard | 79.5% | 3.4% |

Verdict:
- **GO** for keeping `alias-precision-guard` as a review-only candidate: on the frozen test split it improves over the current production default by +4.8 top-1 points and -6.5 FP points.
- **NO-GO** for automatically switching production default in this task: the candidate was tuned to train until train hit 100.0%/0.0%, while final Chinese holdout top-1 is still 65.7%. The remaining gap is not safely solved by adding more test-derived lexical rules.

Human-review-only factory diff, not applied:

```diff
+import { AliasPrecisionGuardMatcher } from './alias-precision-guard.js'
 ...
+  'alias-precision-guard': () => new AliasPrecisionGuardMatcher(),
```

Ceiling:
- Alias + lexical train tuning has reached its ceiling: train has no remaining miss or FP.
- The final holdout failures are unseen paraphrases and skill families that need richer structured metadata or semantic matching. Further lexical edits would either leak test wording or add brittle broad rules.
