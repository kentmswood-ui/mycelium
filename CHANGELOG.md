# Changelog

All notable changes to Mycelium are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-20

The "knows what's out there" release: an ecosystem catalog, semantic security
tiering, and self-correction — plus precision and bilingual fixes from real use.

### Added

- **Ecosystem catalog** — a knowledge map of ~19k skills crawled from
  anthropics/skills, antigravity-awesome-skills, skills.sh, and skillsmp via the
  `catalog_ingest` tool. Kept in a table separate from installed skills so the
  matcher's precision is never diluted.
- **`install` verdict** — on a local miss, `consult` checks the catalog FIRST
  (free, local) and offers a ready-made skill to install before any web research.
  A catalog hit short-circuits the expensive crawl, making it a rare last resort.
- **Semantic security audit** — `catalog_assess` tool: an agent reads each
  SKILL.md body and reports evidence (performs / detects / discusses + capability
  labels); Mycelium owns the green/yellow/red verdict. A real dangerous payload
  (reverse shell, exfil, path traversal) is red even when the skill claims to only
  "teach" the attack — and red skills are never auto-suggested.
- **Self-correction (loop tier 1)** — a new `reject` feedback outcome lets the
  agent flag an off-topic reuse instantly; the brain records a skill×task-shape
  misfit and suppresses it next time, with decay (30d) + reversal (a later `ok`)
  so a wrong mark can't drift.
- **loop-goal** skill registered for routing run-until-done tasks.
- **Cockpit**: catalog stats, usage/token-estimate panel, Chinese-alias editor,
  primary-language picker, ledger maintenance.

### Changed

- **Matcher precision** — stopword filtering + IDF weighting + a distinctive-token
  gate, so an out-of-domain task (e.g. a medical question) no longer false-matches
  a dev skill on incidental filler-word overlap.
- **Bilingual matching** — CJK-aware tokenizer (Han bigrams) + curated English
  keyword index + per-skill Chinese aliases, so Chinese tasks reliably hit the
  right English skill and a self-built skill is findable by the task that made it.
- Portable path resolution so a fresh clone runs anywhere.

### Fixed

- Recall over-matched on common CJK bigrams (IDF-weighted now).
- Meta-query / availability-check phrasing no longer triggers a search.
- Restored a lost `openDb()` declaration and a credential-exfil severity mismatch
  surfaced during the catalog work.

## [0.1.0] - 2026-06-16

First public release.

### Added

- **Four-step consult cascade** — local skill reuse → memory recall → curated
  research → interactive build. All five verdicts (`reuse` / `recall` /
  `searching` / `build` / `pass`) returned over MCP.
- **Cross-tool, cross-model shared brain** — one SQLite ledger; every consult,
  usage, and feedback write is attributed to its tool and model.
- **Bilingual matching** — CJK-aware tokenizer (Han bigrams) plus a built-in
  Chinese alias layer, so Chinese tasks reliably match English skills.
- **Online research pipeline** — searches curated source tiers via the
  `anysearch` CLI, logs hits to a read-only discoveries table with trust
  scores, and files an `install` proposal for a high-trust ready-made skill.
- **Interactive skill building** — `register_skill` with a cross-model
  contract (name/description/body/purpose validation) and language-aware
  keyword enforcement so a self-built skill is findable by the task that
  prompted it.
- **Feedback loop** — skill strength rises on use and success, falls on
  failure; unused low-strength skills become prune candidates.
- **Cockpit dashboard** (`http://127.0.0.1:7077`) — usage stats with a tunable
  token estimate, skill management (view / add / archive), data-source tiers,
  trigger settings, Chinese alias editor, ledger maintenance, and a primary
  language picker. Switchable 中文 / English.
- **Portable install** — paths resolve from the package location (or
  `MYCELIUM_ROOT`), so a fresh clone runs anywhere.
- **Docs** — README (bilingual), INSTALL, ARCHITECTURE, CONTRIBUTING, SECURITY.

### Notes

- Released under the **GNU AGPL-3.0-or-later**. Free to use, study, modify, and
  self-host; a network service running a modified version must offer its source to
  users. A separate commercial license is available from the copyright holder for
  closed-source use.

[0.2.0]: https://github.com/kentmswood-ui/mycelium/releases/tag/v0.2.0
[0.1.0]: https://github.com/kentmswood-ui/mycelium/releases/tag/v0.1.0
