import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

function collectTestFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return collectTestFiles(fullPath)
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [fullPath] : []
  })
}

function extractTestBodies(source: string): string[] {
  const bodies: string[] = []
  const callPattern = /\b(?:test|it)\s*\(/g
  let match: RegExpExecArray | null

  while ((match = callPattern.exec(source)) !== null) {
    const arrowIndex = source.indexOf('=>', match.index)
    if (arrowIndex === -1) continue

    const openBrace = source.indexOf('{', arrowIndex)
    if (openBrace === -1) continue

    let depth = 0
    for (let index = openBrace; index < source.length; index += 1) {
      const char = source[index]
      if (char === '{') depth += 1
      if (char === '}') depth -= 1
      if (depth === 0) {
        bodies.push(source.slice(openBrace, index + 1))
        callPattern.lastIndex = index
        break
      }
    }
  }

  return bodies
}

test('test and it blocks contain at least one assertion', () => {
  const testRoot = join(process.cwd(), 'tests')
  const offenders = collectTestFiles(testRoot).flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return extractTestBodies(source).some((body) => !body.includes('expect('))
      ? [relative(process.cwd(), file)]
      : []
  })

  expect(offenders).toEqual([])
})
