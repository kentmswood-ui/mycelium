# Changelog

All notable changes to Mycelium are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- Released under a custom source-available, non-commercial license. Commercial
  use and redistribution / derivative works require prior written permission.

[0.1.0]: https://github.com/kentmswood-ui/mycelium/releases/tag/v0.1.0
