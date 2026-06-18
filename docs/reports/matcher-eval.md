# Matcher Evaluation Report

Date: 2026-06-18

## Method

This run evaluates matcher quality without changing production wiring. `src/index.ts` still constructs `new KeywordMatcher()`.

Corpus:
- 22 real `.cc-switch` skill frontmatter snapshots in `tests/fixtures/real-skills.snapshot.json`.
- 20 local fixture skills from `tests/fixtures/skills/**`.
- Duplicate names are merged at eval time so real descriptions and local Chinese aliases can both contribute.

Cases:
- 204 total cases in `tests/fixtures/matcher-cases.json`.
- Split is deterministic by FNV-1a hash of `id`: 142 train, 62 test.
- Case mix includes zh/en/mixed, easy/medium/hard, near-neighbor skills, negated skill-name cases, cross-language prompts, long conversational tasks, and minimal pairs.

Anti-cheat rule followed:
- All tuning used train split only.
- Test split was run once after parameters were frozen.

Metrics:
- Top-1 accuracy is calculated on cases with non-null `expect`.
- False positive rate includes `expect: null` with any result and any result containing a `notExpect` skill above threshold.
- P/R/F1 are included as secondary diagnostics.

## Train Baseline

Command: `pnpm run eval:matcher -- --split=train`

| matcher | train cases | top-1 | FP | precision | recall | F1 |
|---|---:|---:|---:|---:|---:|---:|
| keyword | 142 | 63.2% | 15.5% | 0.857 | 0.632 | 0.727 |
| bm25 | 142 | 69.2% | 53.5% | 0.652 | 0.692 | 0.672 |
| char-ngram | 142 | 55.6% | 9.9% | 0.902 | 0.556 | 0.688 |
| hybrid | 142 | 69.2% | 16.9% | 0.730 | 0.692 | 0.710 |

## Train Tuning

Selection objective used during train tuning: maximize `top-1 - FP`, then prefer higher top-1.

Top train trials:

| trial | top-1 | FP | precision | recall | F1 | objective |
|---|---:|---:|---:|---:|---:|---:|
| hybrid k=.35 b=.35 c=.30 threshold=.85 | 69.2% | 16.9% | 0.730 | 0.692 | 0.710 | 0.523 |
| hybrid k=.45 b=.25 c=.30 threshold=.85 | 69.2% | 16.9% | 0.724 | 0.692 | 0.708 | 0.523 |
| hybrid k=.55 b=.20 c=.25 threshold=.85 | 69.2% | 16.9% | 0.724 | 0.692 | 0.708 | 0.523 |
| hybrid k=.60 b=.15 c=.25 threshold=.85 | 69.2% | 16.9% | 0.724 | 0.692 | 0.708 | 0.523 |
| keyword default | 63.2% | 15.5% | 0.857 | 0.632 | 0.727 | 0.477 |
| char 3-5 threshold=.18 | 57.9% | 10.6% | 0.885 | 0.579 | 0.700 | 0.473 |
| char 2-4 threshold=.20 | 55.6% | 9.9% | 0.902 | 0.556 | 0.688 | 0.458 |

Frozen tuned candidate before test:
- `hybrid`: keyword weight `.35`, BM25 weight `.35`, char n-gram weight `.30`, threshold `.85`.
- BM25 and char-ngram defaults were left unchanged.

## Final Test Results

Command: `pnpm run eval:matcher -- --split=test`

This was the only test split run.

| matcher | test cases | top-1 | FP | precision | recall | F1 |
|---|---:|---:|---:|---:|---:|---:|
| bm25 | 62 | 73.7% | 54.8% | 0.689 | 0.737 | 0.712 |
| char-ngram | 62 | 61.4% | 12.9% | 0.897 | 0.614 | 0.729 |
| hybrid | 62 | 66.7% | 19.4% | 0.792 | 0.667 | 0.724 |
| keyword | 62 | 61.4% | 19.4% | 0.875 | 0.614 | 0.722 |

## Winner

Final recommendation: `char-ngram` is the safest default-off candidate from this run.

Why:
- It matched the baseline top-1 on test: 61.4% vs 61.4%.
- It reduced false positives: 12.9% vs 19.4%.
- It had the best test F1: 0.729 vs keyword 0.722 and hybrid 0.724.

