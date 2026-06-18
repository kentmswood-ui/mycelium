# Matcher Precision Report

Date: 2026-06-19

## Verdict

**Stop here for the pure lexical loop.** The new default-off `PrecisionGuardMatcher` reaches the intended FP ceiling for train: **0.0% FP** while increasing train top-1 from KeywordMatcher's **62.8%** to **78.1%**. On the frozen test milestone it generalizes cleanly: **80.7% top-1 / 3.2% FP / 0.860 F1**, versus KeywordMatcher's **61.4% / 19.4% / 0.722**.

This is a strong lexical guard candidate, but it is not wired into production. `src/index.ts` still constructs `new KeywordMatcher()`, and the factory default remains unchanged.

## Constraints

- No existing `src/**` file was modified.
- New matcher logic is only in `src/brain/matchers/precision-guard.ts`.
- No dependencies were added or changed.
- No embedding/model/async path was introduced.
- Test split was used only for the baseline snapshot and this final milestone read; no post-test tuning was done.

## Baseline Snapshot

Command: `pnpm run eval:matcher -- --split=test --matcher=keyword`

| matcher | split | cases | top-1 | FP | precision | recall | F1 | FP count |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| keyword | test | 62 | 61.4% | 19.4% | 0.875 | 0.614 | 0.722 | 12 |

Dependency key snapshot:
- dependencies: `@modelcontextprotocol/sdk`, `better-sqlite3`, `chokidar`, `express`, `gray-matter`, `zod`
- devDependencies: `@huggingface/transformers`, `@types/better-sqlite3`, `@types/express`, `@types/node`, `@vitest/coverage-v8`, `tsx`, `typescript`, `vitest`

## Train Analysis

The train FP clusters were stable rather than random:
- Negative/meta tasks: "just explain", translate, summarize, grammar, vocabulary/word meaning.
- Neighbor skills: `code-review` vs `github-pr-review`, `agent-reach` vs `web-research`, `web-research` vs `browser-automation`.
- UI minimal pairs: new UI build vs existing UI audit vs polish existing UI.
- Worktree minimal pair: `using-git-worktrees` process guard vs raw `git-worktree` commands.
- Last-30-days and Hallmark were distinct lexical concepts that needed explicit guards.

## Train Results

| matcher | split | cases | top-1 | FP | precision | recall | F1 | FP count |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| keyword | train | 147 | 62.8% | 15.6% | 0.851 | 0.628 | 0.723 | 23 |
| conservative-char | train | 147 | 70.1% | 9.5% | 0.842 | 0.701 | 0.765 | 14 |
| precision-guard | train | 147 | 78.1% | 0.0% | 0.964 | 0.781 | 0.863 | 0 |

## Milestone Test Results

Command: one final harness-equivalent test split run with KeywordMatcher, existing candidates, and `PrecisionGuardMatcher`.

| matcher | split | cases | top-1 | FP | precision | recall | F1 | FP count |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| keyword | test | 62 | 61.4% | 19.4% | 0.875 | 0.614 | 0.722 | 12 |
| bm25 | test | 62 | 73.7% | 54.8% | 0.689 | 0.737 | 0.712 | 34 |
| char-ngram | test | 62 | 61.4% | 12.9% | 0.897 | 0.614 | 0.729 | 8 |
| conservative-char | test | 62 | 70.2% | 9.7% | 0.851 | 0.702 | 0.769 | 6 |
| hybrid | test | 62 | 66.7% | 19.4% | 0.792 | 0.667 | 0.724 | 12 |
| precision-guard | test | 62 | 80.7% | 3.2% | 0.920 | 0.807 | 0.860 | 2 |

Absolute lift versus KeywordMatcher:
- top-1: **+19.3 pp**
- FP: **-16.2 pp**
- F1: **+0.138**

Absolute lift versus current best lexical candidate (`conservative-char`):
- top-1: **+10.5 pp**
- FP: **-6.5 pp**
- F1: **+0.091**

## Slices

| slice | bucket | cases | top-1 | FP | F1 |
|---|---|---:|---:|---:|---:|
| lang | zh | 14 | 72.7% | 0.0% | 0.842 |
| lang | en | 26 | 96.0% | 3.8% | 0.941 |
| lang | mixed | 22 | 66.7% | 4.5% | 0.757 |
| difficulty | easy | 30 | 88.9% | 3.3% | 0.923 |
| difficulty | medium | 11 | 90.0% | 0.0% | 0.900 |
| difficulty | hard | 21 | 65.0% | 4.8% | 0.743 |

## Ceiling

The train set has no remaining FP for this candidate. The remaining train misses are mostly:
- Chinese process requests with little lexical overlap in the snapshot text.
- Ultra-short aliases such as `UI review` and `skill check first`.
- Domain phrases where the correct route depends on skill-body semantics rather than name/keyword overlap.

Pushing further with pure lexical rules would mean adding brittle one-off aliases or hardcoded route maps. That would likely overfit and raise FP elsewhere. **This is the lexical ceiling for the current assets; further meaningful improvement needs richer skill metadata or semantic/embedding reranking.**

The two milestone test FPs are intentionally not tuned after seeing holdout:
- `anysearch-hard-094` hit `last30days` because of negated "not last 30 days" wording.
- `negative-general-knowledge-question-192` hit a low-score generic branch-finishing phrase.

Those are useful future red-team patterns, but feeding them back into this loop would violate the frozen-test rule.
