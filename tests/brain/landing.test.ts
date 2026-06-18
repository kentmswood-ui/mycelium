import { openDb } from '../../src/ledger/db.js'
import { ProposalStore } from '../../src/brain/proposals.js'
import {
  approveProposal,
  injectKeywords,
  landProposal,
  landSynthesized,
  rejectProposal,
} from '../../src/brain/landing.js'
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'

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

test('injectKeywords merges, trims, and de-duplicates frontmatter keywords', () => {
  const md = '---\nname: sample\ndescription: sample\nkeywords: [alpha]\n---\n# Sample'
  const out = injectKeywords(md, [' alpha ', 'beta', '', 'beta'])
  const parsed = matter(out)

  expect(injectKeywords(md, [])).toBe(md)
  expect(parsed.data.keywords).toEqual(['alpha', 'beta'])
})

test('landSynthesized writes injected keywords and provenance sidecar', () => {
  const { skillsDir } = setup()
  const dir = landSynthesized('---\nname: Mixed Skill\ndescription: reusable helper\n---\n# Mixed Skill', {
    skillsDir,
    source: 'agent',
    sourceUrl: 'https://example.test/source',
    trust: 0.9,
    purpose: 'cover landing synthesis behavior',
    addedBy: 'test-agent',
    keywords: ['billing', 'payment'],
  })
  const parsed = matter(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
  const sidecar = JSON.parse(readFileSync(join(dir, '.mycelium.json'), 'utf8'))

  expect(dir.endsWith(join('mixed-skill'))).toBe(true)
  expect(parsed.data.keywords).toEqual(['billing', 'payment'])
  expect(sidecar).toMatchObject({
    source: 'agent',
    sourceUrl: 'https://example.test/source',
    trust: 0.9,
    purpose: 'cover landing synthesis behavior',
    protected: false,
    addedBy: 'test-agent',
  })
})

test('approving a prune proposal archives the skill and marks the ledger', () => {
  const { ps, skillsDir } = setup()
  const archiveDir = mkdtempSync(join(tmpdir(), 'myc-archive-'))
  mkdirSync(join(skillsDir, 'old-skill'), { recursive: true })
  writeFileSync(join(skillsDir, 'old-skill', 'SKILL.md'), '# Old Skill')
  const archived: string[] = []
  const id = ps.create({
    kind: 'prune',
    title: 'Archive old-skill',
    trust: 0.7,
    payload: { skill: 'old-skill' },
  })

  const dir = approveProposal(ps, id, {
    skillsDir,
    archiveDir,
    ledger: { archive: (name) => archived.push(name) },
  })

  expect(dir).toBeNull()
  expect(existsSync(join(skillsDir, 'old-skill'))).toBe(false)
  expect(existsSync(join(archiveDir, 'old-skill', 'SKILL.md'))).toBe(true)
  expect(archived).toEqual(['old-skill'])
  expect(ps.get(id)!.status).toBe('approved')
})

test('approveProposal ignores missing and non-pending proposals', () => {
  const { ps, skillsDir } = setup()
  const id = ps.create({ kind: 'new-skill', title: 'nope', trust: 0.1 })
  rejectProposal(ps, id)

  expect(approveProposal(ps, 9999, { skillsDir })).toBeNull()
  expect(approveProposal(ps, id, { skillsDir })).toBeNull()
  expect(ps.get(id)!.status).toBe('rejected')
})

test('rejecting sets status rejected without writing files', () => {
  const { ps, skillsDir } = setup()
  const id = ps.create({ kind: 'new-skill', title: 'nope', trust: 0.1 })
  rejectProposal(ps, id)
  expect(ps.get(id)!.status).toBe('rejected')
})
