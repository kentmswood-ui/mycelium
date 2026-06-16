import { openDb, migrateDb } from '../../src/ledger/db.js'

test('schema includes proposals table and skills has protected + archived_at', () => {
  const db = openDb(':memory:')
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r: any) => r.name)
  expect(tables).toContain('proposals')

  const cols = db.prepare('PRAGMA table_info(skills)').all().map((r: any) => r.name)
  expect(cols).toContain('protected')
  expect(cols).toContain('archived_at')
})

test('migrateDb adds missing columns to a legacy skills table (idempotent)', () => {
  const db = openDb(':memory:')
  // simulate a legacy table missing the new columns
  db.exec('DROP TABLE skills')
  db.exec('CREATE TABLE skills (name TEXT PRIMARY KEY, source TEXT, strength REAL DEFAULT 0)')
  expect(() => migrateDb(db)).not.toThrow()
  expect(() => migrateDb(db)).not.toThrow() // idempotent
  const cols = db.prepare('PRAGMA table_info(skills)').all().map((r: any) => r.name)
  expect(cols).toContain('protected')
  expect(cols).toContain('archived_at')
})
