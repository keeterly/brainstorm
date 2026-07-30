import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

// How much work is this actually worth?
//
// ⚡ ran four live web searches on everything. "Get approved for a $100K SBA
// loan" needs every one of them — the programme, the caps, what a lender asks
// for, all of it current and none of it guessable. "SS27 Lookbook & Collection
// Prep" needs none: it is the user's own project, nobody on the web knows
// anything about it, and searching for it four times is sixty seconds spent
// confirming that the internet has never heard of your lookbook.
//
// Both took the same minute, because the depth was a constant in a file rather
// than a property of the question. This reads the question first.
//
// It is deliberately the cheapest call in the app — the fast tier, no searching
// of its own, an output of three small fields — because it runs in front of
// everything else and any weight here is weight on every single ⚡. Measured at
// well under a second, against a saving of forty to sixty on anything that
// turns out to need nothing.

const Ref = z.object({
  id: z.string(),
  title: z.string().max(300),
  type: z.string().max(30).optional(),
  summary: z.string().max(600).nullable().optional(),
})

const Input = z.object({
  subject: Ref,
  context: z.array(z.string().max(300)).max(40),
  /** what is about to be asked of it: a way through, or an answer */
  kind: z.enum(['plan', 'answer']),
  intent: z.string().max(2000).optional(),
})

export const DEPTHS = ['known', 'light', 'deep'] as const
export type Depth = (typeof DEPTHS)[number]

const Output = z.object({
  depth: z.enum(DEPTHS),
  /** the specific things that would have to be looked up, if any */
  needs: z.array(z.string().max(120)).max(4),
  /** one line, in the user's terms, for the notice that stands during the wait */
  why: z.string().max(160),
})

export type GaugeInput = z.infer<typeof Input>
export type GaugeOutput = z.infer<typeof Output>

/** How many searches each depth is allowed. The whole point of the exercise. */
export const SEARCHES_FOR: Record<Depth, number> = { known: 0, light: 2, deep: 5 }

/** Roughly how long each depth takes, so the wait can say so honestly. */
export const SECONDS_FOR: Record<Depth, number> = { known: 8, light: 30, deep: 70 }

export const gauge: ActionDef<GaugeInput, GaugeOutput> = {
  name: 'gauge',
  version: 1,
  modelTier: 'fast',
  maxTokens: 400,
  // it must not go and look things up in order to decide whether to look
  // things up
  searchMaxUses: 0,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const s = input.subject
    const around = input.context.length
      ? `\nAlready around it:\n${input.context
          .slice(0, 20)
          .map((c) => `- ${c}`)
          .join('\n')}`
      : ''
    const asked = input.intent?.trim() ? `\nThey added: "${input.intent.trim()}"` : ''
    const job =
      input.kind === 'answer'
        ? 'They are about to ask for the answer to this.'
        : 'They are about to ask for the real way through this.'
    return {
      system:
        baseSystem(ctx) +
        `\n\nYou are deciding how much looking-up the next step needs, and nothing else. Do not answer the ` +
        `question, do not plan anything, do not search. One quick judgement.\n\n` +
        `The cost of being wrong is not symmetric, and it is worth knowing which way. Saying "deep" when the ` +
        `answer was already knowable spends a minute of someone's life on nothing. Saying "known" when it truly ` +
        `needed current facts produces a confident answer that is out of date. Prefer the smaller one for ` +
        `anything about their own work, their own projects, their own decisions — the web knows nothing about ` +
        `those — and the larger one whenever the answer turns on a price, a rule, a date, a product, an ` +
        `organisation, or anything that changed recently.`,
      user:
        `${job}\n\n[${s.id}] ${s.title}${s.type ? ` (${s.type})` : ''}${s.summary ? `\n${s.summary}` : ''}` +
        `${around}${asked}\n\n` +
        `depth:\n` +
        `- "known" — no external fact is needed. Their own project, their own idea, their own call to make. A ` +
        `good answer here comes from thinking about what they said, not from the web.\n` +
        `- "light" — one or two specific things need checking and the rest is judgement.\n` +
        `- "deep" — the answer genuinely turns on current, specific, external information: real prices, real ` +
        `rules, real availability, real names, and getting it wrong from memory would matter.\n` +
        `needs: the specific things that would have to be looked up, named concretely ("current 7(a) rate caps", ` +
        `"LAX→CDG premium economy fares for those dates"). Empty when depth is "known".\n` +
        `why: one short line in their language for what happens next — "nothing to look up, thinking it through" ` +
        `or "checking three things first". No jargon, no hedging.`,
    }
  },
}
