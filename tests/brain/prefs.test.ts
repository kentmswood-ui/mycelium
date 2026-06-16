import { openDb } from '../../src/ledger/db.js'
import { SettingsStore } from '../../src/brain/settings.js'
import { readPrefs, DEFAULT_PREFS, PREF_KEYS } from '../../src/brain/prefs.js'

test('readPrefs returns conservative defaults on a fresh db', () => {
  const s = new SettingsStore(openDb(':memory:'))
  const p = readPrefs(s)
  expect(p.triggerMode).toBe('session')
  expect(p.recurrenceThreshold).toBe(3)
  expect(p.dailyQuota).toBe(5)
  expect(p.keywords).toContain('研究')
})

test('readPrefs reflects values written to settings', () => {
  const s = new SettingsStore(openDb(':memory:'))
  s.set(PREF_KEYS.triggerMode, 'keyword')
  s.set(PREF_KEYS.keywords, ['学习'])
  s.set(PREF_KEYS.recurrenceThreshold, 1)
  s.set(PREF_KEYS.dailyQuota, 99)
  const p = readPrefs(s)
  expect(p.triggerMode).toBe('keyword')
  expect(p.keywords).toEqual(['学习'])
  expect(p.recurrenceThreshold).toBe(1)
  expect(p.dailyQuota).toBe(99)
})

test('DEFAULT_PREFS is the least-eager configuration', () => {
  // sanity: defaults should never be the most aggressive option
  expect(DEFAULT_PREFS.recurrenceThreshold).toBeGreaterThan(1)
})
