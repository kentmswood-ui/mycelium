import type { DB } from '../ledger/db.js'
import { signatureOf } from './recurrence.js'

/**
 * Negative-learning store. Records that a skill was the WRONG answer for a normalized task-shape
 * (the agent ignored a reuse, or feedback came back 'fail' with the task attached). Once a
 * skill×shape misfit crosses the suppression threshold, the matcher drops that skill for that
 * shape — so the same wrong suggestion stops recurring. This is the system "accumulating
 * experience": it gets more precise the more it's corrected.
 */
export class MisfitStore {
  constructor(private db: DB) {}

  /** Record one misfit (skill was wrong for this task-shape). Returns the new cumulative count. */
  record(task: string, skill: string): number {
    const sig = signatureOf(task)
    if (!sig || !skill) return 0
    this.db
      .prepare(
        `INSERT INTO skill_misfits(signature, skill, count, last_at)
         VALUES (?, ?, 1, datetime('now'))
         ON CONFLICT(signature, skill) DO UPDATE SET count = count + 1, last_at = datetime('now')`,
      )
      .run(sig, skill)
    const row = this.db
      .prepare('SELECT count FROM skill_misfits WHERE signature=? AND skill=?')
      .get(sig, skill) as { count: number } | undefined
    return row?.count ?? 0
  }

  /** Skills suppressed for this task-shape: those whose misfit count is at/above the threshold. */
  suppressedFor(task: string, threshold = 1): Set<string> {
    const sig = signatureOf(task)
    if (!sig) return new Set()
    const rows = this.db
      .prepare('SELECT skill FROM skill_misfits WHERE signature=? AND count>=?')
      .all(sig, threshold) as { skill: string }[]
    return new Set(rows.map((r) => r.skill))
  }
}
