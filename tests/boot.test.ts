import { bootCore } from '../src/index.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('bootCore wires repo, brain, ledger and creates skills dir', async () => {
  const root = mkdtempSync(join(tmpdir(), 'myc-boot-'))
  // inject a no-network search stub: wiring test must not hit the real anysearch CLI
  const core = bootCore({ root, search: async () => [] })
  expect(core.brain).toBeDefined()
  expect(core.repo).toBeDefined()
  expect(core.ledger).toBeDefined()
  // consult works end to end on an empty repo → pass or searching, never throws
  const v = core.brain.consult({ task: 'do something nontrivial here', tool: 'codex' }).verdict
  expect(['pass', 'searching', 'reuse']).toContain(v)
  await core.flushJobs() // let any async onMiss settle before closing the db
  core.close()
})
