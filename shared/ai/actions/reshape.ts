import { z } from 'zod'
import { baseSystem, refLines, type ActionDef, type ThoughtRef } from '../types'

// Reshape — you learned something, and the map has to change.
//
// Every other action here builds: absorb makes drops, organize makes pools,
// deepen adds steps. None of them can say "that is no longer true", and a map
// that can only grow stops being a picture of what you think and becomes a
// pile of everything you have ever thought.
//
// This one is handed a piece of the map — a thought or a group, and everything
// currently under it — plus whatever you just found out, and it answers with
// edits: what this new thing adds, what it makes obsolete, what was named
// wrongly now you know more, and which of the existing pieces belong together
// in a way that was not visible before. Nothing is invented from nothing: every
// edit either introduces something the new information contains, or points at a
// piece by id.

const Ref = z.object({
  id: z.string(),
  title: z.string().max(300),
  type: z.string().max(30).optional(),
  summary: z.string().max(500).nullable().optional(),
})

const Input = z.object({
  subject: Ref,
  /** what is currently under the subject */
  inside: z.array(Ref).max(80),
  /** what the person just told it */
  news: z.string().min(1).max(8000),
  /** they spoke it rather than typed it, so it rambles */
  spoken: z.boolean().optional(),
  /** a photo, a screenshot, a page of notes — the new information itself */
  image: z
    .object({
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      dataB64: z.string().min(1).max(7000000),
    })
    .optional(),
  /** what the agent already researched about this, if it has */
  brief: z.string().max(4000).optional(),
})

const Output = z.object({
  /** a truer name for the subject, if what it is about has genuinely moved */
  rename: z.string().max(80).nullable(),
  /** what the new information adds that was not there */
  add: z
    .array(
      z.object({
        tempId: z.string(),
        title: z.string().min(1).max(200),
        /** why this follows from what they said — shown to them, so plain */
        why: z.string().max(200),
        type: z.enum(['note', 'idea', 'task', 'action', 'question', 'problem', 'decision', 'inspiration']),
      }),
    )
    .max(12),
  /** existing pieces whose wording no longer matches what they are about */
  reword: z.array(z.object({ id: z.string(), title: z.string().min(1).max(200) })).max(12),
  /** existing pieces the new information settles, answers or rules out. Never
   *  deleted — moved out of the way, and always with a reason you can argue
   *  with, because being wrong here costs the user their thinking */
  retire: z.array(z.object({ id: z.string(), why: z.string().min(1).max(200) })).max(12),
  /** pieces that belong together, now visible in a way it was not before.
   *  Members are existing ids, or tempIds from `add`. */
  group: z.array(z.object({ name: z.string().min(1).max(60), members: z.array(z.string()).min(2).max(20) })).max(4),
  /** what the person should know changed, in one sentence, in their language */
  note: z.string().max(240),
})

export type ReshapeInput = z.infer<typeof Input>
export type ReshapeOutput = z.infer<typeof Output>

export const reshape: ActionDef<ReshapeInput, ReshapeOutput> = {
  name: 'reshape',
  version: 1,
  modelTier: 'smart',
  maxTokens: 4000,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const s = input.subject
    const inside = input.inside.length
      ? `\n\nWhat is under it now — refer to these by id:\n${refLines(input.inside as ThoughtRef[])}`
      : `\n\nNothing is under it yet.`
    const brief = input.brief?.trim() ? `\n\nWhat was already researched about this:\n${input.brief.trim()}` : ''
    const source = input.image
      ? `An image is attached — a photo, a screenshot, a page of notes. Read everything legible in it and treat it as the new information. Ignore interface furniture. ` +
        (input.news.trim() ? `The text below is what they added alongside it.` : '')
      : input.spoken
        ? `The text below is a raw voice transcript, so it rambles and repeats. Recover what they actually learned from it.`
        : ''

    return {
      system: baseSystem(ctx),
      user:
        `They are looking at one part of their map and have just learned something. Change the map to match.\n\n` +
        `The part they are looking at:\n[${s.id}] ${s.title}${s.type ? ` (${s.type})` : ''}` +
        (s.summary ? `\n— ${s.summary}` : '') +
        inside +
        brief +
        `\n\n${source}\n\nWhat they now know:\n"""${input.news}"""\n\n` +
        `Answer with edits, and only edits the new information actually justifies:\n\n` +
        `add — what this introduces that is genuinely not there yet. One idea each, in their vocabulary, ` +
        `and a plain "why" naming the bit of what they said that it comes from. Do not re-add something already listed above in different words. ` +
        `If it adds nothing new, add nothing.\n\n` +
        `reword — pieces above whose wording is now wrong or vaguer than what they know. Keep their voice; ` +
        `change the words, not the thought. Leave alone anything that is still accurate.\n\n` +
        `retire — pieces the new information genuinely settles, answers, or rules out. This moves their work, ` +
        `so only when you could defend it in one sentence to them. Uncertain is a no. Most of the time this is empty.\n\n` +
        `group — two or more of the pieces above that clearly belong together in a way this news makes visible. ` +
        `A short concrete name in their language, never a category word. Usually empty; forcing this makes the map worse.\n\n` +
        `rename — a truer name for the part they are looking at, if what it is about has actually moved. ` +
        `Null if the existing name is still right, which is the normal answer.\n\n` +
        `note — one sentence telling them what changed and why, as a person would say it. Not a list of the edits.`,
      images: input.image ? [input.image] : undefined,
    }
  },
}
