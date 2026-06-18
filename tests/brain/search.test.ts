import { parseAnysearchMarkdown, anysearchSearch } from '../../src/brain/search.js'

const SAMPLE = `## Search Results (3 results, 1450ms)

### 1. yan253319066/XPayLabs
- **URL**: https://github.com/yan253319066/XPayLabs
- Self-hosted crypto payment gateway supporting TRON (TRC20). Accept USDT.

### 2. erc20-payment · GitHub Topics
- **URL**: https://github.com/topics/erc20-payment
- It allows your projects to accept payments in a secure manner.

### 3. s4ndxyz/epusdt
- **URL**: https://github.com/s4ndxyz/epusdt
- Open source usdt payment gateway built with Go.
`

test('parseAnysearchMarkdown extracts title/url/snippet per result', () => {
  const r = parseAnysearchMarkdown(SAMPLE)
  expect(r).toHaveLength(3)
  expect(r[0].title).toBe('yan253319066/XPayLabs')
  expect(r[0].url).toBe('https://github.com/yan253319066/XPayLabs')
  expect(r[0].snippet).toMatch(/TRC20/)
  expect(r[2].url).toBe('https://github.com/s4ndxyz/epusdt')
})

test('parseAnysearchMarkdown keeps titled results without URLs and joins bullet snippets', () => {
  const r = parseAnysearchMarkdown(`## Search Results

### 1. No URL Result
- first sentence
- second sentence

### 2. Useful Result
- **URL**: https://example.test/useful
- third sentence
plain paragraph ignored
`)

  expect(r).toEqual([
    {
      title: 'No URL Result',
      url: '',
      snippet: 'first sentence second sentence',
    },
    {
      title: 'Useful Result',
      url: 'https://example.test/useful',
      snippet: 'third sentence',
    },
  ])
})

test('parseAnysearchMarkdown returns [] on empty / non-result text', () => {
  expect(parseAnysearchMarkdown('')).toEqual([])
  expect(parseAnysearchMarkdown('no results here')).toEqual([])
})

test('anysearchSearch degrades to [] when the runner throws', async () => {
  const res = await anysearchSearch('anything', {
    runner: () => {
      throw new Error('network down')
    },
  })
  expect(res).toEqual([])
})

test('anysearchSearch parses runner output when it succeeds', async () => {
  const res = await anysearchSearch('q', { runner: () => SAMPLE })
  expect(res.map((x) => x.url)).toContain('https://github.com/s4ndxyz/epusdt')
})

test('anysearchSearch passes the requested max result count to injected runners', async () => {
  const seen: Array<[string, number]> = []
  const res = await anysearchSearch('billing crypto', {
    maxResults: 2,
    runner: async (query, maxResults) => {
      seen.push([query, maxResults])
      return SAMPLE
    },
  })

  expect(seen).toEqual([['billing crypto', 2]])
  expect(res).toHaveLength(3)
})
