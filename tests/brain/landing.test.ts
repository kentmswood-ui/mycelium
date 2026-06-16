import { openDb } from '../../src/ledger/db.js'
import { ProposalStore } from '../../src/brain/proposals.js'
import { approveProposal, landProposal, rejectProposal } from '../../src/brain/landing.js'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function setup() {
  const db = openDb(':memory:')
  const ps = new ProposalStore(db)
  const skillsDir = mkdtempSync(join(tmpdir(), 'myc-land-'))
  return { db, ps, skillsDir }
}

test('approving a new-skill proposal writes SKILL.md + mycelium.json sidecar', () => {
  const { ps, skillsDir } = setup()
  const id = ps.create({
    kind: 'new-skill',
    title: 'org/usdt-skill',
    task: 'integrate usdt payment',
    source: 'github.com',
    sourceUrl: 'https://github.com/org/usdt-skill',
    trust: 0.7,
    risk: '',
    payload: { snippet: 'USDT TRC20 payment skill' },
  })
  const dir = approveProposal(ps, id, { skillsDir })!
  expect(existsSync(join(dir, 'SKILL.md'))).toBe(true)
  const sidecar = JSON.parse(readFileSync(join(dir, '.mycelium.json'), 'utf8'))
  expect(sidecar.source).toBe('github.com')
  expect(sidecar.sourceUrl).toBe('https://github.com/org/usdt-skill')
  expect(sidecar.trust).toBe(0.7)
  expect(sidecar.protected).toBe(false) // mycelium-added → prune-eligible
  const md = readFileSync(join(dir, 'SKILL.md'), 'utf8')
  expect(md).toMatch(/name:/)
  expect(ps.get(id)!.status).toBe('approved')
})

test('approving uses provided skillMd verbatim when present', () => {
  const { ps, skillsDir } = setup()
  const id = ps.create({
    kind: 'new-skill',
    title: 'ready-skill',
    trust: 0.8,
    payload: { skillMd: '---\nname: ready-skill\ndescription: prebuilt\n---\n# ready' },
  })
  const dir = landProposal(ps.get(id)!, { skillsDir })
  expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toMatch(/prebuilt/)
})

test('rejecting sets status rejected without writing files', () => {
  const { ps, skillsDir } = setup()
  const id = ps.create({ kind: 'new-skill', title: 'nope', trust: 0.1 })
  rejectProposal(ps, id)
  expect(ps.get(id)!.status).toBe('rejected')
})
