import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ToolAdapter } from './adapter.js'

const h = homedir()

export const claudeAdapter: ToolAdapter = {
  id: 'claude',
  homeMarker: join(h, '.claude'),
  skillsDir: join(h, '.claude', 'skills'),
  instructionFile: join(h, '.claude', 'CLAUDE.md'),
  capabilities: { supportsMcp: true, supportsHooks: true },
}
