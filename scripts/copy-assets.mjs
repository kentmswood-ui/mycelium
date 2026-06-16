// Cross-platform post-build asset copy (no shell builtins — works on Windows cmd too).
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const assets = [
  ['src/ledger/schema.sql', 'dist/ledger/schema.sql'],
  ['src/cockpit/public/index.html', 'dist/cockpit/public/index.html'],
]

for (const [from, to] of assets) {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  console.log(`copied ${from} -> ${to}`)
}
