import { createCockpit } from '../../src/cockpit/api.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { openDb } from '../../src/ledger/db.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

function startApp() {
  const db = openDb(':memory:')
  const repo = new SkillRepository(mkdtempSync(join(tmpdir(), 'myc-fb-repo-')))
  repo.scan()
  const led = new SynapseLedger(db)
  led.ensureSkill('usdt-pay', 'local')
  const app = createCockpit(repo, led, { feedbackLedger: led })
  return new Promise<{ url: string; close: () => void; led: SynapseLedger }>((res) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      res({ url: `http://127.0.0.1:${port}`, close: () => srv.close(), led })
    })
  })
}

test('POST /api/feedback with negative zh text records a fail and weakens the skill', async () => {
  const { url, close, led } = await startApp()
  const before = led.strengthOf('usdt-pay')
  const r = await fetch(`${url}/api/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ skill: 'usdt-pay', text: '这个不好用，老报错' }),
  })
  const body = await r.json()
  expect(body.recorded).toBe(true)
  expect(body.outcome).toBe('fail')
  expect(led.strengthOf('usdt-pay')).toBeLessThanOrEqual(before)
  close()
})

test('POST /api/feedback with unclear text records nothing', async () => {
  const { url, close } = await startApp()
  const r = await fetch(`${url}/api/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ skill: 'usdt-pay', text: 'hmm not sure' }),
  })
  const body = await r.json()
  expect(body.recorded).toBe(false)
  close()
})
