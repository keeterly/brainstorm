import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

// Name a pool the way its owner would. The local heuristic picks the most
// repeated word, which yields "Fashion" and "Spend" — true, and useless. This
// asks for the thing these thoughts are actually about.

const Input = z.object({
  members: z.array(z.string().max(300)).min(2).max(20),
})

const Output = z.object({
  name: z.string().min(1).max(48),
})

export type NamePoolInput = z.infer<typeof Input>
export type NamePoolOutput = z.infer<typeof Output>

export const namePool: ActionDef<NamePoolInput, NamePoolOutput> = {
  name: 'name_pool',
  version: 1,
  modelTier: 'fast',
  maxTokens: 200,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `Someone just gathered these thoughts together because they felt related. Name the group.\n\n` +
        input.members.map((m) => `- ${m}`).join('\n') +
        `\n\n2 to 4 words, in their own vocabulary, naming what these are actually about — ` +
        `the specific thing, not the category. "SS27 lookbook" not "Fashion". "Paying the tax bill" not "Finance". ` +
        `No quotes, no trailing punctuation, sentence case. If they truly share nothing, name the closest honest common ground.`,
    }
  },
}
