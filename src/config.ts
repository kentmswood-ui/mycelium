import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface MyceliumConfig {
  root: string
  skillsDir: string
  archiveDir: string
  promptsDir: string
  dbPath: string
  bindAddr: string
  cockpitPort: number
  consultTimeoutMs: number
  /** directory of the user's memory notes, scanned for step-1 recall. '' disables recall. */
  memoryDir: string
}

/**
 * Resolve the install root portably so a fresh clone runs anywhere (no hard-coded path).
 * Priority: explicit MYCELIUM_ROOT env → the package root inferred from this module's location
 * (compiled to <root>/dist/config.js, so root is two levels up). Tests can still pass an explicit root.
 */
function defaultRoot(): string {
  if (process.env.MYCELIUM_ROOT) return process.env.MYCELIUM_ROOT
  // this file lives at <root>/dist/config.js (built) or <root>/src/config.ts (tsx dev) → up two.
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

export function resolveConfig(root = defaultRoot()): MyceliumConfig {
  return {
    root,
    // Canonical skills store. Defaults to <root>/skills, but can be pointed at an
    // existing shared store (e.g. ccswitch's ~/.cc-switch/skills) via MYCELIUM_SKILLS_DIR.
    skillsDir: process.env.MYCELIUM_SKILLS_DIR || join(root, 'skills'),
    archiveDir: join(root, 'archive'),
    promptsDir: join(root, 'prompts'),
    dbPath: join(root, 'ledger', 'synapse.db'),
    bindAddr: '127.0.0.1',
    cockpitPort: 7077,
    consultTimeoutMs: 800,
    // Step-1 recall source. Defaults empty (off) so a fresh install never scans surprise dirs;
    // point it at your notes via MYCELIUM_MEMORY_DIR.
    memoryDir: process.env.MYCELIUM_MEMORY_DIR || '',
  }
}
