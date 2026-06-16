import { buildMcpHandlers } from '../../src/mcp/server.js'
import { Brain } from '../../src/brain/consult.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { openDb } from '../../src/ledger/db.js'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = import.meta.dirname

function handlers() {
  const repo = new SkillRepository(join(here, '..', 'fixtures', 'skills'))
  repo.scan()
  const brain = new Brain(repo, new KeywordMatcher(), new SynapseLedger(openDb(':memory:')))
  return buildMcpHandlers(brain)
}

function handlersWithSkillsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'myc-srv-skills-'))
  const repo = new SkillRepository(dir)
  repo.scan()
  const brain = new Brain(repo, new KeywordMatcher(), new SynapseLedger(openDb(':memory:')), {
    skillsDir: dir,
  })
  return { h: buildMcpHandlers(brain), dir, repo, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('consult handler returns structured verdict json', async () => {
  const h = handlers()
  const res = await h.consult({ task: 'add usdt payment to billing', tool: 'codex' })
  const payload = JSON.parse(res.content[0].text)
  expect(payload.verdict).toBe('reuse')
  expect(payload.skill).toBe('usdt-pay')
})

test('consult handler rejects invalid input', async () => {
  const h = handlers()
  const res = await h.consult({ task: '', tool: 'codex' } as any)
  expect(res.isError).toBe(true)
})

test('feedback handler records and acknowledges', async () => {
  const h = handlers()
  await h.consult({ task: 'add usdt payment to billing', tool: 'codex' })
  const res = await h.feedback({ skill: 'usdt-pay', tool: 'codex', outcome: 'ok' })
  expect(res.content[0].text).toMatch(/recorded/i)
})

test('register_skill lands a built skill with a purpose annotation', async () => {
  const { h, dir, repo, cleanup } = handlersWithSkillsDir()
  const SKILL = '---\nname: yt-auto\ndescription: automate youtube uploads\n---\n# steps\n\nReal guidance body with enough text to clear the contract floor for a deposit.'
  const res = await h.registerSkill({
    skillMd: SKILL,
    purpose: '全自动制作并上传 youtube 视频',
    tool: 'claude',
    source: 'github.com',
  })
  expect(res.isError).toBeFalsy()
  expect(JSON.parse(res.content[0].text).skill).toBe('yt-auto')
  expect(existsSync(join(dir, 'yt-auto', 'SKILL.md'))).toBe(true)
  const sidecar = JSON.parse(readFileSync(join(dir, 'yt-auto', '.mycelium.json'), 'utf8'))
  expect(sidecar.purpose).toBe('全自动制作并上传 youtube 视频')
  expect(sidecar.addedBy).toBe('claude-interactive')
  // and it's now consultable
  expect(repo.list().some((s) => s.name === 'yt-auto')).toBe(true)
  cleanup()
})

test('register_skill rejects a duplicate name', async () => {
  const { h, cleanup } = handlersWithSkillsDir()
  const SKILL = '---\nname: dup-skill\ndescription: a duplicate-name skill\n---\n# x\n\nA real body long enough to pass the contract so we reach the duplicate check.'
  await h.registerSkill({ skillMd: SKILL, purpose: 'a meaningful purpose line', tool: 'codex' })
  const res = await h.registerSkill({ skillMd: SKILL, purpose: 'a meaningful purpose line', tool: 'codex' })
  expect(res.isError).toBe(true)
  expect(res.content[0].text).toMatch(/already exists/)
  cleanup()
})

test('register_skill rejects SKILL.md without a name', async () => {
  const { h, cleanup } = handlersWithSkillsDir()
  const res = await h.registerSkill({ skillMd: 'no frontmatter here', purpose: 'p', tool: 'codex' })
  expect(res.isError).toBe(true)
  cleanup()
})
