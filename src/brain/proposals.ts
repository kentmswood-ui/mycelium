import type { DB } from '../ledger/db.js'

export type ProposalKind = 'new-skill' | 'install' | 'rewrite' | 'prune'
export type ProposalStatus = 'pending' | 'approved' | 'rejected'

export interface NewProposal {
  kind: ProposalKind
  title: string
  task?: string
  source?: string
  sourceUrl?: string
  trust: number
  risk?: string
  payload?: unknown
}

export interface Proposal {
  id: number
  kind: ProposalKind
  title: string
  task: string | null
  source: string | null
  sourceUrl: string | null
  trust: number
  risk: string | null
  payload: any
  status: ProposalStatus
  createdAt: string
}

function rowToProposal(r: any): Proposal {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    task: r.task,
    source: r.source,
    sourceUrl: r.source_url,
    trust: r.trust,
    risk: r.risk,
    payload: r.payload ? JSON.parse(r.payload) : null,
    status: r.status,
    createdAt: r.created_at,
  }
}

export class ProposalStore {
  constructor(private db: DB) {}

  create(p: NewProposal): number {
    const info = this.db
      .prepare(
        `INSERT INTO proposals(kind, title, task, source, source_url, trust, risk, payload, status)
         VALUES (?,?,?,?,?,?,?,?, 'pending')`,
      )
      .run(
        p.kind,
        p.title,
        p.task ?? null,
        p.source ?? null,
        p.sourceUrl ?? null,
        p.trust,
        p.risk ?? null,
        p.payload != null ? JSON.stringify(p.payload) : null,
      )
    return Number(info.lastInsertRowid)
  }

  listPending(): Proposal[] {
    return (
      this.db
        .prepare("SELECT * FROM proposals WHERE status='pending' ORDER BY trust DESC, id ASC")
        .all() as any[]
    ).map(rowToProposal)
  }

  /**
   * Pending proposals the user must actually decide on: installing a ready-made external skill
   * (install) or destructive operations on EXISTING skills (rewrite/prune). Raw search hits and
   * legacy new-skill rows never need approval, so they are excluded from the queue the cockpit
   * renders.
   */
  listPendingDestructive(): Proposal[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM proposals WHERE status='pending' AND kind IN ('install','rewrite','prune') ORDER BY trust DESC, id ASC",
        )
        .all() as any[]
    ).map(rowToProposal)
  }

  get(id: number): Proposal | undefined {
    const r = this.db.prepare('SELECT * FROM proposals WHERE id=?').get(id) as any
    return r ? rowToProposal(r) : undefined
  }

  setStatus(id: number, status: ProposalStatus): void {
    this.db.prepare('UPDATE proposals SET status=? WHERE id=?').run(status, id)
  }
}
