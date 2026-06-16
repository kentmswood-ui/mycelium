import { join } from 'node:path'
import { resolveConfig } from '../src/config.js'

test('config binds to localhost only and points db under the given root', () => {
  const root = join('tmp', 'mycelium-root')
  const c = resolveConfig(root)
  expect(c.bindAddr).toBe('127.0.0.1')
  // build expectations with join() so the test is platform-agnostic (\\ on Windows, / on POSIX)
  expect(c.skillsDir).toBe(join(root, 'skills'))
  expect(c.dbPath).toBe(join(root, 'ledger', 'synapse.db'))
  expect(c.consultTimeoutMs).toBe(800)
})

test('resolveConfig() with no root derives a non-empty root (portable, not hard-coded)', () => {
  // MYCELIUM_SKILLS_DIR would override skillsDir; clear it so we test the derived-root path.
  const prevRoot = process.env.MYCELIUM_ROOT
  const prevSkills = process.env.MYCELIUM_SKILLS_DIR
  delete process.env.MYCELIUM_ROOT
  delete process.env.MYCELIUM_SKILLS_DIR
  try {
    const c = resolveConfig()
    expect(c.root.length).toBeGreaterThan(0)
    expect(c.skillsDir).toBe(join(c.root, 'skills'))
  } finally {
    if (prevRoot !== undefined) process.env.MYCELIUM_ROOT = prevRoot
    if (prevSkills !== undefined) process.env.MYCELIUM_SKILLS_DIR = prevSkills
  }
})

test('MYCELIUM_ROOT env overrides the derived root', () => {
  const prev = process.env.MYCELIUM_ROOT
  process.env.MYCELIUM_ROOT = join('custom', 'root')
  try {
    expect(resolveConfig().root).toBe(join('custom', 'root'))
  } finally {
    if (prev === undefined) delete process.env.MYCELIUM_ROOT
    else process.env.MYCELIUM_ROOT = prev
  }
})
