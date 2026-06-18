import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSkill } from '../../src/skills/skill.js'

type Lang = 'zh' | 'en' | 'mixed'
type Difficulty = 'easy' | 'medium' | 'hard'
type Split = 'train' | 'test'

interface SnapshotSkill {
  name: string
  description: string
  keywords: string[]
}

interface MatcherCase {
  id: string
  task: string
  lang: Lang
  expect: string | null
  notExpect?: string[]
  note: string
  difficulty: Difficulty
  split: Split
}

const LANGS = new Set<Lang>(['zh', 'en', 'mixed'])
const DIFFICULTIES = new Set<Difficulty>(['easy', 'medium', 'hard'])

function hashId(id: string): number {
  let h = 2166136261
  for (const ch of id) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function expectedSplit(id: string): Split {
  return hashId(id) % 10 < 7 ? 'train' : 'test'
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function fixtureSkillNames() {
  const skillsRoot = join(process.cwd(), 'tests', 'fixtures', 'skills')
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseSkill(join(skillsRoot, entry.name)))
    .filter((skill) => skill !== null)
    .map((skill) => skill.name)
}

test('real skill snapshot contains frontmatter only', () => {
  const skills = readJson<SnapshotSkill[]>(
    join(process.cwd(), 'tests', 'fixtures', 'real-skills.snapshot.json'),
  )

  expect(skills.length).toBeGreaterThanOrEqual(21)
  expect([...new Set(skills.map((skill) => skill.name))].sort()).toEqual(
    skills.map((skill) => skill.name),
  )
  for (const skill of skills) {
    expect(skill.name).toMatch(/^[a-z0-9][a-z0-9-]+$/)
    expect(skill.description.trim().length).toBeGreaterThan(0)
    expect(Array.isArray(skill.keywords)).toBe(true)
    expect(Object.keys(skill).sort()).toEqual(['description', 'keywords', 'name'])
  }
})

test('matcher cases are complete, deterministic, and reference known skills', () => {
  const cases = readJson<MatcherCase[]>(join(process.cwd(), 'tests', 'fixtures', 'matcher-cases.json'))
  const realSkillNames = readJson<SnapshotSkill[]>(
    join(process.cwd(), 'tests', 'fixtures', 'real-skills.snapshot.json'),
  ).map((skill) => skill.name)
  const skillNames = new Set([...realSkillNames, ...fixtureSkillNames()])
  const ids = new Set<string>()
  const langs = new Set<Lang>()
  const difficulties = new Set<Difficulty>()
  const splits = new Set<Split>()

  expect(cases.length).toBeGreaterThanOrEqual(200)

  for (const item of cases) {
    expect(item.id).toMatch(/^[a-z0-9-]+$/)
    expect(ids.has(item.id)).toBe(false)
    ids.add(item.id)

    expect(item.task.trim().length).toBeGreaterThan(3)
    expect(LANGS.has(item.lang)).toBe(true)
    expect(DIFFICULTIES.has(item.difficulty)).toBe(true)
    expect(item.split).toBe(expectedSplit(item.id))
    expect(item.note.trim().length).toBeGreaterThan(0)

    langs.add(item.lang)
    difficulties.add(item.difficulty)
    splits.add(item.split)

    if (item.expect !== null) expect(skillNames.has(item.expect)).toBe(true)
    for (const name of item.notExpect ?? []) {
      expect(skillNames.has(name)).toBe(true)
      expect(name).not.toBe(item.expect)
    }
  }

  expect([...langs].sort()).toEqual(['en', 'mixed', 'zh'])
  expect([...difficulties].sort()).toEqual(['easy', 'hard', 'medium'])
  expect([...splits].sort()).toEqual(['test', 'train'])
})
