import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseSkill, type Skill } from './skill.js'

export class SkillRepository {
  private skills = new Map<string, Skill>()

  constructor(private skillsDir: string) {}

  scan(): void {
    this.skills.clear()
    if (!existsSync(this.skillsDir)) return
    for (const entry of readdirSync(this.skillsDir)) {
      if (entry.startsWith('.')) continue
      const dir = join(this.skillsDir, entry)
      if (!statSync(dir).isDirectory()) continue
      const s = parseSkill(dir)
      if (s) this.skills.set(s.name, s)
    }
  }

  list(): Skill[] {
    return [...this.skills.values()]
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name)
  }
}
