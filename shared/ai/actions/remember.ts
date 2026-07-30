// Learning something, as opposed to being told something.
//
// `distill_memory` extracted facts and handed them over, and every one of the
// seven places that called it did the same thing with them: push, dedupe
// against a lowercased set of exact strings, done. Which meant memory could
// only ever grow. "Two-person team based in Los Angeles" and "We are two
// people, working out of LA" were two memories. "Works best in the morning"
// outlived the mornings by a year, because nothing in the app was capable of
// noticing that something it believed had stopped being true.
//
// This is the reconciler. It sees the new material *and* what is already
// believed nearby, and decides per fact which of four things is happening:
//
//   add    — genuinely new.
//   update — the same belief, better stated, or narrowed, or corrected. The
//            old text is replaced and the trail keeps the old wording.
//   archive— this is no longer true. Not deleted: archived, pointing at
//            whatever replaced it, because "it used to think X" is worth
//            being able to read.
//   noop   — already known. The commonest answer by a distance, and the one
//            the old code could not give.
//
// Being wrong in the two directions is not symmetric, and the prompt says so.
// A missed fact costs one fact. A wrongly-archived constraint means the agent
// starts producing work that breaks a rule you told it about months ago and
// have no reason to think it has forgotten.
import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Known = z.object({
  id: z.string().min(1).max(64),
  content: z.string().max(400),
  kind: z.string().max(20).nullable().optional(),
})

const Input = z.object({
  /** the new material — what they said, or what a run turned up */
  text: z.string().min(1).max(16000),
  /** where it came from, in a few words, for the trail */
  from: z.string().max(120).optional(),
  /** what is already believed that is anywhere near this */
  known: z.array(Known).max(60),
})

const KINDS = ['preference', 'constraint', 'pattern', 'fact', 'person', 'tool', 'goal'] as const

const Op = z.object({
  op: z.enum(['add', 'update', 'archive', 'noop']),
  /** which existing memory this is about — required for update, archive, noop */
  id: z.string().max(64).optional(),
  /** the memory as it should now read — required for add and update */
  content: z.string().max(200).optional(),
  kind: z.enum(KINDS).optional(),
  /** one short line, in their language, for why this changed */
  why: z.string().max(160).optional(),
})

const Output = z.object({
  ops: z.array(Op).max(12),
})

export type RememberInput = z.infer<typeof Input>
export type RememberOutput = z.infer<typeof Output>
export type MemoryOp = z.infer<typeof Op>

export const remember: ActionDef<RememberInput, RememberOutput> = {
  name: 'remember',
  version: 1,
  // The cheap tier, because this runs after everything else the app does and
  // any weight here is weight on every capture, every answer, every draft.
  modelTier: 'fast',
  maxTokens: 1200,
  // It is deciding what it already knows. It must not go and look anything up.
  searchMaxUses: 0,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const known = input.known.length
      ? input.known.map((k) => `[${k.id}] ${k.content}${k.kind ? ` (${k.kind})` : ''}`).join('\n')
      : '(nothing near this yet)'
    const from = input.from?.trim() ? `\nThis came from: ${input.from.trim()}` : ''
    return {
      system:
        baseSystem(ctx) +
        `\n\nYou are keeping this person's memory: the small set of durable things about them that make ` +
        `everything else you do fit. You are not summarising what they said and you are not taking notes on ` +
        `their project. A memory is about *them* — how they work, what they will not do, what they always ` +
        `want, who they work with, what they are aiming at. Anything that will be irrelevant next month is ` +
        `not a memory.\n\n` +
        `Most of the time the honest answer is that you already know this. Say so. A memory list that grows ` +
        `every time they type is one that is never read.\n\n` +
        `Being wrong costs differently in each direction, and it matters which. Missing a fact costs one ` +
        `fact. Archiving a constraint that was still true means you will confidently produce work that ` +
        `breaks a rule they told you about months ago and have every reason to think you still know. So: ` +
        `archive only on a direct contradiction of the old memory in this new material — never because ` +
        `something has gone unmentioned, never because it merely sounds out of date, and never to tidy up.`,
      user:
        `New material${from}:\n"""${input.text}"""\n\n` +
        `What you already believe that is near it:\n${known}\n\n` +
        `Return one op per decision, at most 12. Fewer is better, and an empty list is a fine answer.\n\n` +
        `op: "add" for something genuinely new about them. "update" when this says the same thing as an ` +
        `existing memory but better, more precisely, or has narrowed it — give that memory's id and the ` +
        `full replacement text. "archive" when this material directly contradicts an existing memory — give ` +
        `its id. "noop" when an existing memory already covers it — give its id, and nothing else.\n` +
        `content: the memory itself, for add and update. One short sentence, in the third person, standing ` +
        `on its own: someone reading it a year from now with no other context must understand it. Not "the ` +
        `usual mill" — name the mill.\n` +
        `kind: preference (what they always want) · constraint (what they cannot or will not do) · pattern ` +
        `(how they work) · fact (something durably true about their situation) · person · tool · goal.\n` +
        `why: one short line for the trail, in their language, only when something changed. Skip it on noop.`,
    }
  },
}
