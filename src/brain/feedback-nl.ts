export interface ParsedFeedback {
  outcome: 'ok' | 'fail' | null
  note: string
}

// Negative is checked FIRST on purpose: Chinese 不好用 contains the positive
// substring 好用, and English "doesn't work" contains "work". Checking negative
// first makes both resolve to 'fail' correctly.
const NEGATIVE: RegExp[] = [
  /不好用|没用|没什么用|出错|报错|不行|失败|难用|垃圾|太差|很差|烂|崩|卡/,
  /\bbroken\b|\buseless\b|\bn't\s+work|\bnot\s+work|\bdoesn'?t\s+work|\bfail|\bbuggy\b|\bterrible\b|\bbad\b|\bwrong\b|\bslow\b|\bcrap\b|\bsucks?\b/i,
]
const POSITIVE: RegExp[] = [
  /好用|很神|神器|不错|太好|完美|给力|有用|很棒|挺棒|靠谱|高效/,
  /\bworks?\b|\bworked\b|\bgreat\b|\buseful\b|\bgood\b|\bnice\b|\bexcellent\b|\bperfect\b|\bhelpful\b|\blove\b|\bawesome\b/i,
]

export function parseFeedback(text: string): ParsedFeedback {
  const note = text.trim()
  if (NEGATIVE.some((re) => re.test(note))) return { outcome: 'fail', note }
  if (POSITIVE.some((re) => re.test(note))) return { outcome: 'ok', note }
  return { outcome: null, note }
}
