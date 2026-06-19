import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { ConsultRequest, FeedbackRequest, RegisterSkillRequest } from '../mcep/schema.js'
import type { Brain } from '../brain/consult.js'

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
const text = (t: string, isError = false): ToolResult => ({
  content: [{ type: 'text', text: t }],
  isError,
})

export function buildMcpHandlers(brain: Brain) {
  return {
    async consult(raw: unknown): Promise<ToolResult> {
      const p = ConsultRequest.safeParse(raw)
      if (!p.success) return text(`invalid consult: ${p.error.message}`, true)
      return text(JSON.stringify(brain.consult(p.data)))
    },
    async feedback(raw: unknown): Promise<ToolResult> {
      const p = FeedbackRequest.safeParse(raw)
      if (!p.success) return text(`invalid feedback: ${p.error.message}`, true)
      brain.feedback(p.data)
      return text(`recorded feedback for ${p.data.skill}`)
    },
    async registerSkill(raw: unknown): Promise<ToolResult> {
      const p = RegisterSkillRequest.safeParse(raw)
      if (!p.success) return text(`invalid register_skill: ${p.error.message}`, true)
      const r = brain.registerSkill(p.data)
      if (!r.ok) return text(`register_skill failed: ${r.reason}`, true)
      return text(JSON.stringify(r))
    },
  }
}

export async function startMcpServer(brain: Brain): Promise<void> {
  const h = buildMcpHandlers(brain)
  const server = new McpServer({ name: 'mycelium', version: '0.1.0' })

  server.registerTool(
    'consult',
    {
      description:
        'MUST be called before starting any task. Returns a verdict: reuse (a local skill matched), recall (your memory covers it — read the notes), searching (researching ready-made options), build (recurring need with no coverage — interactively build a skill then call register_skill), or pass.',
      inputSchema: { task: z.string(), tool: z.string(), model: z.string().optional() },
    },
    async (args) => (await h.consult(args)) as any,
  )

  server.registerTool(
    'feedback',
    {
      description:
        'Report a skill outcome so the brain learns. Pass `task` (what the skill was for). Outcomes: "ok" (worked — strengthens it and clears any misfit for this task-shape), "fail" (used but failed — weakens it and records a misfit), "reject" (the suggested skill was IRRELEVANT to the task — does NOT weaken the skill, only records a skill×task-shape misfit so it stops being suggested for THIS kind of task). Call "reject" the moment a reuse suggestion is off-topic.',
      inputSchema: {
        skill: z.string(),
        tool: z.string(),
        outcome: z.enum(['ok', 'fail', 'reject']),
        model: z.string().optional(),
        task: z.string().optional(),
        note: z.string().optional(),
      },
    },
    async (args) => (await h.feedback(args)) as any,
  )

  server.registerTool(
    'register_skill',
    {
      description:
        'Deposit a skill you built interactively (after a "build" verdict): pass the full SKILL.md and a one-line purpose. Also pass `keywords`: the trigger task\'s key terms IN THE USER\'S LANGUAGE (e.g. Chinese 中断/固件/MIDI) so the SAME task that prompted the build can find this skill later — without them an English-only skill is unmatchable by a Chinese task. The brain lands it, annotates its purpose so other tools know what it is for, and de-dupes by name.',
      inputSchema: {
        skillMd: z.string(),
        purpose: z.string(),
        tool: z.string(),
        model: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        source: z.string().optional(),
        sourceUrl: z.string().optional(),
      },
    },
    async (args) => (await h.registerSkill(args)) as any,
  )

  await server.connect(new StdioServerTransport())
}
