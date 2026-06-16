import type { DB } from '../ledger/db.js'
import { tokenize } from '../skills/skill.js'

/**
 * Tracks how often a normalized task-shape misses locally, and caps how many expensive
 * actions happen per day. The cascade uses this to decide: a one-off miss just gets counted
 * (cheap), but once a shape recurs >= threshold AND we're under the daily quota, the brain
 * escalates to research/build. This is what keeps one-off questions from creating junk skills
 * or burning tokens.
 */

/** Normalize a task to a stable signature: sorted unique tokens. "build a youtube pipeline"
 *  and "youtube pipeline build" collapse to the same shape. */
export function signatureOf(task: string): string {
  return [...new Set(tokenize(task))].sort().join(' ')
}

function today(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

export class RecurrenceLedger {
  constructor(private db: DB) {}

  /** Record a local miss for this task; returns the new cumulative count for its shape. */
  recordMiss(task: string): number {
    const sig = signatureOf(task)
    if (!sig) return 0
    this.db
      .prepare(
        `INSERT INTO misses(signature, count, sample_task, last_at)
         VALUES (?, 1, ?, datetime('now'))
         ON CONFLICT(signature) DO UPDATE SET count = count + 1, last_at = datetime('now')`,
      )
      .run(sig, task)
    const row = this.db.prepare('SELECT count FROM misses WHERE signature=?').get(sig) as
      | { count: number }
      | undefined
    return row?.count ?? 0
  }

  countFor(task: string): number {
    const sig = signatureOf(task)
    const row = this.db.prepare('SELECT count FROM misses WHERE signature=?').get(sig) as
      | { count: number }
      | undefined
    return row?.count ?? 0
  }

  /** Has a build already been suggested for this task-shape? (so we don't nag every consult) */
  wasBuildSuggested(task: string): boolean {
    const sig = signatureOf(task)
    const row = this.db.prepare('SELECT build_suggested FROM misses WHERE signature=?').get(sig) as
      | { build_suggested: number }
      | undefined
    return !!row && row.build_suggested === 1
  }

  /** Mark this shape as having been offered a build, so it isn't suggested again. */
  markBuildSuggested(task: string): void {
    const sig = signatureOf(task)
    if (!sig) return
    this.db.prepare('UPDATE misses SET build_suggested=1 WHERE signature=?').run(sig)
  }

  /** How many expensive actions have run today. */
  spentToday(): number {
    const row = this.db.prepare('SELECT count FROM quota_log WHERE day=?').get(today()) as
      | { count: number }
      | undefined
    return row?.count ?? 0
  }

  /** True if we may spend one more expensive action today (quota<=0 means unlimited). */
  underQuota(quota: number): boolean {
    if (quota <= 0) return true
    return this.spentToday() < quota
  }

  /** Charge one expensive action against today's quota. */
  chargeQuota(): void {
    this.db
      .prepare(
        `INSERT INTO quota_log(day, count) VALUES (?, 1)
         ON CONFLICT(day) DO UPDATE SET count = count + 1`,
      )
      .run(today())
  }
}
