import { syncSkillsTo } from '../../src/adapters/sync.js'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('sync makes skills visible at target (junction or copy)', () => {
  const base = mkdtempSync(join(tmpdir(), 'myc-sync-'))
  const src = join(base, 'skills', 'demo')
  mkdirSync(src, { recursive: true })
  writeFileSync(join(src, 'SKILL.md'), '---\nname: demo\n---\n# demo')
  const target = join(base, 'tool', 'skills')
  syncSkillsTo(join(base, 'skills'), target)
  expect(existsSync(join(target, 'demo', 'SKILL.md'))).toBe(true)
  expect(readFileSync(join(target, 'demo', 'SKILL.md'), 'utf8')).toMatch(/name: demo/)
})

test('sync is idempotent (second call does not throw)', () => {
  const base = mkdtempSync(join(tmpdir(), 'myc-sync2-'))
  mkdirSync(join(base, 'skills'), { recursive: true })
  const target = join(base, 'tool', 'skills')
  syncSkillsTo(join(base, 'skills'), target)
  expect(() => syncSkillsTo(join(base, 'skills'), target)).not.toThrow()
})

test('sync never destroys a pre-existing real target dir (merges instead)', () => {
  const base = mkdtempSync(join(tmpdir(), 'myc-sync3-'))
  // canonical has one skill
  const canon = join(base, 'skills')
  mkdirSync(join(canon, 'mine'), { recursive: true })
  writeFileSync(join(canon, 'mine', 'SKILL.md'), '---\nname: mine\n---\n# mine')
  // target already exists as a REAL dir with the tool's own skill
  const target = join(base, 'tool', 'skills')
  mkdirSync(join(target, 'theirs'), { recursive: true })
  writeFileSync(join(target, 'theirs', 'SKILL.md'), '---\nname: theirs\n---\n# theirs')

  syncSkillsTo(canon, target)

  // their pre-existing skill MUST survive, and ours is merged in
  expect(existsSync(join(target, 'theirs', 'SKILL.md'))).toBe(true)
  expect(existsSync(join(target, 'mine', 'SKILL.md'))).toBe(true)
})
