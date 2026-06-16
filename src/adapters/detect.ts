import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolAdapter } from './adapter.js'
import { claudeAdapter } from './claude.js'
import { codexAdapter } from './codex.js'
import { openclawAdapter } from './openclaw.js'

const ALL = [claudeAdapter, codexAdapter, openclawAdapter]

export function detectTools(homeOverride?: string): ToolAdapter[] {
  return ALL.filter((a) => {
    const marker = homeOverride ? join(homeOverride, '.' + a.id) : a.homeMarker
    return existsSync(marker)
  })
}

export { ALL as allAdapters }
