# Embedding Matcher Offline Evaluation

Date: 2026-06-19

## Verdict

**GO**: embedding matcher is worth a follow-up architecture/prototype phase.

This is not a production wiring recommendation for this patch. The offline data says the multilingual embedding candidate is strong enough to justify the future "break glass" work: it lifts test top-1 from KeywordMatcher's **61.4%** to **87.7%** (+26.3 pp) and F1 from **0.722** to **0.893** (+0.171), with query p95 **9.4 ms**, well inside the 800 ms consult budget. The cost is real: FP rises from **19.4%** to **22.6%**, the model cache is **464.8 MB**, and production use would require async model loading/index lifecycle work that this task deliberately did not do.

## Method

Command: `pnpm run eval:embedding`

Implementation:
- Offline-only script: `scripts/embedding-eval/run.ts`.
- Helper matcher: `scripts/embedding-eval/embedding-matcher.ts`.
- No existing `src/**` files changed; the script imports `harness.ts` for the exact same metric semantics.
- Embedding input text is `skill.name + skill.description + skill.keywords`.
- Skill corpus is the same eval corpus as `scripts/eval-matcher.ts`: 22 real snapshot skills plus 20 fixture skills, merged to 38 unique names.
- Cases are `tests/fixtures/matcher-cases.json`: 147 train, 62 test.
- Embedding threshold is tuned on train only over 0.05..0.95, maximizing `top-1 - FP`, then F1/top-1/lower FP as tie-breakers.
- Final numbers below are reported only on test split.

