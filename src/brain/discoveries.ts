import type { DB } from '../ledger/db.js'

/** How the search path handled a hit. */
export type Disposition = 'synthesized' | 'proposed-install' | 'duplicate' | 'low-fit' | 'logged'

export interface NewDiscovery {
  task: string
  title: string
  url?: string
  source?: string
  tier?: string
  trust: number
  disposition?: Disposition
  detail?: string
}

export interface Discovery {
  id: number
  task: string
  title: string
  url: string | null
  source: string | null
  tier: string | null
  trust: number
  disposition: Disposition
  detail: string | null
  createdAt: string
}

function rowToDiscovery(r: any): Discovery {
  return {
    id: r.id,
    task: r.task,
    title: r.title,
    url: r.url,
    source: r.source,
    tier: r.tier,
    trust: r.trust,
    disposition: r.disposition,
    detail: r.detail,
    createdAt: r.created_at,
  }
}

/**
 * Read-only-for-the-user log of search activity. The brain writes here; the cockpit
 * only displays. Nothing in this table ever needs an approve/reject decision.
 */
export class DiscoveryStore {
  constructor(private db: DB) {}

  record(d: NewDiscovery): number {
    const info = this.db
      .prepare(
        `INSERT INTO discoveries(task, title, url, source, tier, trust, disposition, detail)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        d.task,
        d.title,
        d.url ?? null,
        d.source ?? null,
        d.tier ?? null,
        d.trust,
        d.disposition ?? 'logged',
        d.detail ?? null,
      )
    return Number(info.lastInsertRowid)
  }

  recent(limit = 50): Discovery[] {
    return (
      this.db
        .prepare('SELECT * FROM discoveries ORDER BY id DESC LIMIT ?')
        .all(limit) as any[]
    ).map(rowToDiscovery)
  }
}
