import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Input = z.object({
  raw_content: z.string().min(1).max(16000),
})

const Output = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
})

export type SummarizeInput = z.infer<typeof Input>
export type SummarizeOutput = z.infer<typeof Output>

export const summarize: ActionDef<SummarizeInput, SummarizeOutput> = {
  name: 'summarize',
  version: 1,
  modelTier: 'fast',
  maxTokens: 600,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `Summarize this captured thought into a short title and a one-to-two sentence summary. ` +
        `Preserve the user's intent and vocabulary; do not add advice.\n\n"""${input.raw_content}"""`,
    }
  },
}
