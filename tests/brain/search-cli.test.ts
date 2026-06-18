import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, vi } from 'vitest'

const SAMPLE = `## Search Results (1 result, 10ms)

### 1. Example
- **URL**: https://example.test
- A useful result.
`

afterEach(() => {
  vi.doUnmock('node:child_process')
  vi.doUnmock('node:fs')
  vi.doUnmock('node:os')
  vi.resetModules()
})

function mockHomeAndFs(home: string, existingPathEndsWith: string | null) {
  vi.doMock('node:os', () => ({ homedir: () => home }))
  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    return {
      ...actual,
      existsSync: (path: string) =>
        existingPathEndsWith === null ? false : path.endsWith(existingPathEndsWith),
    }
  })
}

function mockExecFile(stdout: string) {
  const calls: Array<{ cmd: string; args: string[]; options: Record<string, unknown> }> = []
  const execFile = Object.assign(vi.fn(), {
    [promisify.custom]: async (cmd: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ cmd, args, options })
      return { stdout }
    },
  })
  vi.doMock('node:child_process', () => ({ execFile }))
  return calls
}

test('resolveAnysearchCli returns the first installed candidate', async () => {
  const home = 'C:\\fake-home'
  const ccSwitchCli = join('.cc-switch', 'skills', 'anysearch', 'scripts', 'anysearch_cli.py')
  mockHomeAndFs(home, ccSwitchCli)

  const { resolveAnysearchCli } = await import('../../src/brain/search.js')

  expect(resolveAnysearchCli()).toEqual({
    cmd: 'python',
    args: [join(home, ccSwitchCli)],
  })
})

test('anysearchSearch default runner executes the discovered CLI and parses stdout', async () => {
  const home = 'C:\\fake-home'
  const codexCli = join('.codex', 'skills', 'anysearch', 'scripts', 'anysearch_cli.py')
  mockHomeAndFs(home, codexCli)
  const calls = mockExecFile(SAMPLE)

  const { anysearchSearch } = await import('../../src/brain/search.js')
  const results = await anysearchSearch('payment gateway', { maxResults: 7 })

  expect(results).toEqual([{ title: 'Example', url: 'https://example.test', snippet: 'A useful result.' }])
  expect(calls).toEqual([
    {
      cmd: 'python',
      args: [join(home, codexCli), 'search', 'payment gateway', '--max_results', '7'],
      options: { encoding: 'utf8', timeout: 40000, windowsHide: true },
    },
  ])
})

test('anysearchExtract executes extract and returns stdout when the CLI is available', async () => {
  const home = 'C:\\fake-home'
  const codexCli = join('.codex', 'skills', 'anysearch', 'scripts', 'anysearch_cli.py')
  mockHomeAndFs(home, codexCli)
  const calls = mockExecFile('# Extracted page')

  const { anysearchExtract } = await import('../../src/brain/search.js')

  expect(await anysearchExtract('https://example.test')).toBe('# Extracted page')
  expect(calls[0]).toEqual({
    cmd: 'python',
    args: [join(home, codexCli), 'extract', 'https://example.test'],
    options: { encoding: 'utf8', timeout: 40000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
  })
})

test('anysearchExtract degrades to an empty string when no CLI is installed', async () => {
  mockHomeAndFs('C:\\fake-home', null)

  const { anysearchExtract } = await import('../../src/brain/search.js')

  expect(await anysearchExtract('https://example.test')).toBe('')
})
