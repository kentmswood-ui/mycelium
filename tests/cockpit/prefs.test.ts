import { createCockpit } from '../../src/cockpit/api.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { SettingsStore } from '../../src/brain/settings.js'
import { ProposalStore } from '../../src/brain/proposals.js'
import { openDb } from '../../src/ledger/db.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

function startApp() {
  const repo = new SkillRepository(mkdtempSync(join(tmpdir(), 'myc-prefs-')))
  repo.scan()
  const db = openDb(':memory:')
  const led = new SynapseLedger(db)
  const settings = new SettingsStore(db)
  const proposals = new ProposalStore(db)
  const app = createCockpit(repo, led, { proposals, settings, skillsDir: '/tmp/x' })
  return new Promise<{ url: string; close: () => void }>((res) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      res({ url: `http://127.0.0.1:${port}`, close: () => srv.close() })
    })
  })
}

test('GET /api/prefs returns defaults + trigger modes', async () => {
  const { url, close } = await startApp()
  const body = await (await fetch(`${url}/api/prefs`)).json()
  expect(body.prefs.triggerMode).toBe('session')
  expect(body.prefs.recurrenceThreshold).toBe(3)
  expect(body.triggerModes.length).toBe(3)
  close()
})

test('PUT /api/prefs persists valid values and clamps bad ones', async () => {
  const { url, close } = await startApp()
  const r = await fetch(`${url}/api/prefs`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ triggerMode: 'keyword', keywords: ['研究', ' '], recurrenceThreshold: 0, dailyQuota: -3 }),
  })
  const body = await r.json()
  expect(body.prefs.triggerMode).toBe('keyword')
  expect(body.prefs.keywords).toEqual(['研究']) // whitespace dropped
  expect(body.prefs.recurrenceThreshold).toBe(1) // clamped up from 0
  expect(body.prefs.dailyQuota).toBe(0) // clamped up from -3
  close()
})

test('PUT /api/prefs ignores an invalid trigger mode', async () => {
  const { url, close } = await startApp()
  await fetch(`${url}/api/prefs`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ triggerMode: 'bogus' }),
  })
  const body = await (await fetch(`${url}/api/prefs`)).json()
  expect(body.prefs.triggerMode).toBe('session') // unchanged default
  close()
})

test('GET /api/prefs exposes languages; PUT persists a valid primaryLanguage and ignores bad ones', async () => {
  const { url, close } = await startApp()
  const got = await (await fetch(`${url}/api/prefs`)).json()
  expect(got.prefs.primaryLanguage).toBe('auto') // default
  expect(Array.isArray(got.languages)).toBe(true)
  // valid
  const ok = await (await fetch(`${url}/api/prefs`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ primaryLanguage: 'zh' }),
  })).json()
  expect(ok.prefs.primaryLanguage).toBe('zh')
  // invalid → unchanged
  await fetch(`${url}/api/prefs`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ primaryLanguage: 'fr' }),
  })
  const after = await (await fetch(`${url}/api/prefs`)).json()
  expect(after.prefs.primaryLanguage).toBe('zh') // still zh, fr rejected
  close()
})
