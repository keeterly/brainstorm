import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Candidate = z.object({
  id: z.string(),
  title: z.string(),
  effort: z.number().nullable().optional(),
  due: z.string().nullable().optional(),
  ageDays: z.number().optional(),
  blocked: z.boolean().optional(), // unmet dependencies (precomputed client-side)
  goalTitle: z.string().nullable().optional(),
})

const Input = z.object({
  actions: z.array(Candidate).min(1).max(80),
  energy: z.enum(['low', 'normal', 'high']).optional(),
  availableMinutes: z.number().int().positive().optional(),
})

const Output = z.object({
  buckets: z
    .array(
      z.object({
        id: z.string(),
        bucket: z.enum(['now', 'next', 'later', 'waiting']),
        reason: z.string().max(160),
      }),
    )
    .min(1),
  recommended: z.object({
    id: z.string(),
    why: z.string().min(1).max(300),
  }),
})

export type PrioritizeInput = z.infer<typeof Input>
export type PrioritizeOutput = z.infer<typeof Output>

export const prioritize: ActionDef<PrioritizeInput, PrioritizeOutput> = {
  name: 'prioritize',
  version: 1,
  modelTier: 'smart',
  maxTokens: 4000,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const lines = input.actions
      .map((a) => {
        const bits = [`[${a.id}]`, a.title]
        if (a.goalTitle) bits.push(`(goal: ${a.goalTitle})`)
        if (a.due) bits.push(`due ${a.due}`)
        if (a.effort != null) bits.push(`effort ${a.effort}/5`)
        if (a.ageDays != null) bits.push(`${a.ageDays}d old`)
        if (a.blocked) bits.push(`BLOCKED by dependencies`)
        return bits.join(' ')
      })
      .join('\n')
    return {
      system: baseSystem(ctx),
      user:
        `Open actions:\n${lines}\n\n` +
        (input.energy ? `User energy right now: ${input.energy}.\n` : '') +
        (input.availableMinutes ? `Available time: about ${input.availableMinutes} minutes.\n` : '') +
        `Assign EVERY action to a bucket: now (do today), next (this week), later, waiting (blocked or external). ` +
        `Weigh importance, urgency, effort, dependencies, momentum, and energy. BLOCKED actions must be "waiting". ` +
        `Each assignment gets a short reason.\n` +
        `Then pick ONE recommended action (must be bucket "now") with a plain-language why that explains what it unlocks ` +
        `and roughly how long it takes. Prefer something completable — progress beats ambition.`,
    }
  },
}
