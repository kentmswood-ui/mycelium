import { anysearchSearch, anysearchExtract, type SearchResult, type Extractor } from './search.js'
import { scoreTrust } from './trust.js'
import { buildSearchQuery } from './query.js'
import { filterBySources, DEFAULT_TIERS, type Tier } from './sources.js'
import type { DiscoveryStore } from './discoveries.js'
import type { SettingsStore } from './settings.js'
import type { ProposalStore } from './proposals.js'
import type { SkillRepository } from '../skills/repository.js'

/** Only candidates at/above this trust are considered "ready-made" enough to propose installing. */
const INSTALL_TRUST_FLOOR = 0.6
/** Cap how many pages we extract per miss (cost/latency control). */
const MAX_PROBE = 3

export interface PipelineDeps {
  /** Injectable search; defaults to the real anysearch CLI wrapper. */
  search?: (query: string) => Promise<SearchResult[]>
  /** Injectable page extractor; defaults to anysearch extract. */
  extract?: Extractor
}

export interface MissResult {
  /** kept hits logged to discoveries */
  discovered: number
  /** install proposals filed for the user to approve */
  proposed: number
  skill?: string
}

/** Detect a real SKILL.md inside extracted page content (frontmatter with name + description). */
function extractSkillMd(content: string): string | null {
  // a fenced or raw frontmatter block carrying name:/description:
  const m = content.match(/(^|\n)(---\s*\n[\s\S]*?\bname:\s*.+[\s\S]*?\n---)/)
  if (m && /description:/.test(m[2])) return m[2].trim()
  return null
}

/**
 * Runs on a consult miss (async, never blocks the agent). Searches curated sources, logs every
 * hit to the read-only discoveries table, and — for the best high-trust READY-MADE hit — files
 * ONE 'install' proposal for the user to approve. It never silently synthesizes a skill: building
 * from scratch is the interactive, agent-driven path (consult → 'build' → register_skill).
 */
export class SearchPipeline {
  private search: (query: string) => Promise<SearchResult[]>
  private extract: Extractor

  constructor(
    private discoveries: DiscoveryStore,
    private settings: SettingsStore,
    private repo: SkillRepository,
    private skillsDir: string,
    private proposals: ProposalStore,
    deps: PipelineDeps = {},
  ) {
    this.search = deps.search ?? ((q) => anysearchSearch(q, { maxResults: 5 }))
    this.extract = deps.extract ?? ((url) => anysearchExtract(url))
  }

  private enabledTiers(): Tier[] {
    return this.settings.get<Tier[]>('source_tiers', DEFAULT_TIERS)
  }

  async runForMiss(task: string): Promise<MissResult> {
    // strip our own names so we don't search for the same-named brand/project.
    const query = buildSearchQuery(task)
    if (!query) return { discovered: 0, proposed: 0 }

    let results: SearchResult[]
    try {
      results = await this.search(query)
    } catch {
      return { discovered: 0, proposed: 0 } // search failures are silent per spec §8
    }

    const kept = filterBySources(results, this.enabledTiers())
    if (kept.length === 0) return { discovered: 0, proposed: 0 }

    // Rank kept hits by trust; log them all to the discovery log.
    const ranked = kept
      .map(({ result, tier }) => ({ result, tier, trust: scoreTrust(result).trust }))
      .sort((a, b) => b.trust - a.trust)

    for (const r of ranked) {
      this.discoveries.record({
        task,
        title: r.result.title,
        url: r.result.url,
        source: hostOf(r.result.url),
        tier: r.tier,
        trust: r.trust,
        disposition: 'logged',
      })
    }

    // Probe the top high-trust hits for a real, ready-made SKILL.md → propose installing it.
    for (const r of ranked.slice(0, MAX_PROBE)) {
      if (r.trust < INSTALL_TRUST_FLOOR) break
      let content = ''
      try {
        content = await this.extract(r.result.url)
      } catch {
        content = ''
      }
      const skillMd = extractSkillMd(content)
      if (!skillMd) continue
      const name = nameOf(skillMd)
      // skip if we already have it
      if (this.repo.list().some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        this.discoveries.record({
          task,
          title: r.result.title,
          url: r.result.url,
          source: hostOf(r.result.url),
          tier: r.tier,
          trust: r.trust,
          disposition: 'duplicate',
          detail: `already have skill "${name}"`,
        })
        continue
      }
      this.proposals.create({
        kind: 'install',
        title: `Install: ${name}`,
        task,
        source: hostOf(r.result.url),
        sourceUrl: r.result.url,
        trust: r.trust,
        payload: { skillMd, url: r.result.url },
      })
      this.discoveries.record({
        task,
        title: r.result.title,
        url: r.result.url,
        source: hostOf(r.result.url),
        tier: r.tier,
        trust: r.trust,
        disposition: 'proposed-install',
        detail: `→ install proposal for "${name}"`,
      })
      return { discovered: ranked.length, proposed: 1, skill: name }
    }

    return { discovered: ranked.length, proposed: 0 }
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

function nameOf(md: string): string {
  const m = md.match(/^name:\s*(.+)$/m)
  return m ? m[1].trim() : 'skill'
}
