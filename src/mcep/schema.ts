import { z } from 'zod'

export const ConsultRequest = z.object({
  task: z.string().min(1),
  tool: z.string().min(1),
  /** optional model provenance (e.g. 'opus-4.8', 'gpt-5.5', 'glm-5') — recorded for cross-model stats */
  model: z.string().optional(),
})

const RecallNote = z.object({
  title: z.string(),
  path: z.string(),
  score: z.number(),
})

export const ConsultResponse = z.discriminatedUnion('verdict', [
  // not woken / trivial / meta — nothing to do
  z.object({ verdict: z.literal('pass'), note: z.string().optional() }),
  // step 1a: a local skill matched — use it
  z.object({ verdict: z.literal('reuse'), skill: z.string(), experience: z.string().optional() }),
  // step 1b: the user's own memory covers this — read these notes before anything else
  z.object({ verdict: z.literal('recall'), notes: z.array(RecallNote), note: z.string().optional() }),
  // local miss — async research (steps 2/3) queued; nothing actionable yet
  z.object({ verdict: z.literal('searching'), note: z.string().optional() }),
  // local miss AND this task-shape has recurred enough — agent should interactively BUILD a
  // skill (research with purpose → ask the user → synthesize → register_skill). Not automatic.
  z.object({ verdict: z.literal('build'), task: z.string(), reason: z.string() }),
])

export const FeedbackRequest = z.object({
  skill: z.string().min(1),
  tool: z.string().min(1),
  /** ok = skill worked (strengthens + clears any misfit for this task-shape);
   *  fail = skill was used but failed (weakens + records a misfit);
   *  reject = the suggested skill was IRRELEVANT to the task (the agent's instant judgment). This
   *  does NOT weaken the skill's global strength — the skill may be great for its real domain — it
   *  only records a skill×task-shape misfit so the matcher stops suggesting it for THIS kind of task. */
  outcome: z.enum(['ok', 'fail', 'reject']),
  model: z.string().optional(),
  /** the task the skill was applied to / suggested for. Required for fail/reject to learn the
   *  skill×task-shape misfit; for ok it clears a prior misfit on that shape. */
  task: z.string().optional(),
  note: z.string().optional(),
})

// The agent calls this after an interactive 'build': it has researched-with-purpose, asked the
// user, and produced a SKILL.md. mycelium lands it (with a purpose annotation) and de-dupes.
export const RegisterSkillRequest = z.object({
  /** full SKILL.md content (must carry name:/description: frontmatter) */
  skillMd: z.string().min(1),
  /** what this skill is for — stored in the sidecar so other tools/agents know its purpose */
  purpose: z.string().min(1),
  /** which tool's agent built it */
  tool: z.string().min(1),
  /** optional model provenance of the building agent */
  model: z.string().optional(),
  /** extra keywords (esp. the trigger task's CJK terms) so the SAME task can find this skill */
  keywords: z.array(z.string()).optional(),
  /** optional provenance: where the research came from */
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
})

// An external crawl (Codex over anthropics/skills, antigravity-awesome-skills, skills.sh, skillsmp)
// ingests the ecosystem catalog in batches. Mycelium classifies risk + tier on its side — the
// crawler only supplies raw metadata, never the safety verdict.
export const CatalogIngestRequest = z.object({
  source: z.enum(['anthropics', 'antigravity', 'skills.sh', 'skillsmp']),
  entries: z
    .array(
      z.object({
        name: z.string().min(1),
        purpose: z.string().optional(),
        url: z.string().optional(),
        domain: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        stars: z.number().optional(),
        scanText: z.string().optional(),
      }),
    )
    .min(1)
    .max(500),
})

export type ConsultRequestT = z.infer<typeof ConsultRequest>
export type ConsultResponseT = z.infer<typeof ConsultResponse>
export type FeedbackRequestT = z.infer<typeof FeedbackRequest>
export type RegisterSkillRequestT = z.infer<typeof RegisterSkillRequest>
export type CatalogIngestRequestT = z.infer<typeof CatalogIngestRequest>