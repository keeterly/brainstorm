import { z } from 'zod'
import { baseSystem, refLines, type ActionDef, type ThoughtRef } from '../types'

// Notice — the app's read on you, across everything at once.
//
// Every other action looks at one thought or one dump. This one steps back and
// looks at the whole sky plus what it already remembers about you, and says
// what it sees: the shape you keep returning to, what is actually about to
// bite, and the two or three moves that would change the most. It is the part
// that makes the app feel like it knows you rather than like it holds your
// notes.
//
// It is deliberately allowed to say almost nothing. A read on someone with
// four thoughts should be short and humble; the value is in being right, not
// in filling the section.

const Ref = z.object({
  id: z.string(),
  title: z.string().max(300),
  type: z.string().max(30).optional(),
  summary: z.string().max(400).nullable().optional(),
  due: z.string().nullable().optional(),
})

const Input = z.object({
  thoughts: z.array(Ref).min(1).max(200),
  /** name → what is in it, so the shape of their thinking is visible */
  pools: z.array(z.object({ name: z.string().max(80), members: z.array(z.string().max(160)).max(20) })).max(40),
  /** what has been finished lately, which says as much as what is open */
  recentlyDone: z.array(z.string().max(200)).max(20),
})

const Output = z.object({
  // what it sees in how they work — about them, not about the list
  read: z.string().max(300),
  // the things that will bite, soonest first
  pressing: z
    .array(
      z.object({
        id: z.string(),
        why: z.string().max(180),
      }),
    )
    .max(3),
  // moves worth making, each earning its place
  suggestions: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        why: z.string().max(200),
        /** the thought this comes off, when it comes off one */
        from: z.string().optional(),
      }),
    )
    .max(3),
  // durable things about them worth keeping
  learned: z.array(z.string().max(200)).max(3),
})

export type NoticeInput = z.infer<typeof Input>
export type NoticeOutput = z.infer<typeof Output>

export const notice: ActionDef<NoticeInput, NoticeOutput> = {
  name: 'notice',
  version: 1,
  modelTier: 'smart',
  maxTokens: 2500,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const pools = input.pools.length
      ? `\nWhat they have grouped:\n` +
        input.pools.map((p) => `- ${p.name}: ${p.members.slice(0, 8).join('; ') || '(empty)'}`).join('\n')
      : ''
    const done = input.recentlyDone.length
      ? `\nFinished lately:\n${input.recentlyDone.map((d) => `- ${d}`).join('\n')}`
      : ''
    return {
      system:
        baseSystem(ctx) +
        `\n\nRight now you are standing back and looking at all of it at once. You are not doing their work for ` +
        `them and you are not cheerleading. Say the true thing a sharp friend would say after looking at this for ` +
        `a minute — and if there is not much to say yet, say little.`,
      user:
        `Everything currently open:\n${refLines(input.thoughts as ThoughtRef[])}\n${pools}${done}\n\n` +
        `read: what you notice about how *they* work, from the shape of all this together — what they keep ` +
        `circling, what they start and do not finish, where their attention actually goes. One or two sentences, ` +
        `plainly, second person. Not a summary of the list; they can see the list. If nothing honest stands out ` +
        `yet, say so in a few words rather than inventing a pattern.\n` +
        `pressing: up to three that will bite soonest, by id, each with one line of why. Look at dates, at what ` +
        `blocks other things, at what has been sitting untouched. Fewer is better. Only ids from above.\n` +
        `suggestions: up to three moves worth making now — a thing to do, a connection they have not drawn, a ` +
        `question worth answering. Each must earn its place; none should be a restatement of a thought they ` +
        `already have. Set "from" to the id it comes off, if it comes off one.\n` +
        `learned: durable facts about them worth remembering — how they operate, what they are building, what ` +
        `they have. Not tasks. Nothing already in memory above. Omit if nothing.`,
    }
  },
}
