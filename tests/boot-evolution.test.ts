import { bootCore } from '../src/index.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function seededRoot() {
  const root = mkdtempSync(join(tmpdir(), 'myc-boot2-'))
  const sk = join(root, 'skills', 'existing')
  mkdirSync(sk, { recursive: true })
  writeFileSync(join(sk, 'SKILL.md'), '---\nname: existing\ndescription: a pre-existing user skill\n---\n# x')
  return root
}

test('bootCore protects pre-existing skills (never auto-pruned)', () => {
  const root = seededRoot()
  const core = bootCore({ root })
  expect(core.ledger.isProtected('existing')).toBe(true)
  core.close()
})

test('onMiss triggers the search pipeline → discoveries logged + install proposal filed', async () => {
  const root = seededRoot()
  const SKILL_PAGE = 'skill file:\n---\nname: k8s-blue-green\ndescription: blue-green deploy\n---\n# steps'
  const core = bootCore({
    root,
    search: async () => [
      { title: 'org/new', url: 'https://github.com/org/new', snippet: 'MIT skill' },
    ],
    extract: async () => SKILL_PAGE,
  })
  // a nontrivial task with no local match → miss → async pipeline
  core.brain.consult({ task: 'orchestrate kubernetes blue green deploy pipeline', tool: 'codex' })
  await core.flushJobs() // wait for the async onMiss work to settle
  // search hits land in the read-only discoveries log
  expect(core.discoveries.recent().length).toBeGreaterThan(0)
  // a ready-made SKILL.md becomes an install proposal (NOT silently landed)
  const pending = core.proposals.listPendingDestructive()
  expect(pending.some((p) => p.kind === 'install' && p.title.includes('k8s-blue-green'))).toBe(true)
  // nothing auto-installed into the skills dir
  expect(core.repo.list().some((s) => s.name === 'k8s-blue-green')).toBe(false)
  core.close()
})
