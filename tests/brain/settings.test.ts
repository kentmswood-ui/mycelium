import { openDb } from '../../src/ledger/db.js'
import { SettingsStore } from '../../src/brain/settings.js'

test('returns fallback when key missing', () => {
  const s = new SettingsStore(openDb(':memory:'))
  expect(s.get('nope', ['a', 'b'])).toEqual(['a', 'b'])
})

test('round-trips arrays and objects', () => {
  const s = new SettingsStore(openDb(':memory:'))
  s.set('tiers', ['code', 'docs'])
  expect(s.get('tiers', [])).toEqual(['code', 'docs'])
  s.set('cfg', { a: 1, b: true })
  expect(s.get('cfg', {})).toEqual({ a: 1, b: true })
})

test('set overwrites existing key', () => {
  const s = new SettingsStore(openDb(':memory:'))
  s.set('k', 'one')
  s.set('k', 'two')
  expect(s.get('k', '')).toBe('two')
})
