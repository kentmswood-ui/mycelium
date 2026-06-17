import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveConfig } from './config.js'
import { openDb, type DB } from './ledger/db.js'
import { SynapseLedger } from './ledger/synapse.js'
import { SkillRepository } from './skills/repository.js'
import { KeywordMatcher } from './brain/matcher.js'
import { Brain } from './brain/consult.js'
import { ProposalStore } from './brain/proposals.js'
import { SearchPipeline } from './brain/pipeline.js'
import { DiscoveryStore } from './brain/discoveries.js'
import { SettingsStore } from './brain/settings.js'
import { RecurrenceLedger } from './brain/recurrence.js'
import { MisfitStore } from './brain/misfits.js'
import { EvolutionDetector } from './brain/evolution.js'
import { Pruner } from './brain/pruning.js'
import { createCockpit } from './cockpit/api.js'
import { startMcpServer } from './mcp/server.js'
import { detectTools } from './adapters/detect.js'
import { syncSkillsTo } from './adapters/sync.js'
import type { SearchResult, Extractor } from './brain/search.js'

export interface Core {
  brain: Brain
  repo: SkillRepository
  ledger: SynapseLedger
  proposals: ProposalStore
  discoveries: DiscoveryStore
  settings: SettingsStore
  recurrence: RecurrenceLedger
  misfits: MisfitStore
  pipeline: SearchPipeline
  evolution: EvolutionDetector
  pruner: Pruner
  db: DB
  /** await all in-flight async onMiss jobs (used by tests + graceful shutdown) */
  flushJobs: () => Promise<void>
  close: () => void
}

export interface BootOpts {
  root?: string
  /** injectable search for tests; defaults to the real anysearch wrapper inside SearchPipeline */
  search?: (query: string) => Promise<SearchResult[]>
  /** injectable page extractor for tests; defaults to the real anysearch extract wrapper */
  extract?: Extractor
}

export function bootCore(opts: BootOpts = {}): Core {
  const cfg = resolveConfig(opts.root)
  for (const d of [cfg.skillsDir, cfg.archiveDir, cfg.promptsDir]) mkdirSync(d, { recursive: true })
  mkdirSync(dirname(cfg.dbPath), { recursive: true })
  const db = openDb(cfg.dbPath)
  const ledger = new SynapseLedger(db)
  const repo = new SkillRepository(cfg.skillsDir)
  repo.scan()

  // Pre-existing skills are the user's own → protect them so pruning can never reclaim them.
  for (const s of repo.list()) ledger.markProtected(s.name)

  const proposals = new ProposalStore(db)
  const discoveries = new DiscoveryStore(db)
  const settings = new SettingsStore(db)
  const recurrence = new RecurrenceLedger(db)
  const misfits = new MisfitStore(db)
  const pipeline = new SearchPipeline(discoveries, settings, repo, cfg.skillsDir, proposals, {
    ...(opts.search ? { search: opts.search } : {}),
    ...(opts.extract ? { extract: opts.extract } : {}),
  })
  const evolution = new EvolutionDetector(db, proposals)
  const pruner = new Pruner(db, ledger, proposals)

  // Track async onMiss jobs so they never block consult and can be flushed.
  const jobs = new Set<Promise<unknown>>()
  const track = (p: Promise<unknown>) => {
    jobs.add(p)
    p.finally(() => jobs.delete(p))
  }

  const brain = new Brain(repo, new KeywordMatcher(), ledger, {
    onMiss: (task) => {
      track(pipeline.runForMiss(task).catch(() => ({ discovered: 0, synthesized: 0 })))
    },
    settings,
    recurrence,
    misfits,
    memoryDir: cfg.memoryDir || undefined,
    skillsDir: cfg.skillsDir,
  })

  return {
    brain,
    repo,
    ledger,
    proposals,
    discoveries,
    settings,
    recurrence,
    misfits,
    pipeline,
    evolution,
    pruner,
    db,
    flushJobs: async () => {
      await Promise.allSettled([...jobs])
    },
    close: () => db.close(),
  }
}

export async function main(): Promise<void> {
  const cfg = resolveConfig()
  const core = bootCore()
  // Static sync is for machines where each tool keeps its own skills dir. When the
  // canonical store IS already the shared one (e.g. ccswitch symlinks fan it out),
  // set MYCELIUM_NO_SYNC=1 to skip it and avoid clobbering existing links.
  if (!process.env.MYCELIUM_NO_SYNC) {
    for (const tool of detectTools()) {
      try {
        syncSkillsTo(cfg.skillsDir, tool.skillsDir)
      } catch (e) {
        console.error(`sync ${tool.id} failed`, e)
      }
    }
  }
  // Periodic background maintenance: evolution + pruning scans file proposals for review.
  core.evolution.scan()
  core.pruner.scan()

  // Cockpit is best-effort: each tool spawns its own Mycelium process, so the port may
  // already be taken by a sibling instance. A bind failure must NOT kill the MCP brain.
  const app = createCockpit(core.repo, core.ledger, {
    proposals: core.proposals,
    discoveries: core.discoveries,
    settings: core.settings,
    skillsDir: cfg.skillsDir,
    archiveDir: cfg.archiveDir,
    ledger: core.ledger,
    feedbackLedger: core.ledger,
    isProtected: (name) => core.ledger.isProtected(name),
    registerSkill: (req) => core.brain.registerSkill(req),
  })
  const server = app.listen(cfg.cockpitPort, cfg.bindAddr, () =>
    console.error(`cockpit on http://${cfg.bindAddr}:${cfg.cockpitPort}`),
  )
  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`cockpit port ${cfg.cockpitPort} in use (another Mycelium instance) — skipping cockpit`)
    } else {
      console.error('cockpit error', e)
    }
  })

  await startMcpServer(core.brain)
}

// run only when invoked directly
import { fileURLToPath } from 'node:url'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
