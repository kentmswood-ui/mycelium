import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { env, pipeline } from '@huggingface/transformers'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import type { Matcher } from '../../src/brain/matcher.js'
import { Bm25Matcher } from '../../src/brain/matchers/bm25.js'
import { CharNgramMatcher } from '../../src/brain/matchers/char-ngram.js'
import { ConservativeCharMatcher } from '../../src/brain/matchers/conservative-char.js'
import { HybridMatcher } from '../../src/brain/matchers/hybrid.js'
import {
  evaluateMatcher,
  selectCases,
  type MatcherCase,
  type MatcherEvaluation,
  type Split,
} from '../../src/brain/matchers/harness.js'
import { parseSkill, tokenize, type Skill } from '../../src/skills/skill.js'
import { normalizeVector, PrecomputedEmbeddingMatcher, type Vector } from './embedding-matcher.js'

interface SnapshotSkill {
  name: string
  description: string
  keywords: string[]
}

interface ModelSpec {
  key: string
  model: string
  label: string
  chinese: string
  notes: string
}

interface ModelResult {
  spec: ModelSpec
  threshold: number
  cacheBytes: number
  loadMs: number
  avgQueryMs: number
  p95QueryMs: number
  train: MatcherEvaluation
  test: MatcherEvaluation
}

const MODEL_SPECS: ModelSpec[] = [
  {
    key: 'minilm-en',
    model: 'Xenova/all-MiniLM-L6-v2',
    label: 'Transformers.js all-MiniLM-L6-v2',
    chinese: 'weak / English-focused',
    notes: 'Small sentence-transformers baseline; useful latency control, not expected to win Chinese cases.',
  },
  {
    key: 'minilm-multilingual',
    model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    label: 'Transformers.js paraphrase-multilingual-MiniLM-L12-v2',
    chinese: 'yes / multilingual',
    notes: 'Small multilingual sentence-transformers model; main candidate for semantic Chinese/hard cases.',
  },
]

const BASELINE_MATCHERS: Record<string, () => Matcher> = {
  keyword: () => new KeywordMatcher(),
  bm25: () => new Bm25Matcher(),
  'char-ngram': () => new CharNgramMatcher(),
  'conservative-char': () => new ConservativeCharMatcher(),
  hybrid: () => new HybridMatcher(),
}

const CACHE_DIR = resolve(process.cwd(), '.cache', 'embedding-eval')

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function uniqueTokens(skill: Pick<Skill, 'name' | 'description' | 'keywords'>) {
  return [
    ...new Set([
      ...tokenize(skill.name),
      ...tokenize(skill.description),
      ...skill.keywords.flatMap(tokenize),
    ]),
  ]
}

function snapshotToSkill(skill: SnapshotSkill): Skill {
  return {
    name: skill.name,
    description: skill.description,
    keywords: skill.keywords,
    dir: `snapshot:${skill.name}`,
    source: 'cc-switch-snapshot',
    tokens: uniqueTokens(skill),
  }
}

function loadFixtureSkills(repoRoot: string) {
  const skillsRoot = join(repoRoot, 'tests', 'fixtures', 'skills')
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseSkill(join(skillsRoot, entry.name)))
    .filter((skill) => skill !== null)
}

