import { openDb } from '../../src/ledger/db.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'

test('usage strengthens, success feedback strengthens more, fail weakens', () => {
  const led = new SynapseLedger(openDb(':memory:'))
  led.ensureSkill('usdt-pay', 'local')
  const before = led.strengthOf('usdt-pay')
  led.recordUsage({ skill: 'usdt-pay', tool: 'codex', task: 'add usdt', outcome: 'ok' })
  led.recordFeedback({ skill: 'usdt-pay', tool: 'codex', outcome: 'ok' })
  expect(led.strengthOf('usdt-pay')).toBeGreaterThan(before)
  const peak = led.strengthOf('usdt-pay')
  led.recordFeedback({ skill: 'usdt-pay', tool: 'codex', outcome: 'fail', note: 'broke build' })
  expect(led.strengthOf('usdt-pay')).toBeLessThan(peak)
})

test('experience is shared across tools via shared ledger', () => {
  const led = new SynapseLedger(openDb(':memory:'))
  led.ensureSkill('usdt-pay', 'local')
  led.recordUsage({ skill: 'usdt-pay', tool: 'codex', task: 't', outcome: 'ok' })
  const exp = led.experienceOf('usdt-pay')
  expect(exp.totalUses).toBe(1)
  expect(exp.tools).toContain('codex')
})
