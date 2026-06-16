import { parseFeedback } from '../../src/brain/feedback-nl.js'

test('detects negative sentiment in Chinese', () => {
  const r = parseFeedback('这个 skill 不好用，老是出错')
  expect(r.outcome).toBe('fail')
  expect(r.note).toMatch(/不好用/)
})

test('detects positive sentiment in Chinese', () => {
  const r = parseFeedback('刚那个提示词很神，太好用了')
  expect(r.outcome).toBe('ok')
})

test('detects negative sentiment in English', () => {
  expect(parseFeedback('this skill is broken and useless').outcome).toBe('fail')
})

test('detects positive sentiment in English', () => {
  expect(parseFeedback('that worked great, very useful').outcome).toBe('ok')
})

test('ambiguous text returns null outcome but keeps the note', () => {
  const r = parseFeedback('hmm not sure about this one')
  expect(r.outcome).toBeNull()
  expect(r.note).toBe('hmm not sure about this one')
})
