import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

// Deepen — the ⚡ from the first Brainstorm, rebuilt.
//
// You point it at one thought and it goes and does the work: reads what you
// actually meant, looks things up, and comes back with the real steps rather
// than a restatement of your own sentence. "Get a $100k SBA loan" should come
// back knowing which programme that is, what a lender will ask you for, and
// what you personally have to do first — not "research SBA loans".
//
// It reads a picture the same way. Given an image it looks for the directions
// and references that would let you make more of what you are looking at.
//
// And it pays attention to you: whatever it worked out about how you operate
// comes back in `learned` and goes into memory, so the next one starts from
// further along.

const Ref = z.object({
  id: z.string(),
  title: z.string().max(300),
  type: z.string().max(30).optional(),
  summary: z.string().max(600).nullable().optional(),
  due: z.string().nullable().optional(),
})

const Input = z.object({
  subject: Ref,
  /** what is already inside or beside it, in the user's own words */
  context: z.array(z.string().max(300)).max(40),
  /** anything they typed when they asked */
  intent: z.string().max(2000).optional(),
  image: z
    .object({
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      dataB64: z.string().min(16),
    })
    .optional(),
})

const Output = z.object({
  // one line, in their language, of what they are actually trying to do
  read: z.string().min(1).max(240),
  // what looking it up actually turned up — facts, not encouragement
  found: z
    .array(
      z.object({
        point: z.string().min(1).max(280),
        why: z.string().max(240),
      }),
    )
    .max(8),
  // the real next actions, small enough to start
  steps: z
    .array(
      z.object({
        tempId: z.string().min(1).max(24),
        title: z.string().min(1).max(160),
        why: z.string().max(200),
        effort: z.number().int().min(1).max(5),
        dependsOn: z.array(z.string().max(24)).max(6),
      }),
    )
    .min(1)
    .max(10),
  // where it would trip you up
  watchOuts: z.array(z.string().max(220)).max(4),
  sources: z.array(z.object({ title: z.string().max(180), url: z.string().max(600) })).max(10),
  // durable facts about this person, worth remembering next time
  learned: z.array(z.string().max(200)).max(3),
  note: z.string().max(240),
})

export type DeepenInput = z.infer<typeof Input>
export type DeepenOutput = z.infer<typeof Output>

export const deepen: ActionDef<DeepenInput, DeepenOutput> = {
  name: 'deepen',
  version: 1,
  modelTier: 'smart',
  maxTokens: 8000,
  // Four, not six. Measured at 51s end to end with six, and the last two
  // searches were mostly re-reading the same pages under a reworded query —
  // the brief did not get better, the wait did get worse.
  searchMaxUses: 4,
  // still far past any request timeout, so it runs as a background job and the
  // client polls for it
  background: true,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const s = input.subject
    const inside = input.context.length ? `\nAlready inside it:\n${input.context.map((c) => `- ${c}`).join('\n')}` : ''
    const asked = input.intent?.trim() ? `\nThey added: "${input.intent.trim()}"` : ''
    const picture = input.image
      ? `\nAn image is attached — this is the thing they are pointing at. Read it: what it is, what makes it ` +
        `work, and what someone would have to do to get more like it. Search for the specific references, makers, ` +
        `materials or techniques behind it, not for the words in the caption.`
      : ''
    return {
      system:
        baseSystem(ctx) +
        `\n\nRight now you are doing the legwork on one idea. Search the web before you answer — you are expected ` +
        `to come back knowing things they did not tell you. Prefer primary and official sources. If something is ` +
        `time-sensitive, say when it is from.`,
      user:
        `Take this one thing seriously and go find out what it would actually take.\n\n` +
        `[${s.id}] ${s.title}${s.type ? ` (${s.type})` : ''}${s.summary ? `\n${s.summary}` : ''}` +
        `${s.due ? `\ndue ${s.due}` : ''}${inside}${asked}${picture}\n\n` +
        `read: one plain line — what are they actually trying to do here? Say the specific thing, in their own ` +
        `vocabulary. If it names a programme, a scheme, a place or a person, name it back.\n` +
        `found: what you learned by looking, that they could not have written themselves. Real numbers, real ` +
        `requirements, real names. Each with one line of why it matters to them specifically. Nothing generic; ` +
        `if searching turned up nothing worth saying, return fewer.\n` +
        `steps: the actual sequence, first thing first. Each one small enough to sit down and do, phrased as an ` +
        `action they take. Use dependsOn with your own tempIds where order genuinely matters. Effort is 1 (a few ` +
        `minutes) to 5 (a week of real work).\n` +
        `watchOuts: where this usually goes wrong, if you know. Omit rather than pad.\n` +
        `sources: what you actually used, with real URLs from the search results.\n` +
        `learned: anything durable you now know about *them* — how they work, what they are building, what they ` +
        `already have. Not about this task. Nothing you were already told above. Omit if nothing.\n` +
        `note: one sentence to hand back, in their language.`,
      images: input.image ? [input.image] : undefined,
    }
  },
}
