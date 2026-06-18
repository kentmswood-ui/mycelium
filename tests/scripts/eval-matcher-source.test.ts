import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

test('eval matcher uses the same alias-enriched skill corpus as production consult', () => {
  const source = readFileSync(join(process.cwd(), 'scripts', 'eval-matcher.ts'), 'utf8')

  expect(source).toContain("import { aliasedSkills } from '../src/brain/aliases.js'")
  expect(source).toMatch(/return\s+aliasedSkills\(mergeSkills\(/)
})

test('eval matcher includes the production default precision-guard candidate', () => {
  const source = readFileSync(join(process.cwd(), 'scripts', 'eval-matcher.ts'), 'utf8')

  expect(source).toContain("import { PrecisionGuardMatcher } from '../src/brain/matchers/precision-guard.js'")
  expect(source).toContain("'precision-guard': () => new PrecisionGuardMatcher()")
})
