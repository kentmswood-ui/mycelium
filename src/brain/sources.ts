import type { SearchResult } from './search.js'

/**
 * Curated data-source tiers for the skill-discovery search path. The user toggles which
 * tiers are active (persisted in settings); anything outside the enabled tiers is dropped,
 * so we never search the open web blindly. Junk hosts are blocked unconditionally.
 */

export type Tier = 'code' | 'docs' | 'community' | 'blogs'

export const ALL_TIERS: Tier[] = ['code', 'docs', 'community', 'blogs']
export const DEFAULT_TIERS: Tier[] = ['code', 'docs', 'community', 'blogs']

export interface TierDef {
  id: Tier
  label: string
  /** hosts that belong to this tier (matched as host === h or *.h) */
  hosts: string[]
  /** blogs tier: allow unknown hosts as long as the text shows a skill signal */
  allowUnknown?: boolean
}

export const TIERS: TierDef[] = [
  {
    id: 'code',
    label: '代码 & skill 市场',
    hosts: [
      'github.com',
      'raw.githubusercontent.com',
      'gist.github.com',
      'gitlab.com',
      'skills.sh',
      'skills.rest',
      'npmjs.com',
    ],
  },
  {
    id: 'docs',
    label: '官方文档',
    hosts: [
      'docs.anthropic.com',
      'anthropic.com',
      'modelcontextprotocol.io',
      'platform.openai.com',
      'developers.openai.com',
      'docs.github.com',
    ],
  },
  {
    id: 'community',
    label: '开发者社区/经验',
    hosts: ['reddit.com', 'news.ycombinator.com', 'stackoverflow.com', 'stackexchange.com'],
  },
  {
    id: 'blogs',
    label: '技术博客/周刊',
    hosts: ['substack.com', 'dev.to', 'medium.com'],
    allowUnknown: true,
  },
]

// Never a reusable skill — blocked regardless of which tiers are on.
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

const SKILL_SIGNALS =
  /\b(skill|skills|prompt|prompts|system prompt|agent|agents|SKILL\.md|AGENTS\.md|claude code|codex|mcp server|workflow|playbook)\b/i

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

/** Which tier does this host belong to, among the enabled ones? null = none / not allowed. */
export function tierOf(url: string, enabled: Tier[]): Tier | null {
  const host = hostOf(url)
  if (!host || hostMatches(host, JUNK_HOSTS)) return null
  for (const t of TIERS) {
    if (!enabled.includes(t.id)) continue
    if (hostMatches(host, t.hosts)) return t.id
  }
  return null
}

/** Keep only hits whose host is in an enabled tier (blogs tier also needs a skill signal). */
export function filterBySources(results: SearchResult[], enabled: Tier[]): { result: SearchResult; tier: Tier }[] {
  const out: { result: SearchResult; tier: Tier }[] = []
  const blogsOn = enabled.includes('blogs')
  for (const r of results) {
    const host = hostOf(r.url)
    if (!host || hostMatches(host, JUNK_HOSTS)) continue
    const tier = tierOf(r.url, enabled)
    if (tier) {
      out.push({ result: r, tier })
      continue
    }
    // blogs tier: unknown host is OK only if the text clearly describes a skill/prompt
    if (blogsOn && SKILL_SIGNALS.test(`${r.title} ${r.snippet}`)) {
      out.push({ result: r, tier: 'blogs' })
    }
  }
  return out
}
