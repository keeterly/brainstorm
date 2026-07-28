import { z } from 'zod'
import { baseSystem, refLines, type ActionDef, type ThoughtRef } from '../types'

const Ref = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string().optional(),
  summary: z.string().nullable().optional(),
})

const Input = z.object({
  goal: Ref,
  raw_content: z.string().max(8000),
  successCriteria: z.array(z.string()).max(10).optional(),
  relatedThoughts: z.array(Ref).max(60).optional(),
  constraints: z.string().max(1000).optional(),
})

const Action = z.object({
  tempId: z.string(),
  title: z.string().min(1).max(160),
  effort: z.number().int().min(1).max(5),
  dependsOn: z.array(z.string()).max(6), // tempIds of prior actions
})

const Output = z.object({
  title: z.string().min(1).max(120),
  phases: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        why: z.string().max(300),
        milestones: z.array(z.string().max(160)).max(4),
        actions: z.array(Action).min(1).max(8),
        risks: z.array(z.string().max(200)).max(3),
      }),
    )
    .min(1)
    .max(5),
  immediateNext: z.object({
    tempId: z.string(),
    why: z.string().min(1).max(300),
  }),
})

export type RoadmapInput = z.infer<typeof Input>
export type RoadmapOutput = z.infer<typeof Output>

export const generateRoadmap: ActionDef<RoadmapInput, RoadmapOutput> = {
  name: 'generate_roadmap',
  version: 1,
  modelTier: 'smart',
  maxTokens: 6000,
  stream: true,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `Build a realistic roadmap for this goal.\n\nGoal: ${refLines([input.goal as ThoughtRef])}\n` +
        `Full text:\n"""${input.raw_content}"""\n` +
        (input.successCriteria?.length
          ? `Success criteria:\n${input.successCriteria.map((s) => `- ${s}`).join('\n')}\n`
          : '') +
        (input.relatedThoughts?.length
          ? `Related thoughts already captured:\n${refLines(input.relatedThoughts as ThoughtRef[])}\n`
          : '') +
        (input.constraints ? `Constraints: ${input.constraints}\n` : '') +
        `\nReturn 1–5 phases. Each phase: title, why it exists, up to 4 milestones, 1–8 actions ` +
        `(unique tempIds "a1","a2",… across ALL phases; verb-first titles; effort 1–5 where 1 ≈ under 30 min; dependsOn lists tempIds that must finish first), up to 3 risks.\n` +
        `Then immediateNext: the single best first action's tempId and a plain-language why, e.g. "This unlocks the next three steps and takes less than 30 minutes."\n` +
        `Be honest about scope — a small goal deserves a small roadmap.`,
    }
  },
}
