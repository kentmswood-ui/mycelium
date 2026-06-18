import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const EXPECTED_RUNTIME_DEPENDENCIES = [
  '@modelcontextprotocol/sdk',
  'better-sqlite3',
  'chokidar',
  'express',
  'gray-matter',
  'zod',
]

test('runtime dependency keys stay frozen for hardening work', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(EXPECTED_RUNTIME_DEPENDENCIES)
  expect(pkg.devDependencies).toHaveProperty('@vitest/coverage-v8')
})
