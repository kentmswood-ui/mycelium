import { openDb } from '../../src/ledger/db.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { ProposalStore } from '../../src/brain/proposals.js'
import { EvolutionDetector } from '../../src/brain/evolution.js'

function setup() {
  const db = openDb(':memory:')
  return { led: new SynapseLedger(db), ps: new ProposalStore(db), db }
}

test('a skill with repeated failures yields one rewrite proposal', () => {
  const { led, ps, db } = setup()
  led.ensureSkill('flaky', 'local')
  for (let i = 0; i < 3; i++) led.recordFeedback({ skill: 'flaky', tool: 'codex', outcome: 'fail' })
  const det = new EvolutionDetector(db, ps)
  const n = det.scan({ minFailures: 3 })
  expect(n).toBe(1)
  const pending = ps.listPending()
  expect(pending[0].kind).toBe('rewrite')
  expect(pending[0].title).toMatch(/flaky/)
})

test('does not duplicate a rewrite proposal that is already pending', () => {
  const { led, ps, db } = setup()
  led.ensureSkill('flaky', 'local')
  for (let i = 0; i < 4; i++) led.recordFeedback({ skill: 'flaky', tool: 'codex', outcome: 'fail' })
  const det = new EvolutionDetector(db, ps)
  expect(det.scan({ minFailures: 3 })).toBe(1)
  expect(det.scan({ minFailures: 3 })).toBe(0) // second scan adds nothing
  expect(ps.listPending()).toHaveLength(1)
})

test('healthy skills produce no rewrite proposals', () => {
  const { led, ps, db } = setup()
  led.ensureSkill('solid', 'local')
  led.recordFeedback({ skill: 'solid', tool: 'codex', outcome: 'ok' })
  led.recordFeedback({ skill: 'solid', tool: 'claude', outcome: 'ok' })
  const det = new EvolutionDetector(db, ps)
  expect(det.scan({ minFailures: 3 })).toBe(0)
})
