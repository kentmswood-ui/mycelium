import { createCockpit } from '../../src/cockpit/api.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { openDb } from '../../src/ledger/db.js'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

const here = import.meta.dirname

function startApp() {
  const repo = new SkillRepository(join(here, '..', 'fixtures', 'skills'))
  repo.scan()
  const led = new SynapseLedger(openDb(':memory:'))
  led.recordUsage({ skill: 'usdt-pay', tool: 'codex', task: 'add usdt', outcome: 'ok' })
  const app = createCockpit(repo, led)
  return new Promise<{ url: string; close: () => void }>((res) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      res({ url: `http://127.0.0.1:${port}`, close: () => srv.close() })
    })
  })
}

test('GET /api/skills returns skills with strength + experience', async () => {
  const { url, close } = await startApp()
  const r = await fetch(`${url}/api/skills`)
  const body = await r.json()
  const usdt = body.find((s: any) => s.name === 'usdt-pay')
  expect(usdt.tools).toContain('codex')
  expect(typeof usdt.strength).toBe('number')
  close()
})

test('GET /api/activity returns recent usage', async () => {
  const { url, close } = await startApp()
  const r = await fetch(`${url}/api/activity`)
  const body = await r.json()
  expect(body[0].skill_name).toBe('usdt-pay')
  close()
})
