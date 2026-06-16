import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export type DB = Database.Database

/**
 * Idempotently add columns that may be missing from a pre-existing skills table.
 * SQLite has no "ADD COLUMN IF NOT EXISTS", so we check PRAGMA table_info first.
 */
export function migrateDb(db: DB): void {
  const cols = (db.prepare('PRAGMA table_info(skills)').all() as any[]).map((r) => r.name)
  if (!cols.includes('protected')) {
    db.exec('ALTER TABLE skills ADD COLUMN protected INTEGER NOT NULL DEFAULT 0')
  }
  if (!cols.includes('archived_at')) {
    db.exec('ALTER TABLE skills ADD COLUMN archived_at TEXT')
  }
  // misses table may predate the build_suggested column (added with the build-once fix).
  const missCols = (db.prepare('PRAGMA table_info(misses)').all() as any[]).map((r) => r.name)
  if (missCols.length && !missCols.includes('build_suggested')) {
    db.exec('ALTER TABLE misses ADD COLUMN build_suggested INTEGER NOT NULL DEFAULT 0')
  }
  // model provenance: usage_log / feedback may predate the model column (cross-model tracking).
  for (const table of ['usage_log', 'feedback']) {
    const tcols = (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((r) => r.name)
    if (tcols.length && !tcols.includes('model')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN model TEXT`)
    }
  }
}

export function openDb(path: string): DB {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000') // tolerate concurrent writers (each tool spawns its own process)
  const ddl = readFileSync(join(here, 'schema.sql'), 'utf8')
  db.exec(ddl)
  migrateDb(db)
  return db
}
