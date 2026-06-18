import { openDb } from '../../src/ledger/db.js'
import { SearchPipeline } from '../../src/brain/pipeline.js'
import { DiscoveryStore } from '../../src/brain/discoveries.js'
import { SettingsStore } from '../../src/brain/settings.js'
import { ProposalStore } from '../../src/brain/proposals.js'
import { SkillRepository } from '../../src/skills/repository.js'
import type { SearchResult } from '../../src/brain/search.js'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SKILL_PAGE =
  'Here is the skill file:\n---\nname: usdt-pay\ndescription: pay with usdt\n---\n# USDT Pay\nDo the thing.'

function harness(deps: {
  search?: (q: string) => Promise<SearchResult[]>
  extract?: (u: string) => Promise<string>
}) {
  const db = openDb(':memory:')
  const discoveries = new DiscoveryStore(db)
  const settings = new SettingsStore(db)
  const proposals = new ProposalStore(db)
  const dir = mkdtempSync(join(tmpdir(), 'myc-pipe-'))
  const repo = new SkillRepository(dir)
  repo.scan()
  const pipe = new SearchPipeline(discoveries, settings, repo, dir, proposals, {
    extract: deps.extract ?? (async () => 'plain page, no frontmatter'),
    ...deps,
  })
  return { pipe, discoveries, settings, proposals, repo, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const gh = (title: string, snippet = 'MIT'): SearchResult => ({
  title,
  url: `https://github.com/org/${title}`,
  snippet,
})

test('strips self-names; query of only self-names searches nothing', async () => {
  let called = false
  const h = harness({ search: async () => { called = true; return [] } })
  const r = await h.pipe.runForMiss('mycelium')
  expect(r.proposed).toBe(0)
  expect(called).toBe(false)
  h.cleanup()
})

test('search hits are logged as discoveries', async () => {
  const h = harness({ search: async () => [gh('real-skill')] })
  await h.pipe.runForMiss('integrate payment skill')
  expect(h.discoveries.recent().length).toBeGreaterThan(0)
  h.cleanup()
})

test('junk + disabled-tier hits are filtered out', async () => {
  const h = harness({
    search: async () => [
      { title: 'wallet', url: 'https://apkpure.net/x', snippet: 'download' },
      { title: 'thread', url: 'https://www.reddit.com/r/x/comments/y', snippet: 'help' },
    ],
  })
  h.settings.set('source_tiers', ['code']) // reddit (community) + apkpure (junk) dropped
  const r = await h.pipe.runForMiss('build something obscure')
  expect(r.discovered).toBe(0)
  expect(r.proposed).toBe(0)
  h.cleanup()
})

test('a ready-made SKILL.md on a high-trust hit becomes an install proposal (not auto-landed)', async () => {
  const h = harness({
    search: async () => [gh('usdt-skill')],
    extract: async () => SKILL_PAGE,
  })
  const r = await h.pipe.runForMiss('integrate usdt payment into billing')
  expect(r.proposed).toBe(1)
  expect(r.skill).toBe('usdt-pay')
  // NOT installed yet — it's a pending proposal awaiting approval
  const pending = h.proposals.listPendingDestructive()
  expect(pending).toHaveLength(1)
  expect(pending[0].kind).toBe('install')
  expect(pending[0].payload.skillMd).toMatch(/name: usdt-pay/)
  // and nothing was written to the skills dir
  expect(h.repo.list()).toHaveLength(0)
  h.cleanup()
})

test('a ready-made SKILL.md for an existing skill is logged as duplicate, not proposed', async () => {
  const h = harness({
    search: async () => [gh('usdt-skill')],
    extract: async () => SKILL_PAGE,
  })
  mkdirSync(join(h.dir, 'usdt-pay'), { recursive: true })
  writeFileSync(
    join(h.dir, 'usdt-pay', 'SKILL.md'),
    '---\nname: usdt-pay\ndescription: existing payment skill\n---\n# USDT Pay',
  )
  h.repo.scan()

  const r = await h.pipe.runForMiss('integrate usdt payment into billing')
  const recent = h.discoveries.recent()

  expect(r).toEqual({ discovered: 1, proposed: 0 })
  expect(h.proposals.listPendingDestructive()).toHaveLength(0)
  expect(recent[0].disposition).toBe('duplicate')
  expect(recent[0].detail).toContain('already have skill "usdt-pay"')
  h.cleanup()
})

test('low-trust kept hits are logged but not probed for SKILL.md content', async () => {
  let extracted = false
  const h = harness({
    search: async () => [
      {
        title: 'Reusable Claude skill notes',
        url: 'https://someblog.example/skill-notes',
        snippet: 'agent prompt workflow with no license signal',
      },
    ],
    extract: async () => {
      extracted = true
      return SKILL_PAGE
    },
  })

  const r = await h.pipe.runForMiss('find a reusable prompt workflow skill')

  expect(r).toEqual({ discovered: 1, proposed: 0 })
  expect(extracted).toBe(false)
  expect(h.discoveries.recent()[0].disposition).toBe('logged')
  h.cleanup()
})

test('a hit with no ready-made SKILL.md files no proposal', async () => {
  const h = harness({
    search: async () => [gh('blog-post')],
    extract: async () => 'just prose about payments, no frontmatter anywhere',
  })
  const r = await h.pipe.runForMiss('integrate payment skill')
  expect(r.proposed).toBe(0)
  expect(h.proposals.listPendingDestructive()).toHaveLength(0)
  h.cleanup()
})

test('search errors never throw into the brain', async () => {
  const h = harness({ search: async () => { throw new Error('boom') } })
  await expect(h.pipe.runForMiss('x y z')).resolves.toEqual({ discovered: 0, proposed: 0 })
  h.cleanup()
})

test('extract failures degrade to logging only (never throw)', async () => {
  const h = harness({
    search: async () => [gh('real-skill')],
    extract: async () => { throw new Error('extract failed') },
  })
  const r = await h.pipe.runForMiss('integrate payment skill')
  expect(r.proposed).toBe(0)
  expect(h.discoveries.recent().length).toBeGreaterThan(0)
  h.cleanup()
})
