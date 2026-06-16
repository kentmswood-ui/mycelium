import { tierOf, filterBySources, ALL_TIERS, type Tier } from '../../src/brain/sources.js'
import type { SearchResult } from '../../src/brain/search.js'

const r = (url: string, title = '', snippet = ''): SearchResult => ({ title, url, snippet })

test('tierOf maps hosts to their tier when enabled', () => {
  expect(tierOf('https://github.com/x/y', ALL_TIERS)).toBe('code')
  expect(tierOf('https://docs.anthropic.com/x', ALL_TIERS)).toBe('docs')
  expect(tierOf('https://www.reddit.com/r/x', ALL_TIERS)).toBe('community')
})

test('tierOf returns null when the tier is disabled', () => {
  const onlyDocs: Tier[] = ['docs']
  expect(tierOf('https://github.com/x/y', onlyDocs)).toBeNull()
})

test('tierOf blocks junk hosts even with all tiers on', () => {
  expect(tierOf('https://apkpure.net/x', ALL_TIERS)).toBeNull()
  expect(tierOf('https://play.google.com/store/apps/x', ALL_TIERS)).toBeNull()
})

test('filterBySources keeps only enabled-tier hits', () => {
  const hits = [
    r('https://github.com/org/skill'),
    r('https://apkpure.net/wallet'),
    r('https://www.reddit.com/r/Bitcoin/comments/x'),
  ]
  const kept = filterBySources(hits, ['code'])
  expect(kept).toHaveLength(1)
  expect(kept[0].tier).toBe('code')
  expect(kept[0].result.url).toContain('github.com')
})

test('blogs tier admits unknown host only with a skill signal', () => {
  const withSignal = r('https://someblog.dev/post', 'Best Claude Code system prompt', 'a reusable agent prompt')
  const without = r('https://someblog.dev/recipe', 'pancakes', 'how to make breakfast')
  expect(filterBySources([withSignal], ['blogs'])).toHaveLength(1)
  expect(filterBySources([without], ['blogs'])).toHaveLength(0)
})

test('blogs tier disabled means unknown hosts are dropped', () => {
  const withSignal = r('https://someblog.dev/post', 'claude skill', 'agent prompt')
  expect(filterBySources([withSignal], ['code', 'docs', 'community'])).toHaveLength(0)
})
