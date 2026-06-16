import { ConsultRequest, ConsultResponse, FeedbackRequest } from '../../src/mcep/schema.js'

test('consult request validates and rejects empty task', () => {
  expect(ConsultRequest.safeParse({ task: 'add usdt', tool: 'codex' }).success).toBe(true)
  expect(ConsultRequest.safeParse({ task: '', tool: 'codex' }).success).toBe(false)
})

test('consult response supports the three verdicts', () => {
  expect(ConsultResponse.safeParse({ verdict: 'pass' }).success).toBe(true)
  expect(
    ConsultResponse.safeParse({ verdict: 'reuse', skill: 'usdt-pay', experience: 'used 3x' }).success,
  ).toBe(true)
  expect(ConsultResponse.safeParse({ verdict: 'searching', note: 'queued' }).success).toBe(true)
  expect(ConsultResponse.safeParse({ verdict: 'bogus' }).success).toBe(false)
})

test('feedback request requires outcome enum', () => {
  expect(FeedbackRequest.safeParse({ skill: 'x', tool: 'codex', outcome: 'ok' }).success).toBe(true)
  expect(FeedbackRequest.safeParse({ skill: 'x', tool: 'codex', outcome: 'meh' }).success).toBe(false)
})
