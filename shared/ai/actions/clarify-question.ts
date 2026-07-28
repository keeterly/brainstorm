import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Input = z.object({
  raw_content: z.string().min(1).max(8000),
  known_context: z.string().max(2000).optional(),
})

const Output = z.object({
  question: z.string().min(1).max(200),
  why: z.string().max(200),
})

export type ClarifyInput = z.infer<typeof Input>
export type ClarifyOutput = z.infer<typeof Output>

export const clarifyQuestion: ActionDef<ClarifyInput, ClarifyOutput> = {
  name: 'clarify_question',
  version: 1,
  modelTier: 'fast',
  maxTokens: 400,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `The user captured:\n"""${input.raw_content}"""\n` +
        (input.known_context ? `\nKnown context: ${input.known_context}\n` : '') +
        `\nAsk exactly ONE short, concrete question whose answer would most improve what happens next with this thought ` +
        `(e.g. explore vs complete, success criteria, deadline, connection to existing work). ` +
        `Also give a one-line "why" explaining what the answer unlocks.`,
    }
  },
}
