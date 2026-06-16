import { Brain } from '../../src/brain/consult.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { SettingsStore } from '../../src/brain/settings.js'
import { RecurrenceLedger } from '../../src/brain/recurrence.js'
import { PREF_KEYS } from '../../src/brain/prefs.js'
import { openDb } from '../../src/ledger/db.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = import.meta.dirname

function makeBrain(misses: string[]) {
  const repo = new SkillRepository(join(here, '..', 'fixtures', 'skills'))
  repo.scan()
  const led = new SynapseLedger(openDb(':memory:'))
  return new Brain(repo, new KeywordMatcher(), led, { onMiss: (t) => { misses.push(t) } })
}

test('trivial task returns pass without matching', () => {
  const b = makeBrain([])
  expect(b.consult({ task: 'fix typo', tool: 'codex' }).verdict).toBe('pass')
})

test('matching task returns reuse with experience', () => {
  const b = makeBrain([])
  const r = b.consult({ task: 'add usdt payment to billing', tool: 'codex' })
  expect(r.verdict).toBe('reuse')
  if (r.verdict === 'reuse') expect(r.skill).toBe('usdt-pay')
})

test('miss returns searching and fires onMiss once', () => {
  const misses: string[] = []
  const b = makeBrain(misses)
  const r = b.consult({ task: 'orchestrate kubernetes blue-green deploy', tool: 'claude' })
  expect(r.verdict).toBe('searching')
  expect(misses).toHaveLength(1)
})

test('feedback delegates to ledger', () => {
  const b = makeBrain([])
  b.consult({ task: 'add usdt payment to billing', tool: 'codex' })
  b.feedback({ skill: 'usdt-pay', tool: 'codex', outcome: 'ok' })
  expect(b.ledger.strengthOf('usdt-pay')).toBeGreaterThan(0)
})

test('meta query ("是否可用") passes without firing onMiss', () => {
  const misses: string[] = []
  const b = makeBrain(misses)
  const r = b.consult({ task: '确认当前是否可用 mycelium 工具', tool: 'claude' })
  expect(r.verdict).toBe('pass')
  expect(misses).toHaveLength(0)
})

test('recursion guard: MYCELIUM_SUBPROCESS forces pass (no onMiss)', () => {
  const prev = process.env.MYCELIUM_SUBPROCESS
  process.env.MYCELIUM_SUBPROCESS = '1'
  try {
    const misses: string[] = []
    const b = makeBrain(misses)
    // a task that would normally match a skill must still pass under the guard
    const r = b.consult({ task: 'add usdt payment to billing', tool: 'codex' })
    expect(r.verdict).toBe('pass')
    expect(misses).toHaveLength(0)
  } finally {
    if (prev === undefined) delete process.env.MYCELIUM_SUBPROCESS
    else process.env.MYCELIUM_SUBPROCESS = prev
  }
})

function fullBrain(over: { recurrence?: boolean; memoryDir?: string; settings?: (s: SettingsStore) => void } = {}) {
  const repo = new SkillRepository(join(here, '..', 'fixtures', 'skills'))
  repo.scan()
  const db = openDb(':memory:')
  const led = new SynapseLedger(db)
  const settings = new SettingsStore(db)
  over.settings?.(settings)
  const misses: string[] = []
  const brain = new Brain(repo, new KeywordMatcher(), led, {
    onMiss: (t) => misses.push(t),
    settings,
    recurrence: over.recurrence === false ? undefined : new RecurrenceLedger(db),
    memoryDir: over.memoryDir,
  })
  return { brain, misses, settings }
}

test('keyword trigger mode: non-keyword task passes, keyword task proceeds', () => {
  const { brain } = fullBrain({
    settings: (s) => {
      s.set(PREF_KEYS.triggerMode, 'keyword')
      s.set(PREF_KEYS.keywords, ['研究'])
    },
  })
  expect(brain.consult({ task: 'orchestrate kubernetes blue green deploy', tool: 'c' }).verdict).toBe('pass')
  // a keyword task with no local match → not pass
  expect(brain.consult({ task: '研究 全自动制作 youtube 视频 pipeline', tool: 'c' }).verdict).not.toBe('pass')
})

test('recall: a matching memory note yields a recall verdict before searching', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myc-c-mem-'))
  writeFileSync(join(dir, 'k8s.md'), '# Blue green\nkubernetes blue green deployment rollout strategy notes')
  const { brain, misses } = fullBrain({ memoryDir: dir })
  const r = brain.consult({ task: 'kubernetes blue green deployment strategy', tool: 'c' })
  expect(r.verdict).toBe('recall')
  if (r.verdict === 'recall') expect(r.notes[0].title).toBe('Blue green')
  expect(misses).toHaveLength(0) // recall short-circuits before research
  rmSync(dir, { recursive: true, force: true })
})

test('build: a recurring miss past threshold escalates to build, but only once', () => {
  const { brain } = fullBrain({ settings: (s) => s.set(PREF_KEYS.recurrenceThreshold, 2) })
  const task = 'orchestrate kubernetes blue green deploy pipeline'
  expect(brain.consult({ task, tool: 'c' }).verdict).toBe('searching') // 1st miss
  const r = brain.consult({ task, tool: 'c' }) // 2nd miss → threshold → build
  expect(r.verdict).toBe('build')
  if (r.verdict === 'build') expect(r.reason).toMatch(/recurred/)
  // 3rd miss: already suggested → must NOT nag again, falls through to searching
  expect(brain.consult({ task, tool: 'c' }).verdict).toBe('searching')
})

test('quota: research + charge stops once the daily cap is hit', () => {
  const { brain, misses } = fullBrain({
    settings: (s) => {
      s.set(PREF_KEYS.dailyQuota, 2) // cap at 2 expensive actions/day
      s.set(PREF_KEYS.recurrenceThreshold, 99) // keep it on the searching path
    },
  })
  // three DISTINCT shapes → first two spend (fire onMiss), third is over quota
  brain.consult({ task: 'novel task alpha beta', tool: 'c' })
  brain.consult({ task: 'different gamma delta epsilon', tool: 'c' })
  brain.consult({ task: 'yet another zeta eta theta', tool: 'c' })
  expect(misses.length).toBe(2) // 3rd blocked by quota
})
