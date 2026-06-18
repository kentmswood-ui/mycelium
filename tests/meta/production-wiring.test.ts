import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KeywordMatcher } from '../../src/brain/matcher.js'
import { createMatcher } from '../../src/brain/matchers/factory.js'
import { PrecisionGuardMatcher } from '../../src/brain/matchers/precision-guard.js'

test('production boot routes the matcher through createMatcher (env-overridable)', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8')

  // Production no longer hardcodes a matcher; it goes through the factory so MYCELIUM_MATCHER
  // can swap or revert the active matcher without a code change.
  expect(source).toContain('createMatcher()')
  expect(source).not.toContain('new KeywordMatcher()')
})

test('factory defaults to PrecisionGuardMatcher in production', () => {
  const previous = process.env.MYCELIUM_MATCHER
  delete process.env.MYCELIUM_MATCHER
  try {
    expect(createMatcher()).toBeInstanceOf(PrecisionGuardMatcher)
  } finally {
    if (previous === undefined) delete process.env.MYCELIUM_MATCHER
    else process.env.MYCELIUM_MATCHER = previous
  }
})

test('MYCELIUM_MATCHER=keyword reverts to the original KeywordMatcher', () => {
  // One-env-var rollback path: if precision-guard ever misbehaves in real use, this restores
  // the previous production behavior with no code change.
  expect(createMatcher('keyword')).toBeInstanceOf(KeywordMatcher)
})
