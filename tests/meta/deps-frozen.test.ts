import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

test('package dependency sets stay frozen for matcher precision work', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  expect(pkg.dependencies).toEqual({
    '@modelcontextprotocol/sdk': '^1.29.0',
    'better-sqlite3': '^12.10.1',
    chokidar: '^5.0.0',
    express: '^5.2.1',
    'gray-matter': '^4.0.3',
    zod: '^4.4.3',
  })
  expect(pkg.devDependencies).toEqual({
    '@huggingface/transformers': '4.2.0',
    '@types/better-sqlite3': '^7.6.13',
    '@types/express': '^5.0.6',
    '@types/node': '^25.9.3',
    '@vitest/coverage-v8': '4.1.9',
    tsx: '^4.22.4',
    typescript: '^6.0.3',
    vitest: '^4.1.9',
  })
})
