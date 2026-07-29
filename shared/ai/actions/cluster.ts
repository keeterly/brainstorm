import { z } from 'zod'
import { baseSystem, refLines, type ActionDef, type ThoughtRef } from '../types'

// Cluster — tidy a sky that has filled up. Takes what is already loose and
// what pools already exist, and puts the loose things where they belong:
// into an existing pool when one fits, into a new pool when several loose
// thoughts clearly share a theme, and left alone when they are genuinely
// their own thing. Nothing is created and nothing is deleted — this only
// decides where existing thoughts live.

const Ref = z.object({
  id: z.string(),
  title: z.string().max(300),
  type: z.string().max(30).optional(),
  summary: z.string().max(500).nullable().optional(),
  due: z.string().nullable().optional(),
})

const Input = z.object({
  loose: z.array(Ref).min(1).max(120),
  pools: z.array(z.object({ id: z.string(), name: z.string().max(80), members: z.array(z.string().max(200)).max(30) })).max(40),
})

const Output = z.object({
  // loose thoughts joining a pool that already exists
  intoExisting: z.array(z.object({ poolId: z.string(), members: z.array(z.string()).min(1).max(30) })).max(40),
  // brand new pools, each needing at least two loose thoughts to justify it
  newPools: z.array(z.object({ name: z.string().min(1).max(60), members: z.array(z.string()).min(2).max(20) })).max(10),
  // the pool that deserves attention now, and why — one line
  focus: z.object({ poolName: z.string().max(80), why: z.string().max(160) }).optional(),
  note: z.string().max(200),
})

export type ClusterInput = z.infer<typeof Input>
export type ClusterOutput = z.infer<typeof Output>

export const cluster: ActionDef<ClusterInput, ClusterOutput> = {
  name: 'cluster',
  version: 1,
  modelTier: 'smart',
  maxTokens: 3000,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const pools = input.pools.length
      ? input.pools.map((p) => `[${p.id}] ${p.name} — holds: ${p.members.slice(0, 8).join('; ') || '(empty)'}`).join('\n')
      : '(none yet)'
    return {
      system: baseSystem(ctx),
      user:
        `Their thinking space has filled up with loose thoughts and is hard to look at. Tidy it.\n\n` +
        `Pools that already exist:\n${pools}\n\n` +
        `Loose thoughts:\n${refLines(input.loose as ThoughtRef[])}\n\n` +
        `Decide where each loose thought belongs:\n` +
        `- intoExisting: it clearly belongs with a pool that already exists. Prefer this over inventing a new pool.\n` +
        `- newPools: two or more loose thoughts share a real theme that no pool covers. Name it in 2-4 words of their own vocabulary — ` +
        `the specific thing, not a category. "SS27 Paris show" not "Fashion".\n` +
        `- leave it out entirely if it is genuinely its own thing. A sky with a few loose thoughts is healthy; ` +
        `a sky where everything has been forced into a bucket is worse than the mess.\n\n` +
        `Use only ids that appear above, each loose id at most once.\n\n` +
        `focus: which single pool most deserves their attention right now, by name, and one sentence of why — ` +
        `look at what is time-pressured, half-finished, or blocking the rest. Omit it if nothing genuinely stands out.\n` +
        `note: one plain sentence about the shape you found.`,
    }
  },
}
