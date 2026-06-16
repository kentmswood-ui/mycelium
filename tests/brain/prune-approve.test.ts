import { openDb } from '../../src/ledger/db.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { ProposalStore } from '../../src/brain/proposals.js'
import { approveProposal } from '../../src/brain/landing.js'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('approving a prune proposal soft-deletes: moves dir to archive + ledger.archive', () => {
  const db = openDb(':memory:')
  const led = new SynapseLedger(db)
  const ps = new ProposalStore(db)
  const skillsDir = mkdtempSync(join(tmpdir(), 'myc-prune-skills-'))
  const archiveDir = mkdtempSync(join(tmpdir(), 'myc-prune-arch-'))

  // a mycelium-added skill on disk
  const sk = join(skillsDir, 'weak')
  mkdirSync(sk, { recursive: true })
  writeFileSync(join(sk, 'SKILL.md'), '---\nname: weak\n---\n# weak')
  led.ensureSkill('weak', 'mycelium')

  const id = ps.create({ kind: 'prune', title: 'Prune: weak', trust: 0.5, payload: { skill: 'weak' } })
  approveProposal(ps, id, { skillsDir, archiveDir, ledger: led })

  expect(existsSync(join(skillsDir, 'weak'))).toBe(false) // gone from live dir
  expect(existsSync(join(archiveDir, 'weak', 'SKILL.md'))).toBe(true) // recoverable in archive
  expect(led.isArchived('weak')).toBe(true)
  expect(ps.get(id)!.status).toBe('approved')
})
