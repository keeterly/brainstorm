import { z } from 'zod'
import { baseSystem, refLines, type ActionDef, type ThoughtRef } from '../types'

// Organize — the brain dump becomes a sky. Read a messy paragraph or a spoken
// transcript, break it into atomic thoughts, gather the ones that belong
// together into named pools, and draw threads between the ideas that speak to
// each other across pools. The existing sky is passed in so a new dump can
// join what is already there instead of duplicating it.

const Ref = z.object({
  id: z.string(),
  title: z.string().max(300),
  type: z.string().max(30).optional(),
  summary: z.string().max(500).nullable().optional(),
  due: z.string().nullable().optional(),
})

const Input = z.object({
  text: z.string().max(24000),
  thoughts: z.array(Ref).max(200),
  spoken: z.boolean().optional(),
  // a screenshot, a whiteboard, a page of handwriting — read it and think
  image: z
    .object({
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      dataB64: z.string().min(1).max(7000000),
    })
    .optional(),
})

const Output = z.object({
  // every distinct idea found in the dump, one thought each
  drops: z
    .array(
      z.object({
        tempId: z.string(),
        text: z.string().min(1).max(240),
        type: z.enum(['note', 'idea', 'task', 'action', 'question', 'problem', 'decision', 'inspiration']),
      }),
    )
    .max(40),
  // themes worth gathering — members may be tempIds or existing thought ids
  pools: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        members: z.array(z.string()).min(2).max(20),
      }),
    )
    .max(8),
  // ideas that speak to each other but should not be merged
  links: z.array(z.object({ a: z.string(), b: z.string() })).max(30),
  note: z.string().max(240),
})

export type OrganizeInput = z.infer<typeof Input>
export type OrganizeOutput = z.infer<typeof Output>

export const organize: ActionDef<OrganizeInput, OrganizeOutput> = {
  name: 'organize',
  version: 1,
  modelTier: 'smart',
  maxTokens: 8000,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const existing = input.thoughts.length
      ? `\n\nAlready in their sky (you may put these into pools and links by id, but never restate one as a new drop):\n${refLines(input.thoughts as ThoughtRef[])}`
      : ''
    const source = input.image
      ? `An image is attached: a screenshot, a photo of a whiteboard or notebook, or a list from another app. Read everything legible in it and treat it as the material. ` +
        `Keep the person's own wording. Where the image shows a heading with items beneath it, that heading is a pool and those items are its members. ` +
        `Ignore interface furniture — app chrome, tab bars, buttons, counts, battery and clock. If some text is genuinely unreadable, leave it out rather than guessing.` +
        (input.text.trim() ? ` The text below is what they added alongside it.` : '')
      : input.spoken
        ? `The text below is a raw voice transcript, so it rambles, repeats, and has no punctuation to trust. Recover the thinking from it — drop the filler, keep the substance, and write each thought as the person would have written it.`
        : `The text below is a brain dump — messy on purpose.`
    return {
      system: baseSystem(ctx),
      user:
        `${source}\n\n` +
        `Do three things:\n` +
        `1. drops — break it into atomic thoughts, one idea each, in the user's own voice and vocabulary. ` +
        `Never merge two ideas into one drop, and never split one idea across two. Give each a tempId like "t1".\n` +
        `2. pools — gather drops that share a real theme under a short, concrete name (2-4 words, the user's language, not a category label like "Ideas" or "Misc"). ` +
        `A pool needs at least two members. Leave genuinely unrelated thoughts out of every pool — a loose thought is a fine outcome. ` +
        `Do not force everything into pools; two good pools beat five vague ones.\n` +
        `3. links — pairs of thoughts that illuminate each other but belong to different pools, or that are in tension. ` +
        `Only draw a link you could explain in one sentence. Few and meaningful.\n\n` +
        `note: one plain sentence to the user about what you found — the shape of their thinking, not a summary of the text.` +
        existing +
        (input.text.trim() ? `\n\nText:\n"""${input.text}"""` : ''),
      images: input.image ? [input.image] : undefined,
    }
  },
}
