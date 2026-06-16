# Architecture

How Mycelium is built, for contributors and the curious.

## Overview

Mycelium is a single Node process that exposes two faces:

1. **An MCP server** (stdio) — the `consult` / `feedback` / `register_skill` tools your
   AI tools call.
2. **A cockpit** — a local Express web app on `127.0.0.1:7077` for humans.

Both share one core: a `SkillRepository` (skills on disk) + a `SynapseLedger`
(usage/feedback/scoring in SQLite). The brain itself is **local and synchronous** —
`consult` never calls an LLM, so it's effectively free and instant.

```
                    ┌──────────────────────────────┐
   MCP tools ──────▶│  MCP server (stdio)           │
  (Claude/Codex)    │   consult / feedback / register│
                    └──────────────┬────────────────┘
                                   │
                    ┌──────────────▼────────────────┐
                    │  Brain (cascade)               │
                    │  repo + matcher + ledger       │
                    └──────────────┬────────────────┘
                                   │
   human ──▶ Cockpit (7077) ──────▶│  SQLite ledger + skills/*.SKILL.md
```

## The cascade (`src/brain/consult.ts`)

`consult(task, tool, model?)` runs these gates in order and returns the first verdict:

1. **Recursion guard** — if `MYCELIUM_SUBPROCESS=1` (a child LLM spawned by the build
   path), return `pass` to prevent a fork bomb.
2. **Length / trivial / meta gates** — language-agnostic token count, then `isMetaQuery`
   (smoke-checks like "is it working?" never trigger work).
3. **Trigger gate** — honors the user's trigger mode (explicit / session / keyword).
4. **Step 1a — reuse**: `KeywordMatcher` scores the task against local skills (with the
   bilingual alias layer folded in). A hit returns `reuse`.
5. **Step 1b — recall**: `recallFromMemory` scans your notes dir with IDF-weighted
   overlap. A hit returns `recall`.
6. **Local miss**: records recurrence, charges the daily quota, fires async research
   (`onMiss` → `SearchPipeline`). If the task-shape has recurred past the threshold,
   returns `build` once; otherwise `searching`.

Every verdict is logged to `consult_log` for the cockpit usage panel.

## Bilingual matching

The skills are English; users often work in Chinese. Two mechanisms bridge the gap:

- **CJK-aware tokenizer** (`src/skills/skill.ts`) — Latin runs become whole words; Han
  runs become overlapping bigrams (`失败测试` → `失败, 败测, 测试`).
- **Alias layer** (`src/brain/aliases.ts`) — bundled Chinese aliases for the common
  skills, folded into each skill's tokens at match time. Users add overrides in the
  cockpit; self-built skills carry their own `keywords` (enforced when primary language
  is CJK, so a skill built for a Chinese task is findable by that same task).

## The research pipeline (`src/brain/pipeline.ts`)

On a miss, `runForMiss` (async, non-blocking):

1. Strips self-names from the query, searches curated sources via the `anysearch` CLI.
2. Filters hits by enabled **source tiers** (code / docs / community / blogs).
3. Logs every kept hit to the read-only `discoveries` table with a trust score.
4. Probes the top high-trust hits (≥ 0.6) for a real `SKILL.md`; if found and not a
   duplicate, files **one `install` proposal** for the user to approve.

It never silently synthesizes a skill — building from scratch is the interactive,
agent-driven `build` path that ends in `register_skill`.

## The ledger (`src/ledger/`)

SQLite with WAL mode (tolerates each tool spawning its own process). Tables: `skills`,
`usage_log`, `feedback`, `consult_log`, `discoveries`, `proposals`, `misses`,
`quota_log`, `settings`. Schema is idempotent DDL + a small `migrateDb` for column
additions. Skill *strength* is bumped on use (+0.1), success feedback (+0.15), and
docked on failure (−0.25), clamped to [0,1].

## Cross-model contract

Every write records which tool/model made it. `register_skill` validates a contract
(kebab name, non-empty description, real body, sane purpose length) so a weaker model
can't deposit garbage into the shared base. Scores are model-agnostic and clamped —
that's the stable boundary that keeps the brain consistent across tools.

## Project layout

```
src/
  brain/        cascade, matcher, recall, pipeline, aliases, prefs, proposals…
  ledger/       SQLite schema + SynapseLedger
  skills/       SkillRepository + SKILL.md parsing/tokenizing
  mcep/         request/response schemas (zod)
  mcp/          MCP server wiring
  cockpit/      Express API + public/ web UI
  adapters/     tool detection + skill sync
  config.ts     portable path resolution
  index.ts      boot: core + cockpit + MCP server
tests/          vitest suites mirroring src/
docs/           INSTALL, ARCHITECTURE
```

## Tests

`pnpm test` runs the vitest suites (159 at time of writing). They cover the cascade,
matcher, tokenizer, recall, pipeline, contract validation, cockpit endpoints, and the
ledger. Run `npx tsc --noEmit` for a typecheck.
