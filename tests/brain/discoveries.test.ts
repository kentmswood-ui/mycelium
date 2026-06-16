import { openDb } from '../../src/ledger/db.js'
import { DiscoveryStore } from '../../src/brain/discoveries.js'

test('records and reads back discoveries newest-first', () => {
  const ds = new DiscoveryStore(openDb(':memory:'))
  ds.record({ task: 't1', title: 'first', trust: 0.3, disposition: 'logged' })
  ds.record({ task: 't2', title: 'second', trust: 0.9, disposition: 'synthesized', detail: 'made skill X' })
  const recent = ds.recent(10)
  expect(recent).toHaveLength(2)
  expect(recent[0].title).toBe('second')
  expect(recent[0].disposition).toBe('synthesized')
  expect(recent[0].detail).toBe('made skill X')
})

test('defaults disposition to logged', () => {
  const ds = new DiscoveryStore(openDb(':memory:'))
  ds.record({ task: 't', title: 'x', trust: 0.2 })
  expect(ds.recent()[0].disposition).toBe('logged')
})

test('respects the limit', () => {
  const ds = new DiscoveryStore(openDb(':memory:'))
  for (let i = 0; i < 5; i++) ds.record({ task: 't', title: `n${i}`, trust: 0.1 })
  expect(ds.recent(3)).toHaveLength(3)
})
