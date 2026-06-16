# Contributing to Mycelium

Thanks for your interest. Contributions are welcome, with a few terms specific to this
project's license.

## License of contributions

Mycelium is released under the **GNU AGPL-3.0-or-later** (see [LICENSE](LICENSE)).
By submitting a contribution (pull request, patch, etc.) you agree that:

- Your contribution is licensed to the project under the AGPL-3.0-or-later.
- You grant the project maintainer a perpetual, irrevocable right to **also license
  your contribution under other terms** — including granting commercial licenses to
  third parties. This is what lets the project offer a commercial (non-AGPL) option
  while staying open source. If you are not comfortable with this, say so in your PR.

You're free to fork under the AGPL. If you run a modified version as a network
service, AGPL requires you to offer its source to that service's users.

## Before you start

- For anything non-trivial, **open an issue first** to discuss the approach. It saves
  everyone time and avoids work that won't be merged.
- Keep changes focused. One concern per PR.

## Development setup

```bash
pnpm install
pnpm dev            # run from source (tsx, no build)
pnpm test           # vitest
npx tsc --noEmit    # typecheck
pnpm build          # full build
```

## Code standards

- **TypeScript, strict.** `npx tsc --noEmit` must pass.
- **Tests for behavior changes.** New features and bug fixes need tests; the suite must
  stay green (`pnpm test`).
- **Match the surrounding style** — comment density, naming, structure. Read nearby code
  before adding new code.
- **No new dependencies** without discussion in the issue first.
- **Keep the brain local and free.** The `consult` hot path must never call an LLM or
  block on network I/O.

## Bilingual / i18n

- New cockpit UI strings need both `zh` and `en` entries in the i18n dictionary.
- If you touch matching, recall, or skill registration, verify the **Chinese-task path**
  works (a Chinese task should still match / recall / register correctly), not just
  English.

## Commit & PR

- Clear, present-tense commit messages.
- PR description: what changed, why, and what you tested.
- Link the issue it resolves.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, and your environment
(OS, Node version, which tool was calling Mycelium). Logs from the cockpit or the MCP
server help a lot.
