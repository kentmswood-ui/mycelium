import type { DB } from '../ledger/db.js'
import type { SynapseLedger } from '../ledger/synapse.js'
import type { ProposalStore } from './proposals.js'

export interface PruneOpts {
  maxStrength?: number
  unusedDays?: number
}

/**
 * Synapse pruning: find unused, low-strength, UNPROTECTED skills and file a single
 * 'prune' proposal each (deduped). Never deletes anything itself — approving the
 * proposal performs the soft-delete (archive + 30-day window) per spec §7.
 */
export class Pruner {
  constructor(
    private _db: DB,
    private ledger: SynapseLedger,
    private proposals: ProposalStore,
  ) {}

  scan(opts: PruneOpts = {}): number {
    const candidates = this.ledger.pruneCandidates(opts)
    const pendingPrunes = new Set(
      this.proposals
        .listPending()
        .filter((p) => p.kind === 'prune')
        .map((p) => p.payload?.skill),
    )
    let created = 0
    for (const name of candidates) {
      if (pendingPrunes.has(name)) continue
      this.proposals.create({
        kind: 'prune',
        title: `Prune: ${name}`,
        task: `Skill "${name}" is unused and low-strength — archive it (recoverable for 30 days)`,
        source: 'mycelium-pruning',
        trust: 0.5,
        payload: { skill: name },
      })
      created++
    }
    return created
  }
}
