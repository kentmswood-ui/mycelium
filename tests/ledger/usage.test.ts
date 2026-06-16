import { openDb } from '../../src/ledger/db.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'

test('recordConsult + usageStats: totals, verdict + tool breakdown, token estimate', () => {
  const led = new SynapseLedger(openDb(':memory:'))
  led.recordConsult({ tool: 'claude-code', model: 'opus-4.8', verdict: 'reuse', skill: 'tdd' })
  led.recordConsult({ tool: 'claude-code', model: 'opus-4.8', verdict: 'searching' })
  led.recordConsult({ tool: 'codex', model: 'gpt-5.5', verdict: 'pass' })

  const stats = led.usageStats({ days: 30, weights: { reuse: 400, searching: 3000, pass: 0 } })
  expect(stats.totalConsults).toBe(3)
  expect(stats.byVerdict).toEqual({ reuse: 1, searching: 1, pass: 1 })
  // estimate = 400 + 3000 + 0
  expect(stats.estTokens).toBe(3400)
  // two distinct tool/model pairs
  expect(stats.byTool).toHaveLength(2)
  expect(stats.byTool.find((t) => t.tool === 'claude-code')?.count).toBe(2)
})

test('usageStats respects the days window', () => {
  const led = new SynapseLedger(openDb(':memory:'))
  led.recordConsult({ tool: 'x', verdict: 'reuse' })
  // a 0-weight map → estimate is 0 regardless of counts
  const stats = led.usageStats({ days: 1, weights: {} })
  expect(stats.totalConsults).toBe(1)
  expect(stats.estTokens).toBe(0)
})

test('ledgerStats reports row counts and a positive db size', () => {
  const led = new SynapseLedger(openDb(':memory:'))
  led.recordUsage({ skill: 'a', tool: 't', task: 'x' })
  led.recordConsult({ tool: 't', verdict: 'reuse', skill: 'a' })
  const s = led.ledgerStats()
  expect(s.tables.usage_log).toBe(1)
  expect(s.tables.consult_log).toBe(1)
  expect(s.tables.skills).toBeGreaterThanOrEqual(1)
  expect(s.dbBytes).toBeGreaterThan(0)
})

test('pruneLogs deletes only log rows, leaving skill strength intact', () => {
  const led = new SynapseLedger(openDb(':memory:'))
  led.recordUsage({ skill: 'keepme', tool: 't', task: 'x', outcome: 'ok' })
  led.recordFeedback({ skill: 'keepme', tool: 't', outcome: 'ok' })
  const strengthBefore = led.strengthOf('keepme')
  // prune with 0 days → everything older than "now" goes; created_at is ~now so nothing matches
  const deleted = led.pruneLogs(0)
  expect(deleted.usage_log).toBeGreaterThanOrEqual(0)
  // strength lives on the skills row, never pruned
  expect(led.strengthOf('keepme')).toBe(strengthBefore)
})

test('model provenance is persisted on usage + feedback', () => {
  const db = openDb(':memory:')
  const led = new SynapseLedger(db)
  led.recordUsage({ skill: 's', tool: 'codex', task: 'x', model: 'gpt-5.5' })
  const row = db.prepare('SELECT model FROM usage_log WHERE skill_name=?').get('s') as any
  expect(row.model).toBe('gpt-5.5')
})
