import { Brain } from '../../src/brain/consult.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { MisfitStore } from '../../src/brain/misfits.js'
import { signatureOf } from '../../src/brain/recurrence.js'
import { openDb } from '../../src/ledger/db.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function corpus() {
  const dir = mkdtempSync(join(tmpdir(), 'myc-misfit-'))
  // two real-ish skills so IDF/precision are meaningful
  for (const [name, desc, kw] of [
    ['usdt-pay', 'integrate usdt payment billing', 'usdt,payment,billing,trc20'],
    ['pdf-report', 'export pdf reports and invoices', 'pdf,report,invoice,export'],
  ] as const) {
    mkdirSync(join(dir, name), { recursive: true })
    writeFileSync(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\nkeywords: [${kw}]\n---\n# ${name}`)
  }
  return dir
}

test('MisfitStore records and suppresses by task-shape', () => {
  const db = openDb(':memory:')
  const m = new MisfitStore(db)
  expect(m.suppressedFor('add usdt payment to billing').size).toBe(0)
  m.record('add usdt payment to billing', 'usdt-pay')
  expect(m.suppressedFor('add usdt payment to billing').has('usdt-pay')).toBe(true)
  // a different task-shape is unaffected
  expect(m.suppressedFor('export a pdf report').has('usdt-pay')).toBe(false)
})

test('MisfitStore ignores empty task signatures and empty skill names', () => {
  const m = new MisfitStore(openDb(':memory:'))

  expect(m.record('', 'usdt-pay')).toBe(0)
  expect(m.record('add usdt payment', '')).toBe(0)
  expect(m.suppressedFor('')).toEqual(new Set())
  expect(m.suppressedFor('add usdt payment').size).toBe(0)
})

test('MisfitStore suppression threshold requires enough repeated misses', () => {
  const m = new MisfitStore(openDb(':memory:'))

  expect(m.record('add usdt payment billing', 'usdt-pay')).toBe(1)
  expect(m.suppressedFor('billing usdt payment add', 2).has('usdt-pay')).toBe(false)
  expect(m.record('billing usdt payment add', 'usdt-pay')).toBe(2)
  expect(m.suppressedFor('add billing payment usdt', 2)).toEqual(new Set(['usdt-pay']))
})

test('a fail with a task suppresses that skill for the same task-shape on next consult', () => {
  const dir = corpus()
  try {
    const db = openDb(':memory:')
    const repo = new SkillRepository(dir)
    repo.scan()
    const misfits = new MisfitStore(db)
    const brain = new Brain(repo, new KeywordMatcher(), new SynapseLedger(db), { misfits })

    const task = 'add usdt payment to the billing page'
    // first consult reuses usdt-pay
    const first = brain.consult({ task, tool: 'codex' })
    expect(first.verdict).toBe('reuse')
    if (first.verdict === 'reuse') expect(first.skill).toBe('usdt-pay')

    // user reports it was the wrong skill for this task
    brain.feedback({ skill: 'usdt-pay', tool: 'codex', outcome: 'fail', task })

    // same task-shape no longer reuses usdt-pay (suppressed) → falls through, not reuse of usdt-pay
    const again = brain.consult({ task, tool: 'codex' })
    if (again.verdict === 'reuse') expect(again.skill).not.toBe('usdt-pay')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an ok outcome does NOT suppress', () => {
  const dir = corpus()
  try {
    const db = openDb(':memory:')
    const repo = new SkillRepository(dir)
    repo.scan()
    const misfits = new MisfitStore(db)
    const brain = new Brain(repo, new KeywordMatcher(), new SynapseLedger(db), { misfits })
    const task = 'add usdt payment to the billing page'
    brain.feedback({ skill: 'usdt-pay', tool: 'codex', outcome: 'ok', task })
    expect(misfits.suppressedFor(task).has('usdt-pay')).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reject records a misfit WITHOUT weakening the skill strength', () => {
  const db = openDb(':memory:')
  const led = new SynapseLedger(db)
  const misfits = new MisfitStore(db)
  // seed strength so a fail vs reject difference is observable
  led.recordFeedback({ skill: 'frontend-design', tool: 'codex', outcome: 'ok' })
  const before = led.strengthOf('frontend-design')
  const brain = new Brain(new SkillRepository(mkdtempSync(join(tmpdir(), 'myc-x-'))), new KeywordMatcher(), led, { misfits })
  const task = 'explain what these two medications are used for'
  brain.feedback({ skill: 'frontend-design', tool: 'codex', outcome: 'reject', task })
  // strength untouched (the skill is fine for design; just irrelevant here)
  expect(led.strengthOf('frontend-design')).toBe(before)
  // but it is now suppressed for this task-shape
  expect(misfits.suppressedFor(task).has('frontend-design')).toBe(true)
})

test('a later ok REVERSES a prior misfit (self-healing)', () => {
  const db = openDb(':memory:')
  const misfits = new MisfitStore(db)
  const brain = new Brain(new SkillRepository(mkdtempSync(join(tmpdir(), 'myc-y-'))), new KeywordMatcher(), new SynapseLedger(db), { misfits })
  const task = 'integrate usdt payment into billing'
  brain.feedback({ skill: 'usdt-pay', tool: 'codex', outcome: 'reject', task })
  expect(misfits.suppressedFor(task).has('usdt-pay')).toBe(true)
  // positive evidence clears the mark
  brain.feedback({ skill: 'usdt-pay', tool: 'codex', outcome: 'ok', task })
  expect(misfits.suppressedFor(task).has('usdt-pay')).toBe(false)
})

test('a stale misfit (past the decay window) no longer suppresses', () => {
  const db = openDb(':memory:')
  const misfits = new MisfitStore(db)
  const task = 'some recurring task shape alpha beta'
  misfits.record(task, 'usdt-pay')
  expect(misfits.suppressedFor(task).has('usdt-pay')).toBe(true)
  // backdate the misfit 60 days → outside the 30-day decay window → self-healed
  db.prepare("UPDATE skill_misfits SET last_at = datetime('now','-60 days') WHERE signature=?").run(signatureOf(task))
  expect(misfits.suppressedFor(task).has('usdt-pay')).toBe(false)
})
