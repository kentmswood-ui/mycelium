import type { Prefs } from './prefs.js'

/**
 * The trigger gate: should mycelium wake for this task at all? This is the FIRST decision,
 * before any local match or search. The agent's CLAUDE.md rules are the primary enforcer of
 * trigger mode (it decides whether to call consult), but mycelium also enforces 'keyword'
 * mode defensively here — if a keyword-mode task carries no keyword, we pass immediately so
 * a mis-wired agent can't make the brain churn on every message.
 *
 *  - explicit : the agent only calls consult when the user names mycelium → trust the call.
 *  - session  : the agent calls consult once per task → trust the call.
 *  - keyword  : only proceed when the task contains one of the configured keywords.
 */
export function shouldWake(task: string, prefs: Prefs): boolean {
  if (prefs.triggerMode !== 'keyword') return true
  const hay = task.toLowerCase()
  return prefs.keywords.some((k) => k.trim() && hay.includes(k.trim().toLowerCase()))
}
