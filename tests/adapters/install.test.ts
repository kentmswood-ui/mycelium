import {
  consultRuleBlock,
  mcpRegistrationFor,
  upsertInstruction,
} from '../../src/adapters/install.js'
import { claudeAdapter } from '../../src/adapters/claude.js'

test('consult rule block is fenced and idempotent', () => {
  const before = 'existing instructions\n'
  const once = upsertInstruction(before, consultRuleBlock())
  const twice = upsertInstruction(once, consultRuleBlock())
  expect(once).toContain('MYCELIUM:START')
  expect(once).toContain('consult')
  expect(twice).toBe(once) // applying twice changes nothing
  expect(twice).toContain('existing instructions')
})

test('mcp registration describes a stdio command for the tool', () => {
  const reg = mcpRegistrationFor(claudeAdapter, 'node', ['D:\\Mycelium\\dist\\index.js'])
  expect(reg.tool).toBe('claude')
  expect(reg.command).toBe('node')
  expect(reg.args).toContain('D:\\Mycelium\\dist\\index.js')
})
