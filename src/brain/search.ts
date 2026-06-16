import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const pexecFile = promisify(execFile)

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

/** Pulls a page's content as markdown. Injectable for tests. */
export type Extractor = (url: string) => Promise<string>

/** Parse the Markdown that anysearch's `search` command prints into structured results. */
export function parseAnysearchMarkdown(md: string): SearchResult[] {
  const out: SearchResult[] = []
  const blocks = md.split(/\n### \d+\.\s+/).slice(1) // drop the header before the first result
  for (const raw of blocks) {
    const lines = raw.split('\n')
    const title = (lines[0] ?? '').trim()
    if (!title) continue
    let url = ''
    const snippetParts: string[] = []
    for (const line of lines.slice(1)) {
      const urlMatch = line.match(/^-\s+\*\*URL\*\*:\s*(\S+)/)
      if (urlMatch) {
        url = urlMatch[1]
        continue
      }
      const bullet = line.match(/^-\s+(.*)$/)
      if (bullet && bullet[1].trim()) snippetParts.push(bullet[1].trim())
    }
    out.push({ title, url, snippet: snippetParts.join(' ').trim() })
  }
  return out
}

/** Locate the installed anysearch CLI; returns null if not found. */
export function resolveAnysearchCli(): { cmd: string; args: string[] } | null {
  const candidates = [
    join(homedir(), '.codex', 'skills', 'anysearch', 'scripts', 'anysearch_cli.py'),
    join(homedir(), '.cc-switch', 'skills', 'anysearch', 'scripts', 'anysearch_cli.py'),
    join(homedir(), '.claude', 'skills', 'anysearch', 'scripts', 'anysearch_cli.py'),
  ]
  for (const c of candidates) if (existsSync(c)) return { cmd: 'python', args: [c] }
  return null
}

export interface SearchOpts {
  maxResults?: number
  /** Injectable runner for tests; defaults to the real anysearch CLI. Returns raw stdout (sync or async). */
  runner?: (query: string, maxResults: number) => string | Promise<string>
}

export async function anysearchSearch(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
  const maxResults = opts.maxResults ?? 5
  try {
    const runner =
      opts.runner ??
      (async (q: string, n: number) => {
        const cli = resolveAnysearchCli()
        if (!cli) throw new Error('anysearch CLI not found')
        // async exec — never blocks the event loop (consult must stay non-blocking)
        const { stdout } = await pexecFile(
          cli.cmd,
          [...cli.args, 'search', q, '--max_results', String(n)],
          { encoding: 'utf8', timeout: 40000, windowsHide: true },
        )
        return stdout
      })
    return parseAnysearchMarkdown(await runner(query, maxResults))
  } catch {
    // Spec §8: search failures are silent — log nowhere noisy, degrade to empty.
    return []
  }
}

/**
 * Pull a page's full content as Markdown via anysearch `extract`. Best-effort: returns ''
 * on any failure (missing CLI, network, timeout) so synthesis degrades to snippet-only.
 */
export async function anysearchExtract(url: string): Promise<string> {
  try {
    const cli = resolveAnysearchCli()
    if (!cli) return ''
    const { stdout } = await pexecFile(cli.cmd, [...cli.args, 'extract', url], {
      encoding: 'utf8',
      timeout: 40000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    })
    return stdout ?? ''
  } catch {
    return ''
  }
}