function mergeSkills(skills: Skill[]): Skill[] {
  const byName = new Map<string, Skill>()
  for (const skill of skills) {
    const prev = byName.get(skill.name)
    if (!prev) {
      byName.set(skill.name, skill)
      continue
    }
    byName.set(skill.name, {
      ...prev,
      description: `${prev.description}\n${skill.description}`.trim(),
      keywords: [...new Set([...prev.keywords, ...skill.keywords])].sort(),
      tokens: [...new Set([...prev.tokens, ...skill.tokens])],
    })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function loadCorpus(repoRoot: string) {
  const snapshots = readJson<SnapshotSkill[]>(
    join(repoRoot, 'tests', 'fixtures', 'real-skills.snapshot.json'),
  ).map(snapshotToSkill)
  return mergeSkills([...snapshots, ...loadFixtureSkills(repoRoot)])
}

function skillText(skill: Skill) {
  return [skill.name, skill.description, ...skill.keywords].join('\n')
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function fmt(n: number) {
  return n.toFixed(3)
}

function ms(n: number) {
  return n.toFixed(1)
}

function bytes(n: number) {
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function dirSize(path: string): number {
  let total = 0
  try {
    const stat = statSync(path)
    if (stat.isFile()) return stat.size
  } catch {
    return 0
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    total += dirSize(join(path, entry.name))
  }
  return total
}

function modelCacheBytes(spec: ModelSpec) {
  return dirSize(join(CACHE_DIR, ...spec.model.split('/')))
}

function toVector(output: unknown): Vector {
  const tensor = output as { data?: Iterable<number>; tolist?: () => unknown }
  if (tensor.data) return normalizeVector([...tensor.data].map(Number))
  const listed = tensor.tolist?.()
  if (Array.isArray(listed) && Array.isArray(listed[0])) return normalizeVector(listed[0].map(Number))
  throw new Error('unexpected embedding tensor shape')
}

async function embedOne(extractor: (text: string, opts: object) => Promise<unknown>, text: string) {
  return toVector(await extractor(text, { pooling: 'mean', normalize: true }))
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

function tuneThreshold(
  name: string,
  skills: Skill[],
  cases: MatcherCase[],
  queryVectors: Map<string, Vector>,
  skillVectors: Map<string, Vector>,
) {
  const candidates: number[] = []
  for (let value = 0.05; value <= 0.95; value += 0.01) candidates.push(Number(value.toFixed(2)))

  return candidates
    .map((threshold) => {
      const matcher = new PrecomputedEmbeddingMatcher({ queryVectors, skillVectors, threshold })
      return { threshold, evaluation: evaluateMatcher(name, matcher, skills, cases) }
    })
    .sort((a, b) => {
      const am = a.evaluation.metrics
      const bm = b.evaluation.metrics
      const aObjective = am.top1Accuracy - am.falsePositiveRate
      const bObjective = bm.top1Accuracy - bm.falsePositiveRate
      return (
        bObjective - aObjective ||
        bm.f1 - am.f1 ||
        bm.top1Accuracy - am.top1Accuracy ||
        am.falsePositiveRate - bm.falsePositiveRate ||
        b.threshold - a.threshold
      )
    })[0]
}

async function evaluateEmbeddingModel(spec: ModelSpec, skills: Skill[], cases: MatcherCase[]): Promise<ModelResult> {
  mkdirSync(CACHE_DIR, { recursive: true })
  env.cacheDir = CACHE_DIR
  env.allowLocalModels = true
  env.allowRemoteModels = true

  const loadStart = performance.now()
  const extractor = (await pipeline('feature-extraction', spec.model)) as (
    text: string,
    opts: object,
  ) => Promise<unknown>
  const loadMs = performance.now() - loadStart

  const skillVectors = new Map<string, Vector>()
  for (const skill of skills) {
    skillVectors.set(skill.name, await embedOne(extractor, skillText(skill)))
  }

  const queryVectors = new Map<string, Vector>()
  for (const item of cases) {
    queryVectors.set(item.task, await embedOne(extractor, item.task))
  }

  const train = selectCases(cases, 'train')
  const test = selectCases(cases, 'test')
  const tuned = tuneThreshold(`embedding:${spec.key}`, skills, train, queryVectors, skillVectors)
  const matcher = new PrecomputedEmbeddingMatcher({
    queryVectors,
    skillVectors,
    threshold: tuned.threshold,
  })

  const queryTimes: number[] = []
  for (const item of test) {
    const start = performance.now()
    const vector = await embedOne(extractor, item.task)
    queryVectors.set(item.task, vector)
    matcher.match(item.task, skills)
    queryTimes.push(performance.now() - start)
  }

  return {
    spec,
    threshold: tuned.threshold,
    cacheBytes: modelCacheBytes(spec),
    loadMs,
    avgQueryMs: queryTimes.reduce((sum, value) => sum + value, 0) / Math.max(queryTimes.length, 1),
    p95QueryMs: percentile(queryTimes, 95),
    train: tuned.evaluation,
    test: evaluateMatcher(`embedding:${spec.key}`, matcher, skills, test),
  }
}

function printMetricRow(name: string, split: Split, evaluation: MatcherEvaluation, threshold = '-') {
  const m = evaluation.metrics
  console.log(
    `| ${name} | ${split} | ${threshold} | ${m.total} | ${pct(m.top1Accuracy)} | ${pct(
      m.falsePositiveRate,
    )} | ${fmt(m.precision)} | ${fmt(m.recall)} | ${fmt(m.f1)} |`,
  )
}

function printBaselineTable(skills: Skill[], cases: MatcherCase[]) {
  const test = selectCases(cases, 'test')
  console.log('## Test Split Matcher Comparison')
  console.log('| matcher | split | threshold | cases | top-1 | FP | precision | recall | F1 |')
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const [name, makeMatcher] of Object.entries(BASELINE_MATCHERS)) {
    printMetricRow(name, 'test', evaluateMatcher(name, makeMatcher(), skills, test))
  }
}

function printSlices(result: ModelResult) {
  console.log(`\n## Slices: embedding:${result.spec.key}`)
  console.log('| slice | bucket | cases | top-1 | FP | F1 |')
  console.log('|---|---|---:|---:|---:|---:|')
  for (const [bucket, metrics] of Object.entries(result.test.byLang)) {
    console.log(
      `| lang | ${bucket} | ${metrics.total} | ${pct(metrics.top1Accuracy)} | ${pct(
        metrics.falsePositiveRate,
      )} | ${fmt(metrics.f1)} |`,
    )
  }
  for (const [bucket, metrics] of Object.entries(result.test.byDifficulty)) {
    console.log(
      `| difficulty | ${bucket} | ${metrics.total} | ${pct(metrics.top1Accuracy)} | ${pct(
        metrics.falsePositiveRate,
      )} | ${fmt(metrics.f1)} |`,
    )
  }
}

async function main() {
  const repoRoot = process.cwd()
  const requested = new Set(argValue('models', MODEL_SPECS.map((spec) => spec.key).join(',')).split(','))
  const selected = MODEL_SPECS.filter((spec) => requested.has(spec.key) || requested.has(spec.model))
  if (selected.length === 0) {
    throw new Error(`no matching models; available: ${MODEL_SPECS.map((spec) => spec.key).join(', ')}`)
  }

  const skills = loadCorpus(repoRoot)
  const cases = readJson<MatcherCase[]>(join(repoRoot, 'tests', 'fixtures', 'matcher-cases.json'))
  const testCount = selectCases(cases, 'test').length
  const trainCount = selectCases(cases, 'train').length
  console.log(`# Embedding matcher offline evaluation`)
  console.log(`skills=${skills.length}, train=${trainCount}, test=${testCount}, cache=${CACHE_DIR}\n`)
  printBaselineTable(skills, cases)

  const results: ModelResult[] = []
  for (const spec of selected) {
    console.log(`\n## Running embedding model: ${spec.key} (${spec.model})`)
    results.push(await evaluateEmbeddingModel(spec, skills, cases))
  }

  console.log('\n## Embedding Model Measurements')
  console.log('| model | HF id | Chinese | cache size | load ms | avg query ms | p95 query ms | tuned threshold | train F1 | test F1 | notes |')
  console.log('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|')
  for (const result of results) {
    console.log(
      `| ${result.spec.key} | ${result.spec.model} | ${result.spec.chinese} | ${bytes(result.cacheBytes)} | ${ms(
        result.loadMs,
      )} | ${ms(result.avgQueryMs)} | ${ms(result.p95QueryMs)} | ${result.threshold.toFixed(2)} | ${fmt(
        result.train.metrics.f1,
      )} | ${fmt(result.test.metrics.f1)} | ${result.spec.notes} |`,
    )
  }

  console.log('\n## Final Test Comparison Including Embeddings')
  console.log('| matcher | split | threshold | cases | top-1 | FP | precision | recall | F1 |')
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const [name, makeMatcher] of Object.entries(BASELINE_MATCHERS)) {
    printMetricRow(name, 'test', evaluateMatcher(name, makeMatcher(), skills, selectCases(cases, 'test')))
  }
  for (const result of results) {
    printMetricRow(`embedding:${result.spec.key}`, 'test', result.test, result.threshold.toFixed(2))
  }

  for (const result of results) printSlices(result)
}

main()
