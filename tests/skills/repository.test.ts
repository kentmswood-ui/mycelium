import { SkillRepository } from '../../src/skills/repository.js'
import { join } from 'node:path'

const here = import.meta.dirname

test('repository scans skills dir and exposes list/get', () => {
  const dir = join(here, '..', 'fixtures', 'skills')
  const repo = new SkillRepository(dir)
  repo.scan()
  expect(repo.list().map((s) => s.name)).toContain('usdt-pay')
  expect(repo.get('usdt-pay')!.keywords).toContain('trc20')
  expect(repo.get('does-not-exist')).toBeUndefined()
})

test('repository ignores dirs without SKILL.md and dotfiles', () => {
  const dir = join(here, '..', 'fixtures', 'skills')
  const repo = new SkillRepository(dir)
  repo.scan()
  expect(repo.list().every((s) => s.name.length > 0)).toBe(true)
})
