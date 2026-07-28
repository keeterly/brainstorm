import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Input = z.object({
  raw_content: z.string().min(1).max(8000),
  title: z.string().max(200).optional(),
  desired_outcome: z.string().max(1000).optional(),
})

const Output = z.object({
  title: z.string().min(1).max(120),
  successCriteria: z.array(z.string().max(200)).min(1).max(5),
  firstActions: z
    .array(
      z.object({
        tempId: z.string(),
        title: z.string().min(1).max(160),
        effort: z.number().int().min(1).max(5),
      }),
    )
    .min(1)
    .max(5),
})

export type ToGoalInput = z.infer<typeof Input>
export type ToGoalOutput = z.infer<typeof Output>

export const toGoal: ActionDef<ToGoalInput, ToGoalOutput> = {
  name: 'to_goal',
  version: 1,
  modelTier: 'fast',
  maxTokens: 1000,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `Turn this thought into a workable goal.\n\nThought:\n"""${input.raw_content}"""\n` +
        (input.desired_outcome ? `\nThe user says success looks like: ${input.desired_outcome}\n` : '') +
        `\nReturn: a goal title, 1–5 concrete success criteria, and 1–5 realistic first actions ` +
        `(each with a unique tempId like "t1","t2", a title starting with a verb, and effort 1–5 where 1 ≈ under 30 min). ` +
        `Keep scope honest — do not inflate a small idea into a program.`,
    }
  },
}