The tuned `hybrid` is still useful if top-1 lift is valued more than FP control:
- Hybrid top-1 improved over baseline: 66.7% vs 61.4%.
- Hybrid did not improve FP on test: 19.4% vs 19.4%.

BM25 is not a safe standalone candidate despite high top-1 because FP was 54.8%.

## Failure Analysis

Keyword baseline:
- Misses long Chinese prompts where the desired skill is expressed semantically rather than with exact aliases.
- Confuses tight process pairs: `using-git-worktrees` vs `git-worktree`, `requesting-code-review` vs `github-pr-review`.
- Has false positives when `notExpect` neighbors share strong words like review, plan, GitHub, or UI.

BM25:
- Raises recall but floods top-3 with adjacent process/UI skills.
- The highest FP cluster came from shared domain words, especially review/worktree/search/UI.
- Useful as a component, not as an independent matcher.

Char n-gram:
- Strong for English typo and morphology tolerance.
- Weak on Chinese-only prompts because real skill descriptions are mostly English and snapshot keywords are sparse.
- Best FP profile on test, making it attractive as a conservative candidate.

Hybrid:
- Train tuning improved top-1 while keeping FP close to baseline on train.
- On test, UI and process neighbor clusters still produced false positives.
- Main failure clusters: frontend/UI family, code-review family, worktree family, and negated skill-name negatives.

## Limitations

- The real `.cc-switch` snapshot stores frontmatter only; body text may contain routing guidance not represented here.
- Duplicate real/fixture skill names are merged for evaluation, which helps cross-language coverage but is not identical to current production consult aliasing.
- The test set is deterministic but synthetic. It is harder than the previous benchmark, yet still not a replacement for live feedback logs.

## Next Steps

1. Add production-like Chinese aliases to real skills through the existing alias mechanism rather than relying on matcher cleverness alone.
2. Add explicit negation handling for phrases like "do not use X" before scorer fusion.
3. Explore a two-stage matcher: conservative candidate retrieval followed by pairwise disambiguation rules for known neighbor clusters.
4. If enabling a candidate manually, prefer `char-ngram` first for FP control, or `hybrid` when recall/top-1 matters more.

## 2026-06-19 Train-Only Hardening Addendum

No test split was run for this addendum. The previous final test numbers above remain the only holdout read.

Red team:
- Added 5 human-language train-only hard cases covering execution-vs-planning, parallel research-vs-subagent implementation, received-review-vs-requesting-review, completion evidence, and negated GitHub/code-review wording.
- Train set changed from 142 to 147 cases.

Blue team:
- Added `conservative-char`, a default-off candidate that uses low-threshold character n-grams for recall but emits only the best hit. This directly targets the benchmark's top-3 false-positive rule by avoiding low-confidence neighbor suggestions.

Train results after the red/blue round:

| matcher | train cases | top-1 | FP | precision | recall | F1 |
|---|---:|---:|---:|---:|---:|---:|
| bm25 | 147 | 69.3% | 54.4% | 0.651 | 0.693 | 0.671 |
| char-ngram | 147 | 56.9% | 9.5% | 0.907 | 0.569 | 0.700 |
| conservative-char | 147 | 70.1% | 9.5% | 0.842 | 0.701 | 0.765 |
| hybrid | 147 | 70.1% | 17.0% | 0.733 | 0.701 | 0.716 |
| keyword | 147 | 62.8% | 15.6% | 0.851 | 0.628 | 0.723 |

Current train-only recommendation: `conservative-char` is the best default-off candidate from this hardening loop because it ties hybrid on top-1 while cutting FP from 17.0% to 9.5%, and improves over keyword on both top-1 and FP.

## How To Enable Later

Production remains unchanged in this task. A future manual wiring change could look like:

```diff
- import { KeywordMatcher } from './brain/matcher.js'
+ import { createMatcher } from './brain/matchers/factory.js'

- const brain = new Brain(repo, new KeywordMatcher(), ledger, {
+ const brain = new Brain(repo, createMatcher(), ledger, {
```

Then run with `MYCELIUM_MATCHER=char-ngram` or `MYCELIUM_MATCHER=hybrid`. The `conservative-char` candidate is currently eval-only in this hardening pass because production factory wiring was deliberately left unchanged.
