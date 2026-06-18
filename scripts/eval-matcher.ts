// ANTI-CHEAT CONTRACT:
// - Tuning and iteration may inspect train split output only.
// - `--split=test` may be run only once at the end of phase 4, after tuning is frozen.
// - `--split=all` includes test rows and is therefore final-report-only, never for tuning.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KeywordMatcher } from '../src/brain/matcher.js'
import type { Matcher } from '../src/brain/matcher.js'
import { Bm25Matcher } from '../src/brain/matchers/bm25.js'
import { CharNgramMatcher } from '../src/brain/matchers/char-ngram.js'
import { ConservativeCharMatcher } from '../src/brain/matchers/conservative-char.js'
import { AliasPrecisionGuardMatcher } from '../src/brain/matchers/alias-precision-guard.js'
import { HybridMatcher } from '../src/brain/matchers/hybrid.js'
import { PrecisionGuardMatcher } from '../src/brain/matchers/precision-guard.js'
import {
  evaluateMatcher,
  selectCases,
  warningForSplit,
  type MatcherCase,
  type MatcherEvaluation,
  type SplitArg,
} from '../src/brain/matchers/harness.js'
import { aliasedSkills } from '../src/brain/aliases.js'
import { parseSkill, tokenize, type Skill } from '../src/skills/skill.js'

interface SnapshotSkill {
  name: string
  description: string
  keywords: string[]
}

const MATCHERS: Record<string, () => Matcher> = {
  keyword: () => new KeywordMatcher(),
  bm25: () => new Bm25Matcher(),
  'char-ngram': () => new CharNgramMatcher(),
  'conservative-char': () => new ConservativeCharMatcher(),
  hybrid: () => new HybridMatcher(),
  'precision-guard': () => new PrecisionGuardMatcher(),
  'alias-precision-guard': () => new AliasPrecisionGuardMatcher(),
}

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
    const merged = {
      ...prev,
      description: `${prev.description}\n${skill.description}`.trim(),
      keywords: [...new Set([...prev.keywords, ...skill.keywords])].sort(),
      tokens: [...new Set([...prev.tokens, ...skill.tokens])],
    }
    byName.set(skill.name, merged)
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function loadCorpus(repoRoot: string) {
  const snapshots = readJson<SnapshotSkill[]>(
    join(repoRoot, 'tests', 'fixtures', 'real-skills.snapshot.json'),
  ).map(snapshotToSkill)
  return aliasedSkills(mergeSkills([...snapshots, ...loadFixtureSkills(repoRoot)]))
}

function matcherNames(requested: string) {
  if (requested === 'all') return Object.keys(MATCHERS).sort()
  if (!MATCHERS[requested]) {
    throw new Error(`unknown matcher "${requested}"; available: ${Object.keys(MATCHERS).sort().join(', ')}`)
  }
  return [requested]
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function fmt(n: number) {
  return n.toFixed(3)
}

function cell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function clip(value: string, max = 86) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function printSummary(evaluations: MatcherEvaluation[], split: SplitArg) {
  console.log('| matcher | split | cases | top-1 | FP | precision | recall | F1 |')
  console.log('|---|---|---:|---:|---:|---:|---:|---:|')
  for (const evaluation of evaluations) {
    const m = evaluation.metrics
    console.log(
      `| ${evaluation.matcher} | ${split} | ${m.total} | ${pct(m.top1Accuracy)} | ${pct(
        m.falsePositiveRate,
      )} | ${fmt(m.precision)} | ${fmt(m.recall)} | ${fmt(m.f1)} |`,
    )
  }
}

function printBreakdowns(evaluation: MatcherEvaluation) {
  console.log(`\n## ${evaluation.matcher} by difficulty`)
  console.log('| difficulty | cases | top-1 | FP |')
  console.log('|---|---:|---:|---:|')
  for (const key of ['easy', 'medium', 'hard'] as const) {
    const m = evaluation.byDifficulty[key]
    console.log(`| ${key} | ${m.total} | ${pct(m.top1Accuracy)} | ${pct(m.falsePositiveRate)} |`)
  }

  console.log(`\n## ${evaluation.matcher} by language`)
  console.log('| lang | cases | top-1 | FP |')
  console.log('|---|---:|---:|---:|')
  for (const key of ['zh', 'en', 'mixed'] as const) {
    const m = evaluation.byLang[key]
    console.log(`| ${key} | ${m.total} | ${pct(m.top1Accuracy)} | ${pct(m.falsePositiveRate)} |`)
  }
}

function printConfusions(evaluation: MatcherEvaluation, limit = 25) {
  console.log(`\n## ${evaluation.matcher} confusions (showing ${Math.min(limit, evaluation.confusions.length)})`)
  console.log('| id | expected | actual | top3 | note | task |')
  console.log('|---|---|---|---|---|---|')
  for (const row of evaluation.confusions.slice(0, limit)) {
    const top3 = row.top3.map((hit) => `${hit.skill}:${fmt(hit.score)}`).join(', ')
    const suffix = row.notExpectHit ? `; notExpect hit=${row.notExpectHit}` : ''
    console.log(
      `| ${row.id} | ${row.expected ?? 'null'} | ${row.actual ?? 'null'} | ${cell(top3)} | ${cell(
        row.note + suffix,
      )} | ${cell(clip(row.task))} |`,
    )
  }
}

function main() {
  const split = argValue('split', 'train') as SplitArg
  if (!['train', 'test', 'all'].includes(split)) {
    throw new Error(`invalid --split=${split}; expected train, test, or all`)
  }
  const requestedMatcher = argValue('matcher', 'all')
  const names = matcherNames(requestedMatcher)
  const warning = warningForSplit(split)
  if (warning) console.error(`\n${warning}\n`)

  const repoRoot = process.cwd()
  const skills = loadCorpus(repoRoot)
  const allCases = readJson<MatcherCase[]>(join(repoRoot, 'tests', 'fixtures', 'matcher-cases.json'))
  const cases = selectCases(allCases, split)
  const evaluations = names.map((name) => evaluateMatcher(name, MATCHERS[name](), skills, cases))

  console.log(`# Matcher benchmark`)
  console.log(`skills=${skills.length}, cases=${cases.length}, split=${split}, matcher=${requestedMatcher}\n`)
  printSummary(evaluations, split)
  for (const evaluation of evaluations) {
    printBreakdowns(evaluation)
    printConfusions(evaluation)
  }
}

main()