External references checked:
- Hugging Face Transformers.js supports the `feature-extraction` pipeline and `pipeline()` API: [Transformers.js pipelines](https://huggingface.co/docs/transformers.js/en/pipelines), [Hugging Face pipeline docs](https://huggingface.co/docs/transformers/en/main_classes/pipelines).
- FastEmbed-js is a local Node embedding option with ESM/CJS support and native tokenizer bindings: [fastembed-js](https://github.com/Anush008/fastembed-js).
- FastEmbed's supported-model list shows small local ONNX embedding candidates, including all-MiniLM and BGE small zh/en: [FastEmbed supported models](https://qdrant.github.io/fastembed/examples/Supported_Models/).

## Step 1: Candidate Selection

I measured two local Transformers.js candidates and kept the experiment to one added dev dependency: `@huggingface/transformers@4.2.0`. FastEmbed-js was reviewed as an alternative, but adding a second embedding stack was unnecessary for this bounded GO/NO-GO gate.

| candidate | local model | Chinese support | cache size | warm load | avg query | p95 query | threshold | test F1 | readout |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| minilm-en | `Xenova/all-MiniLM-L6-v2` | weak / English-focused | 86.9 MB | 531.2 ms | 4.8 ms | 7.0 ms | 0.43 | 0.723 | Too weak on zh/mixed; useful latency control only. |
| minilm-multilingual | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | yes / multilingual | 464.8 MB | 1806.7 ms | 7.4 ms | 9.4 ms | 0.50 | 0.893 | Strong semantic lift; main GO candidate. |

First uncached runs download models into `.cache/embedding-eval/`, which is gitignored. The multilingual model's first uncached run took about 510 s on this machine, dominated by download, so it is a setup/distribution cost rather than a consult hot-path latency.

## Step 2: Final Test Comparison

| matcher | split | threshold | cases | top-1 | FP | precision | recall | F1 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| keyword | test | - | 62 | 61.4% | 19.4% | 0.875 | 0.614 | 0.722 |
| bm25 | test | - | 62 | 73.7% | 54.8% | 0.689 | 0.737 | 0.712 |
| char-ngram | test | - | 62 | 61.4% | 12.9% | 0.897 | 0.614 | 0.729 |
| conservative-char | test | - | 62 | 70.2% | 9.7% | 0.851 | 0.702 | 0.769 |
| hybrid | test | - | 62 | 66.7% | 19.4% | 0.792 | 0.667 | 0.724 |
| embedding:minilm-en | test | 0.43 | 62 | 59.6% | 9.7% | 0.919 | 0.596 | 0.723 |
| embedding:minilm-multilingual | test | 0.50 | 62 | 87.7% | 22.6% | 0.909 | 0.877 | 0.893 |

Absolute lift versus KeywordMatcher:
- `embedding:minilm-multilingual`: top-1 **+26.3 pp**, F1 **+0.171**, FP **+3.2 pp**.
- `embedding:minilm-en`: top-1 **-1.8 pp**, F1 **+0.001**, FP **-9.7 pp**.

Absolute lift versus current best non-embedding candidate (`conservative-char`):
- `embedding:minilm-multilingual`: top-1 **+17.5 pp**, F1 **+0.124**, FP **+12.9 pp**.

## Slice Readout

The multilingual model wins in exactly the expected weak spots: Chinese, mixed-language prompts, and hard semantic disambiguation. The tradeoff is that FP gets worse in some easy and Chinese buckets.

| matcher | slice | bucket | cases | top-1 | FP |
|---|---|---|---:|---:|---:|
| keyword | lang | zh | 14 | 45.5% | 7.1% |
| conservative-char | lang | zh | 14 | 45.5% | 14.3% |
| embedding:minilm-multilingual | lang | zh | 14 | 81.8% | 28.6% |
| keyword | lang | en | 26 | 76.0% | 38.5% |
| conservative-char | lang | en | 26 | 96.0% | 7.7% |
| embedding:minilm-multilingual | lang | en | 26 | 88.0% | 26.9% |
| keyword | lang | mixed | 22 | 52.4% | 4.5% |
| conservative-char | lang | mixed | 22 | 52.4% | 9.1% |
| embedding:minilm-multilingual | lang | mixed | 22 | 90.5% | 13.6% |
| keyword | difficulty | hard | 21 | 35.0% | 14.3% |
| conservative-char | difficulty | hard | 21 | 55.0% | 4.8% |
| embedding:minilm-multilingual | difficulty | hard | 21 | 90.0% | 14.3% |

Full embedding slices from `eval:embedding`:

| model | slice | bucket | cases | top-1 | FP | F1 |
|---|---|---|---:|---:|---:|---:|
| minilm-en | lang | zh | 14 | 18.2% | 0.0% | 0.286 |
| minilm-en | lang | en | 26 | 96.0% | 19.2% | 0.960 |
| minilm-en | lang | mixed | 22 | 38.1% | 4.5% | 0.533 |
| minilm-en | difficulty | easy | 30 | 63.0% | 13.3% | 0.739 |
| minilm-en | difficulty | medium | 11 | 80.0% | 9.1% | 0.842 |
| minilm-en | difficulty | hard | 21 | 45.0% | 4.8% | 0.621 |
| minilm-multilingual | lang | zh | 14 | 81.8% | 28.6% | 0.818 |
| minilm-multilingual | lang | en | 26 | 88.0% | 26.9% | 0.898 |
| minilm-multilingual | lang | mixed | 22 | 90.5% | 13.6% | 0.927 |
| minilm-multilingual | difficulty | easy | 30 | 85.2% | 33.3% | 0.852 |
| minilm-multilingual | difficulty | medium | 11 | 90.0% | 9.1% | 0.900 |
| minilm-multilingual | difficulty | hard | 21 | 90.0% | 14.3% | 0.947 |

## Step 3: Cost And Decision

Latency reality:
- Query embedding plus nearest-neighbor lookup is far under the 800 ms consult budget: multilingual p95 was **9.4 ms** after the model was loaded and the skill index existed in memory.
- Warm model load was **1806.7 ms**, so production cannot load the model per request.
- First run downloads the model into `.cache/embedding-eval/`; production would need an explicit model cache/distribution story.

Dependency and architecture cost:
- This patch adds `@huggingface/transformers` only to `devDependencies`; runtime `dependencies` are unchanged.
- Promoting this to production would pull a heavy ONNX-backed stack and a roughly **465 MB** multilingual model into runtime distribution.
- The current `Matcher` path is synchronous. Real production use would need a preloaded embedding service/index lifecycle or a deliberate async consult redesign. That is outside this bounded task.

Hard decision:
- **GO** for a follow-up architecture prototype because the semantic lift is too large to ignore: **87.7% top-1 / 0.893 F1** versus KeywordMatcher's **61.4% / 0.722**, and it wins the hard slice **90.0%** versus KeywordMatcher **35.0%**.
- **Do not wire it directly into production yet**. The next phase must prove a conservative FP gate, likely a two-stage design where lexical/negative guards suppress embedding's extra false positives before any async consult change is accepted.
