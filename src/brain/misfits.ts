import type { DB } from '../ledger/db.js'
import { signatureOf } from './recurrence.js'

/** A misfit older than this stops suppressing (self-heals). Days. */
const DECAY_DAYS = 30

/**
 * Negative-learning store. Records that a skill was the WRONG answer for a normalized task-shape
 * (the agent rejected the reuse as irrelevant, or feedback came back 'fail' with the task). Once a
 * skill×shape misfit crosses the suppression threshold, the matcher drops that skill for that
 * shape — so the same wrong suggestion stops recurring. This is the system "accumulating
 * experience": it gets more precise the more it's corrected.
 *
 * Two self-healing guards keep wrong marks from being permanent (loop-engineering: a bad signal
 * must be reversible, or the system drifts):
 *   - DECAY: a misfit older than DECAY_DAYS no longer suppresses.
 *   - REVERSAL: a later 'ok' on the same skill×shape clears the misfit (positive evidence wins).
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

  /** Clear a misfit for this skill×shape — positive evidence (a later 'ok') reverses the mark. */
  clear(task: string, skill: string): void {
    const sig = signatureOf(task)
    if (!sig || !skill) return
    this.db.prepare('DELETE FROM skill_misfits WHERE signature=? AND skill=?').run(sig, skill)
  }

  /**
   * Skills suppressed for this task-shape: misfit count at/above the threshold AND recorded within
   * the decay window. A stale misfit (older than DECAY_DAYS) is ignored, so the suppression
   * self-heals if the task-shape stops being a problem.
   */
  suppressedFor(task: string, threshold = 1): Set<string> {
    const sig = signatureOf(task)
    if (!sig) return new Set()
    const rows = this.db
      .prepare(
        `SELECT skill FROM skill_misfits
         WHERE signature=? AND count>=? AND last_at >= datetime('now', ?)`,
      )
      .all(sig, threshold, `-${DECAY_DAYS} days`) as { skill: string }[]
    return new Set(rows.map((r) => r.skill))
  }
}
