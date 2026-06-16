import { Brain } from '../../src/brain/consult.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { SettingsStore } from '../../src/brain/settings.js'
import { PREF_KEYS } from '../../src/brain/prefs.js'
import { openDb } from '../../src/ledger/db.js'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function makeBrain(skillsDir: string) {
  const repo = new SkillRepository(skillsDir)
  repo.scan()
  const led = new SynapseLedger(openDb(':memory:'))
  return new Brain(repo, new KeywordMatcher(), led, { skillsDir })
}

function makeBrainZh(skillsDir: string) {
  const repo = new SkillRepository(skillsDir)
  repo.scan()
  const db = openDb(':memory:')
  const led = new SynapseLedger(db)
  const settings = new SettingsStore(db)
  settings.set(PREF_KEYS.primaryLanguage, 'zh')
  return new Brain(repo, new KeywordMatcher(), led, { skillsDir, settings })
}

const GOOD_MD = [
  '---',
  'name: youtube-pipeline',
  'description: Build a fully automated YouTube video pipeline end to end',
  '---',
  '# YouTube pipeline',
  '',
  'Step-by-step guidance with enough real body text to clear the contract floor.',
].join('\n')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'myc-reg-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test('a well-formed skill lands and is immediately consultable', () => {
  const b = makeBrain(dir)
  const r = b.registerSkill({ skillMd: GOOD_MD, purpose: 'automate youtube video production', tool: 'cockpit' })
  expect(r.ok).toBe(true)
  expect(r.skill).toBe('youtube-pipeline')
  expect(existsSync(join(dir, 'youtube-pipeline', 'SKILL.md'))).toBe(true)
})

test('rejects missing name frontmatter', () => {
  const b = makeBrain(dir)
  const r = b.registerSkill({ skillMd: '# no frontmatter here at all\nbody', purpose: 'something useful', tool: 'cockpit' })
  expect(r.ok).toBe(false)
  expect(r.reason).toMatch(/name/)
})

test('rejects a non-kebab skill name', () => {
  const b = makeBrain(dir)
  const md = GOOD_MD.replace('name: youtube-pipeline', 'name: Youtube Pipeline!!')
  const r = b.registerSkill({ skillMd: md, purpose: 'automate youtube video production', tool: 'cockpit' })
  expect(r.ok).toBe(false)
  expect(r.reason).toMatch(/kebab/)
})

test('rejects an empty description', () => {
  const b = makeBrain(dir)
  const md = GOOD_MD.replace('description: Build a fully automated YouTube video pipeline end to end', 'description:')
  const r = b.registerSkill({ skillMd: md, purpose: 'automate youtube video production', tool: 'cockpit' })
  expect(r.ok).toBe(false)
  expect(r.reason).toMatch(/description/)
})

test('rejects a too-thin body', () => {
  const b = makeBrain(dir)
  const md = ['---', 'name: thin-skill', 'description: a skill with no real body', '---', 'tiny'].join('\n')
  const r = b.registerSkill({ skillMd: md, purpose: 'a meaningful purpose line', tool: 'cockpit' })
  expect(r.ok).toBe(false)
  expect(r.reason).toMatch(/body/)
})

test('rejects a too-short purpose', () => {
  const b = makeBrain(dir)
  const r = b.registerSkill({ skillMd: GOOD_MD, purpose: 'eh', tool: 'cockpit' })
  expect(r.ok).toBe(false)
  expect(r.reason).toMatch(/purpose/)
})

test('rejects a duplicate name', () => {
  const b = makeBrain(dir)
  expect(b.registerSkill({ skillMd: GOOD_MD, purpose: 'automate youtube video production', tool: 'cockpit' }).ok).toBe(true)
  const again = b.registerSkill({ skillMd: GOOD_MD, purpose: 'automate youtube video production', tool: 'cockpit' })
  expect(again.ok).toBe(false)
  expect(again.reason).toMatch(/already exists/)
})

test('a skill built from a Chinese task is findable by that same task via injected keywords', () => {
  // The bug: an English-only SKILL.md built in response to a Chinese task shares only the lone
  // latin word with it (shared=1 → no match). Injecting the task's CJK keywords fixes it.
  const repo = new SkillRepository(dir)
  repo.scan()
  const led = new SynapseLedger(openDb(':memory:'))
  const b = new Brain(repo, new KeywordMatcher(), led, { skillsDir: dir })
  const md = [
    '---',
    'name: rust-embedded-isr',
    'description: Write safe interrupt handlers in Rust embedded firmware',
    '---',
    '# Rust ISR',
    '',
    'Guidance for writing interrupt handlers with enough body to clear the contract floor.',
  ].join('\n')
  const task = '用 Rust 写一个 MIDI 固件的中断处理'
  // without keywords → not matchable
  expect(b.consult({ task, tool: 'c' }).verdict).not.toBe('reuse')
  // register WITH the trigger task's CJK keywords
  const r = b.registerSkill({
    skillMd: md,
    purpose: '在 Rust 嵌入式固件里写中断处理',
    tool: 'cockpit',
    keywords: ['midi', '固件', '中断处理', '中断', '嵌入式'],
  })
  expect(r.ok).toBe(true)
  // now the SAME Chinese task finds it
  const after = b.consult({ task, tool: 'c' })
  expect(after.verdict).toBe('reuse')
  if (after.verdict === 'reuse') expect(after.skill).toBe('rust-embedded-isr')
})

test('primaryLanguage=zh REQUIRES keywords on register_skill', () => {
  const b = makeBrainZh(dir)
  // no keywords → rejected by the language contract
  const without = b.registerSkill({ skillMd: GOOD_MD, purpose: 'automate youtube video production', tool: 'cockpit' })
  expect(without.ok).toBe(false)
  expect(without.reason).toMatch(/keywords/)
  // with keywords → accepted
  const withKw = b.registerSkill({
    skillMd: GOOD_MD,
    purpose: 'automate youtube video production',
    tool: 'cockpit',
    keywords: ['视频', '自动化'],
  })
  expect(withKw.ok).toBe(true)
})

test('default primaryLanguage (auto) does NOT require keywords', () => {
  const b = makeBrain(dir) // no settings → DEFAULT_PREFS.primaryLanguage = 'auto'
  const r = b.registerSkill({ skillMd: GOOD_MD, purpose: 'automate youtube video production', tool: 'cockpit' })
  expect(r.ok).toBe(true)
})
