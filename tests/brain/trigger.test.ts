import { shouldWake } from '../../src/brain/trigger.js'
import { DEFAULT_PREFS, type Prefs } from '../../src/brain/prefs.js'

const prefs = (over: Partial<Prefs>): Prefs => ({ ...DEFAULT_PREFS, ...over })

test('explicit mode always wakes (agent already gated the call)', () => {
  expect(shouldWake('anything at all', prefs({ triggerMode: 'explicit' }))).toBe(true)
})

test('session mode always wakes', () => {
  expect(shouldWake('build a youtube pipeline', prefs({ triggerMode: 'session' }))).toBe(true)
})

test('keyword mode wakes only when a keyword is present', () => {
  const p = prefs({ triggerMode: 'keyword', keywords: ['研究', 'research'] })
  expect(shouldWake('研究一下全自动制作youtube视频', p)).toBe(true)
  expect(shouldWake('please RESEARCH this topic', p)).toBe(true)
  expect(shouldWake('帮我改个错别字', p)).toBe(false)
})

test('keyword mode with empty/whitespace keywords never matches', () => {
  const p = prefs({ triggerMode: 'keyword', keywords: ['', '  '] })
  expect(shouldWake('any task here', p)).toBe(false)
})
