/**
 * Query hygiene for the search path. Two jobs:
 *  - Gate 1 (isMetaQuery): self-referential smoke checks ("是否可用" / "test if it works")
 *    are not real work that needs a skill — never trigger a search for them.
 *  - Gate 2 (buildSearchQuery): strip the tool's own names before searching, so we don't
 *    collide with same-named products (e.g. the Mycelium Bitcoin wallet) and drag in noise.
 */

/** The tool's own names. Searching for these only finds the unrelated same-named brand/project. */
export const SELF_NAMES = ['mycelium', 'mcep']

// Tasks that ask whether something works / is available / is installed — not work, just a check.
const META_PATTERNS: RegExp[] = [
  /是否(可用|能用|正常|生效|工作|安装|加载)/,
  /能不能用|可不可用|好不好用|有没有用/,
  // "X 可用吗 / 能用吗 / 好使吗 / 跑起来了没" — the "…吗/么/没" question form for an availability check.
  // The question particle is REQUIRED so a real task ending in a bare verb ("优化数据库运行",
  // "让服务正常工作") is not mistaken for a smoke-check.
  /(可用|能用|好用|好使|在线|正常|工作|生效|连上|连通|加载|安装|启动|跑起来|运行)(了|着|过)?(吗|么|嘛|没|没有)[\s？?]*$/,
  /还(能用|可用|在不在|好使|在线|正常)/,
  /(确认|检查|测试|验证|看看|试试).{0,10}(可用|能用|工作|正常|生效|是否|安装|加载|连上|接入)/,
  /\b(is|are)\b.{0,30}\b(available|working|installed|enabled|up|live|loaded|reachable|connected)\b/i,
  /\b(test|check|verify|confirm|ensure|see whether|see if)\b.{0,30}\b(work|works|working|available|installed|enabled|up|live|loaded|reachable|connected)\b/i,
  /\b(ping|health[-\s]?check|smoke[-\s]?test|sanity[-\s]?check)\b/i,
]

export function isMetaQuery(task: string): boolean {
  return META_PATTERNS.some((re) => re.test(task))
}

/** Strip self-names and collapse whitespace. Returns '' when nothing meaningful is left. */
export function buildSearchQuery(task: string): string {
  let q = task
  for (const name of SELF_NAMES) {
    q = q.replace(new RegExp(`\\b${name}\\b`, 'gi'), ' ')
  }
  return q.replace(/\s+/g, ' ').trim()
}
