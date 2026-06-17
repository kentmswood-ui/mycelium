import { Brain } from '../../src/brain/consult.js'
import { SkillRepository } from '../../src/skills/repository.js'
import { SynapseLedger } from '../../src/ledger/synapse.js'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { MisfitStore } from '../../src/brain/misfits.js'
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
