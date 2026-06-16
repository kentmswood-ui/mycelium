# Security Policy

## Reporting a vulnerability

If you find a security issue, **please do not open a public issue.** Instead, report it
privately to the maintainer (`kentmswood-ui` on GitHub) via a GitHub security advisory or
direct contact. Include steps to reproduce and the potential impact. You'll get an
acknowledgement, and a fix or mitigation will be prioritized.

## Security model

Mycelium is **local-first by design**:

- The brain (`consult`, matching, recall, the SQLite ledger) runs entirely on your
  machine. It does **not** send your code, prompts, or notes to any external service.
- The cockpit binds to **`127.0.0.1` only** (loopback). It is not exposed to your network
  and has no authentication because it is not meant to be reachable from other hosts. Do
  **not** put it behind a public reverse proxy without adding your own auth.
- The only outbound network calls happen on the **research path** (`searching`), which
  shells out to the `anysearch` CLI to query curated sources. This runs **only** when a
  task misses locally and the daily quota allows it. Disable it by setting the daily
  quota to `0` in the cockpit, or by restricting/disabling source tiers.

## Trust boundaries

- **Skill content is untrusted data.** `SKILL.md` files and search results may come from
  third parties. Mycelium treats them as data, validates a contract on registration, and
  never executes them — but **you** should review any skill before relying on it.
- **Install proposals require explicit approval.** Mycelium never auto-installs a
  ready-made skill found online; it files a proposal you approve in the cockpit.
- **Archiving a shared skill** (one in a store shared with another tool, e.g. cc-switch)
  requires explicit confirmation, because it moves the file out of the shared store.

## Dependencies

Dependencies are pinned in `package.json`. Run `pnpm audit` (or `npm audit`) periodically.
Report any dependency-related concern through the private channel above.
