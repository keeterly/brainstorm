import { z } from 'zod'
import { baseSystem, refLines, type ActionDef, type ThoughtRef } from '../types'

const REL_TYPES = [
  'relates_to',
  'depends_on',
  'contradicts',
  'supports',
  'inspired_by',
  'blocks',
  'part_of',
  'evolved_into',
  'duplicates',
  'answers',
] as const

const Ref = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string().optional(),
  summary: z.string().nullable().optional(),
})

const Input = z.object({
  subject: Ref,
  candidates: z.array(Ref).min(1).max(200),
})

const Output = z.object({
  related: z
    .array(
      z.object({
        id: z.string(),
        relType: z.enum(REL_TYPES),
        reason: z.string().max(200),
      }),
    )
    .max(8),
})

export type FindRelatedInput = z.infer<typeof Input>
export type FindRelatedOutput = z.infer<typeof Output>

export const findRelated: ActionDef<FindRelatedInput, FindRelatedOutput> = {
  name: 'find_related',
  version: 1,
  modelTier: 'fast',
  maxTokens: 1000,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `Subject thought:\n${refLines([input.subject as ThoughtRef])}\n\n` +
        `Other thoughts in the user's brain:\n${refLines(input.candidates as ThoughtRef[])}\n\n` +
        `Find genuine connections between the subject and the other thoughts — including non-obvious ones captured at different times. ` +
        `Return at most 8, each with the candidate's exact [id], a relationship type (direction: subject → candidate), and a short reason. ` +
        `Only meaningful connections; an empty list is a valid answer.`,
    }
  },
}
