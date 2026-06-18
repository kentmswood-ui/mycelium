import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { parseSkill } from '../../src/skills/skill.js'

interface GoldenCase {
  task: string
  lang: 'zh' | 'en' | 'mixed'
  expect: string | null
  notExpect?: string[]
  note: string
}

function loadFixtureSkills() {
  const skillsRoot = join(process.cwd(), 'tests', 'fixtures', 'skills')
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseSkill(join(skillsRoot, entry.name)))
    .filter((skill) => skill !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function loadGoldenSet(): GoldenCase[] {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'tests', 'fixtures', 'matcher-golden.json'), 'utf8'),
  ) as GoldenCase[]
}

test('matcher golden set references only fixture skills', () => {
  const skills = loadFixtureSkills()
  const skillNames = new Set(skills.map((skill) => skill.name))
  const missing = new Set<string>()

  for (const item of loadGoldenSet()) {
    if (item.expect && !skillNames.has(item.expect)) missing.add(item.expect)
    for (const name of item.notExpect ?? []) {
      if (!skillNames.has(name)) missing.add(name)
    }
  }

  expect([...missing]).toEqual([])
})

test('matcher stays above the fixture quality benchmark', () => {
  const skills = loadFixtureSkills()
  const matcher = new KeywordMatcher()
  const results = loadGoldenSet().map((item) => {
    const matches = matcher.match(item.task, skills)
    const actual = matches[0]?.skill.name ?? null
    const notExpect = new Set(item.notExpect ?? [])
    const notExpectHit = matches.some((match) => notExpect.has(match.skill.name))
    return {
      item,
      actual,
      top1Ok: item.expect === actual,
      falsePositive: (item.expect === null && actual !== null) || notExpectHit,
    }
  })

  const positive = results.filter((result) => result.item.expect !== null)
  const top1Hits = positive.filter((result) => result.top1Ok).length
  const falsePositives = results.filter((result) => result.falsePositive).length
  const top1Accuracy = top1Hits / positive.length
  const falsePositiveRate = falsePositives / results.length

  // Baseline measured on 2026-06-18 with this fixture corpus:
  // top-1 accuracy = 100.0% (53/53), false-positive rate = 0.0% (0/63).
  // Thresholds leave margin while still catching meaningful matcher regressions.
  expect(top1Accuracy).toBeGreaterThanOrEqual(0.95)
  expect(falsePositiveRate).toBeLessThanOrEqual(0.05)
})
