import { openDb } from '../../src/ledger/db.js'

test('openDb creates tables idempotently', () => {
  const db = openDb(':memory:')
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r: any) => r.name)
  expect(tables).toEqual([
    'catalog',
    'consult_log',
    'discoveries',
    'feedback',
    'misses',
    'proposals',
    'quota_log',
    'settings',
    'skill_misfits',
    'skills',
    'usage_log',
  ])
  // second call on a fresh in-memory db must not throw
  expect(() => openDb(':memory:')).not.toThrow()
})
