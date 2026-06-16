import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ToolAdapter } from './adapter.js'

const h = homedir()

export const codexAdapter: ToolAdapter = {
  id: 'codex',
  homeMarker: join(h, '.codex'),
  skillsDir: join(h, '.codex', 'skills'),
  instructionFile: join(h, '.codex', 'AGENTS.md'),
  capabilities: { supportsMcp: true, supportsHooks: false },
}
