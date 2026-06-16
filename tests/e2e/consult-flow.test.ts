import { buildMcpHandlers } from '../../src/mcp/server.js'
import { Brain } from '../../src/brain/consult.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { openDb } from '../../src/ledger/db.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('codex consult+feedback, then claude sees shared experience', async () => {
  const root = mkdtempSync(join(tmpdir(), 'myc-e2e-'))
  const sk = join(root, 'skills', 'usdt-pay')
  mkdirSync(sk, { recursive: true })
  writeFileSync(
    join(sk, 'SKILL.md'),
    '---\nname: usdt-pay\ndescription: integrate usdt payment billing\nkeywords: [usdt, payment, billing]\n---\n# x',
  )
  const repo = new SkillRepository(join(root, 'skills'))
  repo.scan()
  const ledger = new SynapseLedger(openDb(':memory:'))
  const brain = new Brain(repo, new KeywordMatcher(), ledger)
  const h = buildMcpHandlers(brain)

  const c1 = JSON.parse(
    (await h.consult({ task: 'integrate usdt payment into billing', tool: 'codex' })).content[0]
      .text,
  )
  expect(c1.verdict).toBe('reuse')
  await h.feedback({ skill: 'usdt-pay', tool: 'codex', outcome: 'ok' })

  // a different tool consults the SAME brain and sees codex's experience
  const c2 = JSON.parse(
    (await h.consult({ task: 'add usdt payment billing flow', tool: 'claude' })).content[0].text,
  )
  expect(c2.verdict).toBe('reuse')
  expect(c2.experience).toMatch(/codex/)
  expect(ledger.strengthOf('usdt-pay')).toBeGreaterThan(0.2)
})
