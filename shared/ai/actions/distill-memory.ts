import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Input = z.object({
  text: z.string().min(1).max(16000),
  existing: z.array(z.string()).max(100),
})

const Output = z.object({
  facts: z.array(z.string().min(1).max(200)).max(10),
})

export type DistillInput = z.infer<typeof Input>
export type DistillOutput = z.infer<typeof Output>

export const distillMemory: ActionDef<DistillInput, DistillOutput> = {
  name: 'distill_memory',
  version: 1,
  modelTier: 'fast',
  maxTokens: 800,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `From the text below, extract up to 10 DURABLE facts worth remembering about the user long-term: ` +
        `preferences, constraints, working patterns, definitions of success, recurring commitments. ` +
        `No one-off tasks, no transient states. Skip anything already covered by existing memory.\n\n` +
        `Existing memory:\n${input.existing.map((m) => `- ${m}`).join('\n') || '(empty)'}\n\n` +
        `Text:\n"""${input.text}"""\n\n` +
        `Each fact: one short sentence. Empty list is fine.`,
    }
  },
}
