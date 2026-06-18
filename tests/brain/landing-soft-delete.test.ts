import { join } from 'node:path'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('node:fs')
  vi.resetModules()
})

test('softDeleteSkill falls back to copy/remove when rename fails', async () => {
  const mkdirSync = vi.fn()
  const renameSync = vi.fn(() => {
    throw new Error('cross-device link')
  })
  const cpSync = vi.fn()
  const rmSync = vi.fn()
  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    return {
      ...actual,
      existsSync: () => true,
      mkdirSync,
      renameSync,
      cpSync,
      rmSync,
    }
  })

  const { softDeleteSkill } = await import('../../src/brain/landing.js')
  const archived: string[] = []
  softDeleteSkill('old-skill', {
    skillsDir: 'C:\\skills',
    archiveDir: 'C:\\archive',
    ledger: { archive: (name) => archived.push(name) },
  })

  expect(mkdirSync).toHaveBeenCalledWith('C:\\archive', { recursive: true })
  expect(renameSync).toHaveBeenCalledWith(
    join('C:\\skills', 'old-skill'),
    join('C:\\archive', 'old-skill'),
  )
  expect(cpSync).toHaveBeenCalledWith(join('C:\\skills', 'old-skill'), join('C:\\archive', 'old-skill'), {
    recursive: true,
  })
  expect(rmSync).toHaveBeenCalledWith(join('C:\\skills', 'old-skill'), { recursive: true, force: true })
  expect(archived).toEqual(['old-skill'])
})
