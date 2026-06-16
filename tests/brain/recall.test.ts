import { recallFromMemory } from '../../src/brain/recall.js'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function memdir() {
  const dir = mkdtempSync(join(tmpdir(), 'myc-recall-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('returns empty when memory dir is missing', () => {
  expect(recallFromMemory('anything', '/no/such/dir')).toEqual([])
})

test('finds a note whose content overlaps the task', () => {
  const { dir, cleanup } = memdir()
  writeFileSync(join(dir, 'youtube.md'), '# Youtube automation\nNotes on automatic youtube video production pipeline.')
  writeFileSync(join(dir, 'taxes.md'), '# Taxes\nUnrelated note about quarterly tax filing.')
  const hits = recallFromMemory('全自动制作 youtube 视频 automation pipeline', dir)
  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0].title).toBe('Youtube automation')
  cleanup()
})

test('ignores notes below the overlap floor', () => {
  const { dir, cleanup } = memdir()
  writeFileSync(join(dir, 'taxes.md'), '# Taxes\nquarterly tax filing deadlines.')
  const hits = recallFromMemory('kubernetes blue green deployment strategy', dir)
  expect(hits).toEqual([])
  cleanup()
})

test('scans nested subdirectories', () => {
  const { dir, cleanup } = memdir()
  mkdirSync(join(dir, 'topics'))
  writeFileSync(join(dir, 'topics', 'deploy.md'), '# Deploy\nblue green deployment kubernetes rollout strategy notes.')
  const hits = recallFromMemory('kubernetes blue green deployment strategy', dir)
  expect(hits.length).toBeGreaterThan(0)
  cleanup()
})

test('uses filename as title when no heading present', () => {
  const { dir, cleanup } = memdir()
  writeFileSync(join(dir, 'note.md'), 'plain youtube video automation content no heading here')
  const hits = recallFromMemory('youtube video automation', dir)
  expect(hits[0].title).toBe('note.md')
  cleanup()
})

test('IDF weighting: a task sharing only common CJK bigrams does NOT falsely recall', () => {
  const { dir, cleanup } = memdir()
  // many notes that all contain the common bigrams 一个 / 处理, but none about Rust/MIDI/固件
  for (let i = 0; i < 6; i++) {
    writeFileSync(join(dir, `note${i}.md`), `# 笔记${i}\n这是一个关于支付和数据库的处理笔记，记录一个流程的处理细节。`)
  }
  const hits = recallFromMemory('用 Rust 写一个 MIDI 固件的中断处理', dir)
  // the only overlap is generic bigrams (一个/处理) shared by every note → IDF ~0 → below floor
  expect(hits).toEqual([])
  cleanup()
})

test('IDF weighting: a distinctive shared token still recalls', () => {
  const { dir, cleanup } = memdir()
  for (let i = 0; i < 6; i++) {
    writeFileSync(join(dir, `noise${i}.md`), `# 噪声${i}\n这是一个普通的处理笔记，记录一个流程。`)
  }
  writeFileSync(join(dir, 'stockkit.md'), '# StockKit billing\nStockKit 的支付接入与订阅处理细节。')
  const hits = recallFromMemory('StockKit 的支付接入是怎么做的', dir)
  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0].title).toBe('StockKit billing')
  cleanup()
})
