import { detectTools } from '../../src/adapters/detect.js'
import { claudeAdapter } from '../../src/adapters/claude.js'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('adapter declares required fields', () => {
  expect(claudeAdapter.id).toBe('claude')
  expect(claudeAdapter.capabilities.supportsMcp).toBe(true)
  expect(claudeAdapter.skillsDir).toMatch(/skills$/)
})

test('detectTools returns only tools whose home exists', () => {
  const home = mkdtempSync(join(tmpdir(), 'myc-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  const found = detectTools(home)
  expect(found.map((a) => a.id)).toContain('claude')
  expect(found.map((a) => a.id)).not.toContain('codex')
})
