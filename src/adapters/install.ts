import type { ToolAdapter } from './adapter.js'

const START = '<!-- MYCELIUM:START -->'
const END = '<!-- MYCELIUM:END -->'

export function consultRuleBlock(): string {
  return [
    START,
    '## Mycelium',
    'Before starting ANY task, first call the `consult` tool of the `mycelium` MCP server',
    'with { task: <short description>, tool: <your tool id> }. If the verdict is `reuse`,',
    'load and follow the named skill. If `pass`, proceed normally. After finishing a task',
    'that used a skill, call `feedback` with the outcome. This call is cheap — always do it.',
    END,
  ].join('\n')
}

export function upsertInstruction(current: string, block: string): string {
  const s = current.indexOf(START)
  const e = current.indexOf(END)
  if (s !== -1 && e !== -1) return current.slice(0, s) + block + current.slice(e + END.length)
  return current.trimEnd() + '\n\n' + block + '\n'
}

export interface McpRegistration {
  tool: string
  command: string
  args: string[]
}

export function mcpRegistrationFor(
  a: ToolAdapter,
  command: string,
  args: string[],
): McpRegistration {
  return { tool: a.id, command, args }
}
