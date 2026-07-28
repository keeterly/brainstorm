import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const THOUGHT_TYPES = [
  'note',
  'idea',
  'task',
  'action',
  'question',
  'problem',
  'goal',
  'decision',
  'reference',
  'constraint',
  'inspiration',
  'concept',
] as const

const Input = z.object({
  raw_content: z.string().min(1).max(8000),
})

const Output = z.object({
  type: z.enum(THOUGHT_TYPES),
  confidence: z.number().min(0).max(1),
  title: z.string().min(1).max(120),
  summary: z.string().max(400),
  suggestedDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  clarifyingQuestion: z.string().max(200).nullable(),
})

export type ClassifyInput = z.infer<typeof Input>
export type ClassifyOutput = z.infer<typeof Output>

export const classifyThought: ActionDef<ClassifyInput, ClassifyOutput> = {
  name: 'classify_thought',
  version: 1,
  modelTier: 'fast',
  maxTokens: 800,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `A user just captured this thought, exactly as written (may be messy, incomplete, emotional):\n\n` +
        `"""${input.raw_content}"""\n\n` +
        `Classify it. Rules:\n` +
        `- type: the single most likely kind of thought.\n` +
        `- title: a short handle in the user's own vocabulary (not corporate-speak).\n` +
        `- summary: one sentence, only if it adds clarity beyond the title; otherwise repeat the essence briefly.\n` +
        `- suggestedDue: only if the text clearly implies a date, else null.\n` +
        `- clarifyingQuestion: at most ONE short question, and only if the answer would materially change what happens next (explore vs complete, deadline, desired outcome). Usually null — capture must not feel like an interrogation.`,
    }
  },
}
