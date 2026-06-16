import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, cpSync, lstatSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

function isJunctionOrLink(target: string): boolean {
  try {
    return lstatSync(target).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Make the canonical skills available at a tool's skills dir.
 *
 * SAFETY: this never deletes a directory Mycelium did not create. If the target
 * already exists as a real directory (e.g. the tool's own pre-existing skills),
 * we merge each canonical skill in by name — additive/refresh only, never a wipe.
 * Only when the target is absent do we create a whole-dir junction (Windows, no
 * admin) or, failing that, a recursive copy.
 */
export function syncSkillsTo(canonicalSkillsDir: string, targetSkillsDir: string): void {
  mkdirSync(canonicalSkillsDir, { recursive: true })
  mkdirSync(dirname(targetSkillsDir), { recursive: true })

  // already our junction/link → nothing to do
  if (isJunctionOrLink(targetSkillsDir)) return

  // target absent → cleanest: junction the whole dir, else copy
  if (!existsSync(targetSkillsDir)) {
    if (process.platform === 'win32') {
      try {
        execFileSync('cmd', ['/c', 'mklink', '/J', targetSkillsDir, canonicalSkillsDir], {
          stdio: 'ignore',
          windowsHide: true, // never flash a console window on startup
        })
        return
      } catch {
        // fall through to copy
      }
    }
    cpSync(canonicalSkillsDir, targetSkillsDir, { recursive: true })
    return
  }

  // target EXISTS as a real directory we did not create — NEVER delete it.
  // Merge each canonical skill in by name (non-destructive add/refresh).
  for (const entry of readdirSync(canonicalSkillsDir)) {
    cpSync(join(canonicalSkillsDir, entry), join(targetSkillsDir, entry), { recursive: true })
  }
}
