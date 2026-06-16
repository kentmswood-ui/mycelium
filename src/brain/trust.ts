import type { SearchResult } from './search.js'

export interface TrustVerdict {
  trust: number // 0..1
  risk: string // human-readable risk summary; '' when clean
}

const REPUTABLE_HOSTS = ['github.com', 'skills.sh', 'skills.rest', 'gitlab.com', 'raw.githubusercontent.com']

// patterns that suggest a skill would do something dangerous if adopted/run
const RISK_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /curl\s+\S+\s*\|\s*(ba)?sh/i, label: 'curl|bash' },
  { re: /\brm\s+-rf\b/i, label: 'rm -rf' },
  { re: /\b(token|api[_-]?key|secret|password)\b/i, label: 'credential-handling' },
  { re: /\bexfiltrat/i, label: 'exfiltration' },
  { re: /\beval\s*\(/i, label: 'eval' },
  { re: /base64\s+-d|atob\(/i, label: 'base64-decode' },
]

export function scoreTrust(r: SearchResult): TrustVerdict {
  let trust = 0.2 // unknown baseline
  let host = ''
  try {
    host = new URL(r.url).hostname.toLowerCase()
  } catch {
    host = ''
  }
  if (REPUTABLE_HOSTS.some((h) => host === h || host.endsWith('.' + h))) trust += 0.4
  if (host === 'github.com' || host.endsWith('.github.com')) trust += 0.1
  if (/\b(mit|apache|bsd|isc|gpl)\b/i.test(r.snippet)) trust += 0.1 // explicit license

  const flags: string[] = []
  const hay = `${r.url} ${r.snippet}`
  for (const p of RISK_PATTERNS) if (p.re.test(hay)) flags.push(p.label)
  if (flags.length) trust -= 0.25 * flags.length

  trust = Math.max(0, Math.min(1, trust))
  return { trust, risk: flags.join(', ') }
}
