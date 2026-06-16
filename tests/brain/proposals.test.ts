import { openDb } from '../../src/ledger/db.js'
import { ProposalStore } from '../../src/brain/proposals.js'

test('create + list pending + get by id', () => {
  const ps = new ProposalStore(openDb(':memory:'))
  const id = ps.create({
    kind: 'new-skill',
    title: 'usdt-pay',
    task: 'integrate usdt',
    source: 'github',
    sourceUrl: 'https://github.com/x/usdt-pay',
    trust: 0.7,
    risk: '',
    payload: { skillMd: '---\nname: usdt-pay\n---\n# x' },
  })
  expect(id).toBeGreaterThan(0)
  const pending = ps.listPending()
  expect(pending).toHaveLength(1)
  expect(pending[0].title).toBe('usdt-pay')
  expect(ps.get(id)!.payload.skillMd).toMatch(/name: usdt-pay/)
})

test('setStatus moves proposal out of pending and is queryable', () => {
  const ps = new ProposalStore(openDb(':memory:'))
  const id = ps.create({ kind: 'new-skill', title: 't', trust: 0.5 })
  ps.setStatus(id, 'approved')
  expect(ps.listPending()).toHaveLength(0)
  expect(ps.get(id)!.status).toBe('approved')
})

test('listPending is ordered by trust descending', () => {
  const ps = new ProposalStore(openDb(':memory:'))
  ps.create({ kind: 'new-skill', title: 'low', trust: 0.2 })
  ps.create({ kind: 'new-skill', title: 'high', trust: 0.9 })
  const pending = ps.listPending()
  expect(pending[0].title).toBe('high')
})

test('listPendingDestructive excludes new-skill, keeps rewrite/prune', () => {
  const ps = new ProposalStore(openDb(':memory:'))
  ps.create({ kind: 'new-skill', title: 'should-not-show', trust: 0.9 })
  ps.create({ kind: 'rewrite', title: 'rewrite-me', trust: 0.5 })
  ps.create({ kind: 'prune', title: 'prune-me', trust: 0.3 })
  const dest = ps.listPendingDestructive()
  expect(dest.map((p) => p.kind).sort()).toEqual(['prune', 'rewrite'])
  expect(dest.some((p) => p.title === 'should-not-show')).toBe(false)
})
