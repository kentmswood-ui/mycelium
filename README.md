<div align="center">

# 🍄 Mycelium

**A resident, cross-tool skill brain for AI coding agents.**

*One shared memory across Claude Code, Codex, and every other MCP-capable tool — so your agents reuse what they already know instead of re-learning it every session.*

[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/protocol-MCP-7c5cff)](https://modelcontextprotocol.io)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-3c873a)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-159%20passing-3c873a)](#development)

</div>

---

## What is Mycelium?

Mycelium is a **local-first skill brain** that sits behind your AI coding tools. Every tool you use (Claude Code, Codex, …) spawns its own agents that keep re-discovering the same things. Mycelium gives them **one shared, persistent memory** reached over the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

Before an agent starts a task, it asks Mycelium one question — `consult` — and gets back a **verdict** that routes the work:

| Verdict | Meaning |
|---|---|
| `reuse` | A local skill already covers this — use it. |
| `recall` | Your own notes already cover this — read them first. |
| `searching` | No local match — researching curated sources in the background. |
| `build` | This need keeps recurring — build a new skill (interactively). |
| `pass` | Trivial or meta — nothing to do. |

The brain runs **entirely on your machine** (Node + SQLite). The `consult` call spends **zero LLM tokens** — it's local matching, not a model call.

## Why?

AI coding agents are stateless between sessions and siloed between tools. The result:

- The same problem gets re-researched from scratch, again and again, burning tokens.
- A skill you refined in Codex is invisible to Claude Code tomorrow.
- "Skills" pile up with no sense of which ones actually work.

Mycelium fixes this with **one shared brain** that:

- **Reuses** skills across every connected tool (a skill used in Codex is instantly available to Claude Code).
- **Recalls** your own notes/memory before spending a single token on research.
- **Researches** only curated, trustworthy sources (code hosts, official docs, communities) — never raw web noise.
- **Learns** which skills work via a feedback loop that scores each skill's strength over time.
- **Governs** quality with a cross-model contract, so a weaker model can't pollute the shared skill base.

## Features

- 🧠 **Four-step cascade** — local skills → your memory → curated research → interactive build.
- 🔗 **Cross-tool & cross-model** — shared SQLite ledger; every write is attributed to its tool/model.
- 🌐 **Bilingual matching** — Chinese tasks reliably match English skills via a built-in alias layer + CJK-aware tokenizer.
- 📊 **Cockpit dashboard** — a local web UI (`http://127.0.0.1:7077`) for usage stats, token estimates, skill management, data-source tiers, and trigger settings. Switchable 中文 / English.
- 🔒 **Local-first & private** — runs on your machine; the brain never sends your code anywhere.
- 🎯 **Token-aware** — `consult` is free (local); a tunable per-verdict estimate shows the downstream model spend each verdict tends to provoke.
- ⚙️ **Backend-configurable** — trigger mode, recurrence threshold, daily quota, data sources, primary language — all editable in the cockpit, no code edits.

## Quick start

> Requires **Node ≥ 20** and a package manager (`pnpm`, `npm`, or `yarn`).

```bash
git clone https://github.com/kentmswood-ui/mycelium.git
cd mycelium
pnpm install        # or: npm install
pnpm build          # emits dist/index.js (+ schema.sql, cockpit assets)
pnpm start          # starts the MCP server + cockpit on http://127.0.0.1:7077
```

Then wire it into your tools — see **[docs/INSTALL.md](docs/INSTALL.md)** for Claude Code, Codex, and others. Mycelium writes **nothing** to your tool configs automatically; you apply the snippets by hand after reviewing them.

## How it works (30-second version)

```
agent task ──▶ consult ──▶ ┌─ reuse  : local skill matched
                           ├─ recall : your notes cover it
                           ├─ search : research curated sources ─▶ discoveries / install proposal
                           ├─ build  : recurring gap ─▶ interactive build ─▶ register_skill
                           └─ pass   : trivial / meta
```

Skills live as `SKILL.md` files. Usage and feedback are recorded in a local SQLite ledger that scores each skill's *strength* — unused, low-strength skills can be pruned; the skills you actually rely on rise to the top.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full design.

## 中文简介

**Mycelium(菌丝网络)** 是一个常驻本地的「跨工具技能大脑」,挂在你的 AI 编程工具背后。Claude Code、Codex 等每个工具各自的 agent 总在重复发现同样的东西,Mycelium 通过 [MCP 协议](https://modelcontextprotocol.io) 给它们**一份共享、持久的记忆**。

agent 开始任务前先问一句 `consult`,拿到一个**裁决**来决定怎么做:

- **reuse** — 本地已有技能命中,直接用
- **recall** — 你自己的笔记已覆盖,先读笔记
- **searching** — 本地没有,后台去**精选数据源**研究(不是乱搜全网)
- **build** — 同类需求反复出现,**交互式**造一个新技能
- **pass** — 琐碎/自检,无需处理

大脑**完全跑在你本地**(Node + SQLite),`consult` 调用**不耗 token**(本地匹配,不调模型)。它原生支持**中文任务匹配英文技能**(内置别名层 + 中文分词)。后台面板在 `http://127.0.0.1:7077`,中英文可切换。

安装见 **[docs/INSTALL.md](docs/INSTALL.md)**,架构见 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**。

## Development

```bash
pnpm test           # 159 tests (vitest)
pnpm dev            # run from source via tsx (no build step)
npx tsc --noEmit    # typecheck
```

Contributions are welcome under the contribution terms — see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## License

Mycelium is released under the **GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later)**. See **[LICENSE](LICENSE)**.

In plain terms:

- **Free to use, study, modify, and self-host** — for anyone, including companies.
- **If you run a modified version as a network service**, AGPL requires you to make
  your modified source available to its users.
- **If you redistribute it** (modified or not), it stays under AGPL.

Want to use Mycelium in a **closed-source product or service** without the AGPL's
source-disclosure obligation? The copyright holder can grant a separate **commercial
license** — open an issue or contact the author to discuss dual licensing.

## Acknowledgements

Built on the [Model Context Protocol](https://modelcontextprotocol.io). Skill format is compatible with the `SKILL.md` convention used by tools like cc-switch.

