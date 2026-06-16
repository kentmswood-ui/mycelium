import { looksLikeSkill } from '../../src/brain/relevance.js'
import type { SearchResult } from '../../src/brain/search.js'

const r = (title: string, url: string, snippet = ''): SearchResult => ({ title, url, snippet })

test('rejects app-store / mirror / product hosts', () => {
  expect(looksLikeSkill(r('Mycelium Bitcoin Wallet APK', 'https://apkpure.net/cn/mycelium-bitcoin-wallet/x'))).toBe(false)
  expect(looksLikeSkill(r('Mycelium Wallet', 'https://play.google.com/store/apps/details?id=x'))).toBe(false)
})

test('rejects an unrelated help thread with no skill signal', () => {
  expect(
    looksLikeSkill(r('我把Mycelium升级后钱包没了', 'https://www.reddit.com/r/Bitcoin/comments/xyz/')),
  ).toBe(false)
})

test('accepts code hosts even without keyword signal', () => {
  expect(looksLikeSkill(r('org/usdt-skill', 'https://github.com/org/usdt-skill'))).toBe(true)
  expect(looksLikeSkill(r('thing', 'https://skills.sh/some-skill'))).toBe(true)
})

test('accepts any host when the text clearly describes a skill/prompt', () => {
  expect(
    looksLikeSkill(r('Best Claude Code system prompt', 'https://someblog.dev/post', 'a reusable agent prompt')),
  ).toBe(true)
})

test('rejects a generic product page on an unknown host', () => {
  expect(looksLikeSkill(r('Mycelium', 'https://mycelium.com/zh/', 'the best bitcoin wallet'))).toBe(false)
})
