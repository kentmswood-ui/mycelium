# Installing Mycelium into your tools

Mycelium writes **nothing** to your tools' configs automatically. Apply these snippets
by hand after reviewing them — editing tool configs is a medium-risk action you should see first.

## Build first

```bash
git clone https://github.com/kentmswood-ui/mycelium.git
cd mycelium
pnpm install        # or npm install
pnpm build          # emits dist/index.js (+ schema.sql, cockpit/public)
```

Note the **absolute path** to `dist/index.js` — you'll paste it into each tool below.
On this machine that's `<clone-dir>/dist/index.js`.

> **Windows path note:** use **forward slashes** in the `args` path
> (e.g. `C:/path/to/mycelium/dist/index.js`). Backslashes get mangled by the MCP
> client's process-spawn escaping on Windows and the server fails to launch with
> `Cannot find module`. Forward slashes work everywhere.

## Environment variables (optional)

All optional — Mycelium runs with sane defaults out of the box.

| Variable | Purpose | Default |
|---|---|---|
| `MYCELIUM_ROOT` | Install root (db, archive, prompts live here) | inferred from the package location |
| `MYCELIUM_SKILLS_DIR` | Canonical skills store | `<root>/skills` |
| `MYCELIUM_MEMORY_DIR` | Your notes dir, scanned for `recall` | empty (recall off) |
| `MYCELIUM_NO_SYNC` | `1` = don't mirror skills into each tool's dir (use when the skills dir is already shared, e.g. cc-switch) | unset |

To reuse an existing shared skills store (e.g. cc-switch), point `MYCELIUM_SKILLS_DIR`
at it and set `MYCELIUM_NO_SYNC=1`.

## 1. Claude Code (MCP — live brain)

Add to `~/.claude.json` (or `~/.claude/settings.json`) under `mcpServers`:

```json
"mycelium": {
  "type": "stdio",
  "command": "node",
  "args": ["<clone-dir>/dist/index.js"],
  "env": {
    "MYCELIUM_SKILLS_DIR": "<your-skills-dir>",
    "MYCELIUM_MEMORY_DIR": "<your-notes-dir>"
  }
}
```

Then append the consult rule to `~/.claude/CLAUDE.md` — paste the block below, fenced
with `<!-- MYCELIUM:START -->` / `<!-- MYCELIUM:END -->` so it's idempotent and easy to remove.

## 2. Codex (MCP — live brain)

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.mycelium]
command = "node"
args = ["<clone-dir>/dist/index.js"]

[mcp_servers.mycelium.env]
MYCELIUM_SKILLS_DIR = "<your-skills-dir>"
MYCELIUM_MEMORY_DIR = "<your-notes-dir>"
```

Then append the same consult rule block to `~/.codex/AGENTS.md`.

## The consult rule block

Paste this into your tool's instruction file (swap `claude-code` for your tool id):

```markdown
<!-- MYCELIUM:START -->
## Mycelium
Before starting any non-trivial task, call the `consult` tool of the `mycelium` MCP
server with { task, tool: "claude-code", model: <your model id> }. Act on the verdict:
- `pass`   — proceed normally.
- `reuse`  — a local skill matched; load and follow the named skill.
- `recall` — your memory covers this; read the returned notes first.
- `searching` — no local coverage; researching in the background; proceed.
- `build`  — recurring need: ask the user, research with purpose, synthesize a
  SKILL.md, then call `register_skill` with { skillMd, purpose, tool, model,
  keywords: [trigger task's key terms IN THE USER'S LANGUAGE] }.
After using a skill, call `feedback` with { skill, tool, outcome, model }.
<!-- MYCELIUM:END -->
```

## Cockpit (web dashboard)

Once the server is running, open **http://127.0.0.1:7077**. From there you can manage
skills, see usage + token estimates, tune trigger settings and data sources, edit
Chinese aliases, and pick your primary language. Switchable 中文 / English.

## Removing Mycelium

- Delete the `mycelium` entry from each tool's MCP config.
- Delete the fenced `<!-- MYCELIUM:START -->...<!-- MYCELIUM:END -->` block from each instruction file.
- Remove the synced skills dir / junction if you no longer want the shared skills.
