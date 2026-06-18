import matter from 'gray-matter'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

interface SkillSnapshot {
  name: string
  description: string
  keywords: string[]
}

const sourceRoot = process.env.CCSWITCH_SKILLS_DIR ?? join(homedir(), '.cc-switch', 'skills')
const outPath = join(process.cwd(), 'tests', 'fixtures', 'real-skills.snapshot.json')

function readSkill(dir: string): SkillSnapshot | null {
  const md = join(dir, 'SKILL.md')
  if (!existsSync(md)) return null
  const data = matter(readFileSync(md, 'utf8')).data as {
    name?: unknown
    description?: unknown
    keywords?: unknown
  }
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  const keywords = Array.isArray(data.keywords) ? data.keywords.map(String).sort() : []
  if (!name || !description) return null
  return { name, description, keywords }
}

const snapshots = readdirSync(sourceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readSkill(join(sourceRoot, entry.name)))
  .filter((skill) => skill !== null)
  .sort((a, b) => a.name.localeCompare(b.name))

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(snapshots, null, 2)}\n`, 'utf8')
console.log(`snapshotted ${snapshots.length} skills from ${sourceRoot}`)
