import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

test('aliasedSkills logic stays frozen; this task may only edit alias data tables', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'brain', 'aliases.ts'), 'utf8')
  const functionSource = source.match(/export function aliasedSkills[\s\S]*$/)?.[0]

  expect(functionSource).toBeTruthy()
  expect(hash(functionSource ?? '')).toBe('66ad3e5c9df36b47d63dd72d3d1808f05e8c18fee40efd3becfd416fb0839d06')
})

function hash(value: string) {
  return createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex')
}
