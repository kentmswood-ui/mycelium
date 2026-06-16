import type { DB } from '../ledger/db.js'

/**
 * Tiny key/value settings store backed by SQLite. The cockpit reads/writes a handful
 * of keys (e.g. which data-source tiers are enabled for the search path). JSON-encoded
 * values so callers can store arrays/objects without extra plumbing.
 */
export class SettingsStore {
  constructor(private db: DB) {}

  get<T = unknown>(key: string, fallback: T): T {
    const r = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as
      | { value: string }
      | undefined
    if (!r) return fallback
    try {
      return JSON.parse(r.value) as T
    } catch {
      return fallback
    }
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO settings(key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      )
      .run(key, JSON.stringify(value))
  }
}
