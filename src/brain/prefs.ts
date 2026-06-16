import type { SettingsStore } from './settings.js'
import { DEFAULT_TIERS, type Tier } from './sources.js'

/**
 * Runtime preferences that the cockpit can change without a code edit. All persisted in the
 * `settings` table (JSON-encoded) and read through SettingsStore. Defaults are conservative:
 * least eager, least token-spend, so a fresh install never surprises the user with cost.
 */

/** How the agent decides WHEN to wake mycelium. The agent honors this via CLAUDE.md rules;
 *  mycelium also enforces 'keyword' defensively inside consult. */
export type TriggerMode = 'explicit' | 'session' | 'keyword'

export interface Prefs {
  /** explicit = only when the prompt names mycelium; session = once per session/task;
   *  keyword  = only when the task contains one of `keywords`. */
  triggerMode: TriggerMode
  /** custom trigger words for keyword mode, e.g. ['研究', 'research']. */
  keywords: string[]
  /** which data-source tiers the online-research step may use. */
  sourceTiers: Tier[]
  /** how many times the same task-shape must miss locally before expensive steps fire. */
  recurrenceThreshold: number
  /** max new skills auto-handled (install/build-suggest) per day, to cap token spend. */
  dailyQuota: number
  /** the user's primary working language. Drives the cockpit default language and, when a
   *  CJK language, makes register_skill REQUIRE keywords so a self-built skill is matchable by
   *  the same-language task that prompted it. 'auto' leaves the cockpit to client/localStorage. */
  primaryLanguage: 'auto' | 'zh' | 'en'
}

export const PREF_KEYS = {
  triggerMode: 'trigger_mode',
  keywords: 'trigger_keywords',
  sourceTiers: 'source_tiers',
  recurrenceThreshold: 'recurrence_threshold',
  dailyQuota: 'daily_quota',
  primaryLanguage: 'primary_language',
} as const

export const DEFAULT_PREFS: Prefs = {
  triggerMode: 'session',
  keywords: ['研究', 'research'],
  sourceTiers: DEFAULT_TIERS,
  recurrenceThreshold: 3,
  dailyQuota: 5,
  primaryLanguage: 'auto',
}

/** Languages whose tasks share no tokens with English skill names → register_skill needs keywords. */
export const CJK_LANGUAGES: ReadonlyArray<Prefs['primaryLanguage']> = ['zh']

export const TRIGGER_MODES: { id: TriggerMode; label: string }[] = [
  { id: 'explicit', label: '显式调用（prompt 里提到 mycelium 才触发）' },
  { id: 'session', label: '每会话自动（每次任务都走一遍）' },
  { id: 'keyword', label: '自定义关键词（命中关键词才触发）' },
]

export const LANGUAGES: { id: Prefs['primaryLanguage']; label: string }[] = [
  { id: 'auto', label: '自动 / Auto' },
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
]

export function readPrefs(s: SettingsStore): Prefs {
  return {
    triggerMode: s.get<TriggerMode>(PREF_KEYS.triggerMode, DEFAULT_PREFS.triggerMode),
    keywords: s.get<string[]>(PREF_KEYS.keywords, DEFAULT_PREFS.keywords),
    sourceTiers: s.get<Tier[]>(PREF_KEYS.sourceTiers, DEFAULT_PREFS.sourceTiers),
    recurrenceThreshold: s.get<number>(PREF_KEYS.recurrenceThreshold, DEFAULT_PREFS.recurrenceThreshold),
    dailyQuota: s.get<number>(PREF_KEYS.dailyQuota, DEFAULT_PREFS.dailyQuota),
    primaryLanguage: s.get<Prefs['primaryLanguage']>(PREF_KEYS.primaryLanguage, DEFAULT_PREFS.primaryLanguage),
  }
}
