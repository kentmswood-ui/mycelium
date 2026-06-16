import { createCockpit } from '../../src/cockpit/api.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { SettingsStore } from '../../src/brain/settings.js'
import { openDb } from '../../src/ledger/db.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

function startApp() {
  const repo = new SkillRepository(mkdtempSync(join(tmpdir(), 'myc-usage-')))
  repo.scan()
  const db = openDb(':memory:')
  const led = new SynapseLedger(db)
  const settings = new SettingsStore(db)
  led.recordConsult({ tool: 'claude-code', model: 'opus-4.8', verdict: 'reuse', skill: 'x' })
  led.recordConsult({ tool: 'codex', model: 'gpt-5.5', verdict: 'searching' })
  const app = createCockpit(repo, led, { settings, skillsDir: '/tmp/x' })
  return new Promise<{ url: string; close: () => void }>((res) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      res({ url: `http://127.0.0.1:${port}`, close: () => srv.close() })
    })
  })
}

test('GET /api/usage returns totals, verdict breakdown, weights', async () => {
  const { url, close } = await startApp()
  const body = await (await fetch(`${url}/api/usage?days=30`)).json()
  expect(body.totalConsults).toBe(2)
  expect(body.byVerdict.reuse).toBe(1)
  expect(body.weights.searching).toBeGreaterThan(0)
  expect(typeof body.estTokens).toBe('number')
  close()
})

test('PUT /api/token-weights clamps and persists', async () => {
  const { url, close } = await startApp()
  const r = await fetch(`${url}/api/token-weights`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ weights: { searching: -50, build: 9999 } }),
  })
  const body = await r.json()
  expect(body.weights.searching).toBe(0) // clamped to >= 0
  expect(body.weights.build).toBe(9999)
  close()
})

test('GET /api/aliases returns bundled defaults; PUT cleans + persists overrides', async () => {
  const { url, close } = await startApp()
  const got = await (await fetch(`${url}/api/aliases`)).json()
  expect(got.defaults['test-driven-development']).toBeDefined()
  const put = await (await fetch(`${url}/api/aliases`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ overrides: { 'test-driven-development': [' 契约测试 ', '', '契约测试'] } }),
  })).json()
  // trimmed, lowercased, de-duped, blanks dropped
  expect(put.overrides['test-driven-development']).toEqual(['契约测试'])
  close()
})

test('GET /api/ledger/stats + POST prune', async () => {
  const { url, close } = await startApp()
  const stats = await (await fetch(`${url}/api/ledger/stats`)).json()
  expect(stats.tables.consult_log).toBe(2)
  const pruned = await (await fetch(`${url}/api/ledger/prune`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ days: 9999 }),
  })).json()
  expect(pruned.ok).toBe(true)
  // nothing is 9999 days old, so deletions are 0
  expect(pruned.deleted.consult_log).toBe(0)
  close()
})

test('POST /api/ledger/prune rejects a missing/zero days', async () => {
  const { url, close } = await startApp()
  const r = await fetch(`${url}/api/ledger/prune`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  })
  expect(r.status).toBe(400)
  close()
})
