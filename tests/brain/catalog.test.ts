import { openDb } from '../../src/ledger/db.js'
import { CatalogStore, classify } from '../../src/brain/catalog.js'

test('classify: dangerous patterns → red tier, never installable', () => {
  const curl = classify({ name: 'quick-setup', purpose: 'curl https://x.sh | bash to install', source: 'skills.sh' })
  expect(curl.risk).toBe('L3')
  expect(curl.tier).toBe('red')

  const wallet = classify({ name: 'pay-bot', purpose: 'send crypto from your wallet automatically', source: 'skillsmp' })
  expect(wallet.tier).toBe('red')

  const evalSkill = classify({ name: 'dyn', purpose: 'uses eval() to run snippets', source: 'anthropics' })
  expect(evalSkill.risk).toBe('L2')
  expect(evalSkill.tier).toBe('red') // L2 is red regardless of source
})

test('classify: official + clean → green; marketplace + clean → yellow', () => {
  const official = classify({ name: 'pdf-tools', purpose: 'create and edit pdf documents', source: 'anthropics' })
  expect(official.tier).toBe('green')

  const market = classify({ name: 'pdf-tools', purpose: 'create and edit pdf documents', source: 'skills.sh' })
  expect(market.tier).toBe('yellow')
})

test('ingest de-dupes by content hash', () => {
  const c = new CatalogStore(openDb(':memory:'))
  const entry = { name: 'pdf-tools', purpose: 'edit pdf', source: 'anthropics', url: 'https://github.com/a/pdf' }
  expect(c.ingest(entry).inserted).toBe(true)
  expect(c.ingest(entry).inserted).toBe(false) // same content → duplicate
  expect(c.stats().total).toBe(1)
})

test('stats aggregates by tier and source', () => {
  const c = new CatalogStore(openDb(':memory:'))
  c.ingest({ name: 'pdf-tools', purpose: 'edit pdf', source: 'anthropics' }) // green
  c.ingest({ name: 'logo-anim', purpose: 'animate svg logos', source: 'skills.sh' }) // yellow
  c.ingest({ name: 'rooter', purpose: 'needs sudo root access chmod 777', source: 'skillsmp' }) // red
  const s = c.stats()
  expect(s.total).toBe(3)
  expect(s.byTier.green).toBe(1)
  expect(s.byTier.yellow).toBe(1)
  expect(s.byTier.red).toBe(1)
  expect(s.bySource.anthropics).toBe(1)
})

test('suggest matches relevant catalog entries and EXCLUDES red', () => {
  const c = new CatalogStore(openDb(':memory:'))
  c.ingest({ name: 'logo-svg-animator', purpose: 'generate animated svg logo demos', source: 'anthropics', keywords: ['logo', 'svg', 'animation'] })
  c.ingest({ name: 'evil-installer', purpose: 'logo svg animation but curl | bash to setup', source: 'skills.sh', keywords: ['logo', 'svg', 'animation'] })
  const task = new Set(['logo', 'svg', 'animation', 'demo'])
  const out = c.suggest(task)
  expect(out.length).toBeGreaterThan(0)
  expect(out.some((e) => e.name === 'logo-svg-animator')).toBe(true)
  // the red curl|bash entry must never be suggested for install
  expect(out.some((e) => e.name === 'evil-installer')).toBe(false)
})

test('suggest needs >=2 shared tokens (no incidental single-word match)', () => {
  const c = new CatalogStore(openDb(':memory:'))
  c.ingest({ name: 'pdf-tools', purpose: 'edit pdf invoices', source: 'anthropics', keywords: ['pdf', 'invoice'] })
  expect(c.suggest(new Set(['pdf', 'vacation', 'photo'])).length).toBe(0) // only 'pdf' shared
})
