import { openDb } from '../../src/ledger/db.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { ProposalStore } from '../../src/brain/proposals.js'
import { Pruner } from '../../src/brain/pruning.js'

function setup() {
  const db = openDb(':memory:')
  return { led: new SynapseLedger(db), ps: new ProposalStore(db), db }
}

test('proposes pruning unused low-strength UNPROTECTED skills only', () => {
  const { led, ps, db } = setup()
  // weak + never used + not protected → candidate
  led.ensureSkill('weak', 'mycelium')
  // weak but PROTECTED (user's own) → must never be proposed
  led.ensureSkill('mine', 'local')
  led.markProtected('mine')
  // strong → not a candidate
  led.ensureSkill('strong', 'mycelium')
  for (let i = 0; i < 5; i++) led.recordFeedback({ skill: 'strong', tool: 'codex', outcome: 'ok' })

  const pruner = new Pruner(db, led, ps)
  const n = pruner.scan({ maxStrength: 0.05 })
  expect(n).toBe(1)
  const pending = ps.listPending()
  expect(pending).toHaveLength(1)
  expect(pending[0].kind).toBe('prune')
  expect(pending[0].title).toMatch(/weak/)
})

test('archive soft-deletes: sets archived_at, skill no longer a live candidate', () => {
  const { led } = setup()
  led.ensureSkill('weak', 'mycelium')
  expect(led.isArchived('weak')).toBe(false)
  led.archive('weak')
  expect(led.isArchived('weak')).toBe(true)
})

test('prune scan does not duplicate an already-pending prune proposal', () => {
  const { led, ps, db } = setup()
  led.ensureSkill('weak', 'mycelium')
  const pruner = new Pruner(db, led, ps)
  expect(pruner.scan({ maxStrength: 0.05 })).toBe(1)
  expect(pruner.scan({ maxStrength: 0.05 })).toBe(0)
})
