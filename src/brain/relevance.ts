import type { SearchResult } from './search.js'

/**
 * Gate 3: does a search hit actually look like a reusable skill/prompt, or is it just a
 * web page that happened to match keywords (a product page, an app-store listing, a help
 * thread)? We only file proposals for things that plausibly *are* skills.
 */

// Hosts that essentially never host a reusable skill — product pages, app mirrors, stores.
const JUNK_HOSTS = [
  'apkpure.net',
  'apkpure.com',
  'apkmirror.com',
  'play.google.com',
  'apps.apple.com',
  'youtube.com',
  'facebook.com',
  'twitter.com',
  'x.com',
]

// Hosts where a hit is plausibly a skill even without keyword signals (skill registries / code hosts).
const SKILL_HOSTS = [
  'github.com',
  'raw.githubusercontent.com',
  'gitlab.com',
  'skills.sh',
  'skills.rest',
]

// Textual signals that the page is about a reusable skill/prompt/agent, not a product.
const SKILL_SIGNALS =
  /\b(skill|skills|prompt|prompts|system prompt|agent|agents|SKILL\.md|AGENTS\.md|claude code|codex|mcp server|workflow|playbook|cheat ?sheet)\b/i

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function hostMatches(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith('.' + h))
}

export function looksLikeSkill(r: SearchResult): boolean {
  const host = hostOf(r.url)
  if (host && hostMatches(host, JUNK_HOSTS)) return false
  if (host && hostMatches(host, SKILL_HOSTS)) return true
  const hay = `${r.title} ${r.snippet}`
  return SKILL_SIGNALS.test(hay)
}
