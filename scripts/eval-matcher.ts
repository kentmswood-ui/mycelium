import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KeywordMatcher } from '../src/brain/matcher.js'
import { parseSkill } from '../src/skills/skill.js'

interface GoldenCase {
  task: string
  lang: 'zh' | 'en' | 'mixed'
  expect: string | null
  notExpect?: string[]
  note: string
}

interface EvalResult {
  index: number
  item: GoldenCase
  actual: string | null
  top1Ok: boolean
  falsePositive: boolean
  notExpectHit: string | null
}

const MIN_TOP1_ACCURACY = 0.95
const MAX_FALSE_POSITIVE_RATE = 0.05

const red = '\x1b[31m'
const bold = '\x1b[1m'
const reset = '\x1b[0m'

function loadFixtureSkills(repoRoot: string) {
  const skillsRoot = join(repoRoot, 'tests', 'fixtures', 'skills')
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseSkill(join(skillsRoot, entry.name)))
    .filter((skill) => skill !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function loadGoldenSet(repoRoot: string): GoldenCase[] {
  const goldenPath = join(repoRoot, 'tests', 'fixtures', 'matcher-golden.json')
  return JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenCase[]
}

function assertGoldenReferences(cases: GoldenCase[], skillNames: Set<string>) {
  const missing = new Set<string>()
  for (const item of cases) {
    if (item.expect && !skillNames.has(item.expect)) missing.add(item.expect)
    for (const name of item.notExpect ?? []) {
      if (!skillNames.has(name)) missing.add(name)
    }
  }
  if (missing.size > 0) {
    throw new Error(`Golden set references missing fixture skills: ${[...missing].sort().join(', ')}`)
  }
}

function evaluate(cases: GoldenCase[], repoRoot: string): EvalResult[] {
  const skills = loadFixtureSkills(repoRoot)
  const skillNames = new Set(skills.map((skill) => skill.name))
  assertGoldenReferences(cases, skillNames)

  const matcher = new KeywordMatcher()
  return cases.map((item, index) => {
    const matches = matcher.match(item.task, skills)
    const actual = matches[0]?.skill.name ?? null
    const notExpect = new Set(item.notExpect ?? [])
    const notExpectHit = matches.find((match) => notExpect.has(match.skill.name))?.skill.name ?? null
    return {
      index,
      item,
      actual,
      top1Ok: item.expect === actual,
      falsePositive: (item.expect === null && actual !== null) || notExpectHit !== null,
      notExpectHit,
    }
  })
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function cell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function clip(value: string, max = 64) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function printTable(results: EvalResult[]) {
  console.log('| # | lang | expected | actual | result | task | note |')
  console.log('|---:|:---:|---|---|:---:|---|---|')
  for (const result of results) {
    const expected = result.item.expect ?? 'null'
    const actual = result.actual ?? 'null'
    const ok = result.top1Ok && !result.falsePositive
    const marker = ok ? '✓' : '✗'
    const note =
      result.notExpectHit === null
        ? result.item.note
        : `${result.item.note}; notExpect hit: ${result.notExpectHit}`
    const row = `| ${result.index + 1} | ${result.item.lang} | ${expected} | ${actual} | ${marker} | ${cell(
      clip(result.item.task),
    )} | ${cell(clip(note, 72))} |`
    console.log(ok ? row : `${red}${row}${reset}`)
  }
}

function main() {
  const repoRoot = process.cwd()
  const cases = loadGoldenSet(repoRoot)
  const results = evaluate(cases, repoRoot)

  const positive = results.filter((result) => result.item.expect !== null)
  const top1Hits = positive.filter((result) => result.top1Ok).length
  const falsePositives = results.filter((result) => result.falsePositive).length
  const top1Accuracy = positive.length === 0 ? 0 : top1Hits / positive.length
  const falsePositiveRate = results.length === 0 ? 0 : falsePositives / results.length
  const failures = results.filter((result) => !result.top1Ok || result.falsePositive)

  console.log(`${bold}Matcher fixture benchmark${reset}`)
  console.log(`cases=${results.length}, positive=${positive.length}`)
  console.log(`top-1 accuracy=${pct(top1Accuracy)} (${top1Hits}/${positive.length})`)
  console.log(`false-positive rate=${pct(falsePositiveRate)} (${falsePositives}/${results.length})`)
  console.log(
    `thresholds: top-1 >= ${pct(MIN_TOP1_ACCURACY)}, false-positive <= ${pct(
      MAX_FALSE_POSITIVE_RATE,
    )}`,
  )
  console.log()
  printTable(results)

  if (top1Accuracy < MIN_TOP1_ACCURACY || falsePositiveRate > MAX_FALSE_POSITIVE_RATE) {
    console.error(
      `${red}Benchmark failed: top-1=${pct(top1Accuracy)}, false-positive=${pct(
        falsePositiveRate,
      )}, failing rows=${failures.length}${reset}`,
    )
    process.exitCode = 1
  }
}

main()
