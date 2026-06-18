import { openDb } from '../../src/ledger/db.js'
import { RecurrenceLedger, signatureOf } from '../../src/brain/recurrence.js'

test('signatureOf collapses word order and dupes to the same shape', () => {
  expect(signatureOf('build a youtube pipeline')).toBe(signatureOf('youtube pipeline build a'))
  expect(signatureOf('研究 youtube 自动化')).toBe(signatureOf('自动化 研究 youtube'))
})

test('recordMiss increments the count for a recurring shape', () => {
  const r = new RecurrenceLedger(openDb(':memory:'))
  expect(r.recordMiss('build youtube pipeline')).toBe(1)
  expect(r.recordMiss('youtube pipeline build')).toBe(2) // same shape
  expect(r.recordMiss('kubernetes deploy strategy')).toBe(1) // different shape
  expect(r.countFor('pipeline youtube build')).toBe(2)
})

test('recordMiss and counters degrade cleanly for empty task shapes', () => {
  const r = new RecurrenceLedger(openDb(':memory:'))

  expect(signatureOf('')).toBe('')
  expect(r.recordMiss('')).toBe(0)
  expect(r.countFor('never seen before')).toBe(0)
  expect(r.wasBuildSuggested('never seen before')).toBe(false)
})

test('quota: underQuota gates after the cap is reached', () => {
  const r = new RecurrenceLedger(openDb(':memory:'))
  expect(r.underQuota(2)).toBe(true)
  r.chargeQuota()
  expect(r.underQuota(2)).toBe(true)
  r.chargeQuota()
  expect(r.underQuota(2)).toBe(false) // spent 2, cap 2
  expect(r.spentToday()).toBe(2)
})

test('quota <= 0 means unlimited', () => {
  const r = new RecurrenceLedger(openDb(':memory:'))
  r.chargeQuota()
  r.chargeQuota()
  expect(r.underQuota(0)).toBe(true)
  expect(r.underQuota(-1)).toBe(true)
})

test('build-suggested flag: marked once, sticks per shape', () => {
  const r = new RecurrenceLedger(openDb(':memory:'))
  r.recordMiss('build youtube pipeline')
  expect(r.wasBuildSuggested('youtube pipeline build')).toBe(false)
  r.markBuildSuggested('youtube pipeline build') // same shape
  expect(r.wasBuildSuggested('build youtube pipeline')).toBe(true)
  // a different shape is unaffected
  r.recordMiss('deploy kubernetes cluster')
  expect(r.wasBuildSuggested('deploy kubernetes cluster')).toBe(false)
})

test('markBuildSuggested is harmless for empty or unknown shapes', () => {
  const r = new RecurrenceLedger(openDb(':memory:'))

  r.markBuildSuggested('')
  r.markBuildSuggested('missing shape')

  expect(r.wasBuildSuggested('')).toBe(false)
  expect(r.wasBuildSuggested('missing shape')).toBe(false)
})
