import type { DB } from '../ledger/db.js'
import type { ProposalStore } from './proposals.js'

export interface EvolutionOpts {
  /** how many 'fail' feedbacks before a rewrite is proposed */
  minFailures?: number
}

/**
 * Passive evolution: scan feedback for skills that keep failing and file a single
 * 'rewrite' proposal per skill (deduped against pending proposals). Never rewrites
 * anything itself — it only queues a suggestion for the user to approve (spec §B).
 */
export class EvolutionDetector {
  constructor(
    private db: DB,
    private proposals: ProposalStore,
  ) {}

  scan(opts: EvolutionOpts = {}): number {
    const minFailures = opts.minFailures ?? 3
    const rows = this.db
      .prepare(
        `SELECT skill_name AS name, COUNT(*) AS fails
         FROM feedback WHERE outcome='fail'
         GROUP BY skill_name HAVING fails >= ?`,
      )
      .all(minFailures) as any[]

    let created = 0
    const pendingRewrites = new Set(
      this.proposals
        .listPending()
        .filter((p) => p.kind === 'rewrite')
        .map((p) => p.title),
    )

    for (const r of rows) {
      const title = `Rewrite: ${r.name}`
      if (pendingRewrites.has(title)) continue
      this.proposals.create({
        kind: 'rewrite',
        title,
        task: `Skill "${r.name}" failed ${r.fails} times — propose an improved version`,
        source: 'mycelium-evolution',
        trust: 0.5,
        payload: { skill: r.name, fails: r.fails },
      })
      created++
    }
    return created
  }
}
