import { parseSkill } from '../../src/skills/skill.js'
import { join } from 'node:path'

const here = import.meta.dirname

test('parseSkill reads frontmatter and derives tokens', () => {
  const dir = join(here, '..', 'fixtures', 'skills', 'usdt-pay')
  const s = parseSkill(dir)!
  expect(s.name).toBe('usdt-pay')
  expect(s.keywords).toContain('trc20')
  expect(s.tokens).toContain('billing') // tokens merge name+desc+keywords, lowercased
  expect(s.source).toBe('local') // default when no sidecar
})

test('parseSkill returns null when SKILL.md missing', () => {
  expect(parseSkill(join(here, 'nope'))).toBeNull()
})
