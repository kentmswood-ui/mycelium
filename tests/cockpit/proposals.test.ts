import { createCockpit } from '../../src/cockpit/api.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { ProposalStore } from '../../src/brain/proposals.js'
import { openDb } from '../../src/ledger/db.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

function startApp() {
  const db = openDb(':memory:')
  const repo = new SkillRepository(mkdtempSync(join(tmpdir(), 'myc-cp-repo-')))
  repo.scan()
  const led = new SynapseLedger(db)
  const proposals = new ProposalStore(db)
  proposals.create({
    kind: 'rewrite',
    title: 'Rewrite: usdt-pay',
    task: 'usdt-pay failed 3 times — propose an improved version',
    source: 'mycelium-evolution',
    trust: 0.5,
    payload: { skillMd: '---\nname: usdt-pay\ndescription: improved\n---\n# better', skill: 'usdt-pay' },
  })
  const skillsDir = mkdtempSync(join(tmpdir(), 'myc-cp-skills-'))
  const app = createCockpit(repo, led, { proposals, skillsDir })
  return new Promise<{ url: string; close: () => void; proposals: ProposalStore }>((res) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      res({ url: `http://127.0.0.1:${port}`, close: () => srv.close(), proposals })
    })
  })
}

test('GET /api/proposals lists pending destructive proposals only', async () => {
  const { url, close } = await startApp()
  const body = await (await fetch(`${url}/api/proposals`)).json()
  expect(body).toHaveLength(1)
  expect(body[0].title).toBe('Rewrite: usdt-pay')
  close()
})

test('POST /api/proposals/:id/approve lands the skill and clears it from pending', async () => {
  const { url, close, proposals } = await startApp()
  const id = proposals.listPending()[0].id
  const r = await fetch(`${url}/api/proposals/${id}/approve`, { method: 'POST' })
  expect(r.ok).toBe(true)
  expect(proposals.get(id)!.status).toBe('approved')
  expect((await (await fetch(`${url}/api/proposals`)).json())).toHaveLength(0)
  close()
})

test('POST /api/proposals/:id/reject marks it rejected', async () => {
  const { url, close, proposals } = await startApp()
  const id = proposals.listPending()[0].id
  const r = await fetch(`${url}/api/proposals/${id}/reject`, { method: 'POST' })
  expect(r.ok).toBe(true)
  expect(proposals.get(id)!.status).toBe('rejected')
  close()
})
