import { resolveConfig } from '../src/config.js'

test('config binds to localhost only and points db under repo root', () => {
  const c = resolveConfig('D:\\Mycelium')
  expect(c.bindAddr).toBe('127.0.0.1')
  expect(c.skillsDir).toBe('D:\\Mycelium\\skills')
  expect(c.dbPath).toBe('D:\\Mycelium\\ledger\\synapse.db')
  expect(c.consultTimeoutMs).toBe(800)
})
