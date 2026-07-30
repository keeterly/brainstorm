// Doing the thing, rather than describing how it would be done.
//
// This is the end of the funnel the whole app is shaped around. A thought
// becomes an idea, an idea is worked into a path, a path rains into actions —
// and then it stopped. Every one of those actions sat there with a tick box
// beside it and no help of any kind, which means the agent could talk about
// your work all day and never once do any.
//
// `deepen` plans. `answer` finds out. This makes. "Draft the executive summary
// covering the past three years" comes back as an executive summary, not as
// five bullet points about what an executive summary should contain. If the
// task genuinely cannot be finished from here — because it needs your bank
// login, or a signature, or somebody to say yes — it makes the part that can
// be made and says plainly what is left, which is a far better place to start
// from than a blank page.
import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Ref = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(300),
  summary: z.string().max(600).nullable().optional(),
  due: z.string().nullable().optional(),
})

const Input = z.object({
  subject: Ref,
  /** the goal it hangs under, in the user's words — most of the brief */
  under: z.string().max(300).optional(),
  /** what else is under that goal, so the draft does not do a neighbour's job */
  alongside: z.array(z.string().max(300)).max(40),
  /** everything the user has told this thing themselves */
  known: z.array(z.string().max(2000)).max(20),
  /** what the agent already found out about the goal, if it has */
  found: z.string().max(4000).optional(),
  /** anything they typed when they asked for it */
  intent: z.string().max(2000).optional(),
})

const Output = z.object({
  /** what this is, as a name you would give the file */
  title: z.string().min(1).max(140),
  /**
   * The work itself, in markdown. The whole point of the action: this is the
   * draft, the list, the outline, the message — the thing that did not exist
   * before and now does.
   */
  body: z.string().min(1).max(9000),
  /** what you would have to change before using it, at most four */
  check: z
    .array(
      z.object({
        what: z.string().min(1).max(200),
        why: z.string().max(200).optional(),
      }),
    )
    .max(4),
  /** what it had to assume, because it could not reach the real thing */
  assumed: z.array(z.string().max(200)).max(4),
  /** what genuinely cannot be done from here, and by whom */
  blocked: z.array(z.string().max(200)).max(3),
  /** durable facts about them that came out of doing this */
  learned: z.array(z.string().max(200)).max(4),
  sources: z
    .array(z.object({ title: z.string().max(200), url: z.string().max(500) }))
    .max(8),
  /** true if this task is now finished and can be ticked off */
  done: z.boolean(),
})

export type DraftInput = z.infer<typeof Input>
export type DraftOutput = z.infer<typeof Output>

export const draft: ActionDef<DraftInput, DraftOutput> = {
  name: 'draft',
  version: 1,
  modelTier: 'smart',
  // The output *is* the deliverable, so this is the one action whose length is
  // the point rather than the cost.
  maxTokens: 9000,
  // Some of this work needs facts — a lender shortlist, a supplier comparison —
  // and some does not. Two is enough to ground a draft without turning making
  // into researching.
  searchMaxUses: 2,
  background: true,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const s = input.subject
    const under = input.under ? `\nIt is one step of: ${input.under}` : ''
    const near = input.alongside.length
      ? `\nThe other steps of that, which are not yours to do here:\n${input.alongside.map((c) => `- ${c}`).join('\n')}`
      : ''
    const known = input.known.length
      ? `\nWhat they have already said about it:\n${input.known.map((k) => `- ${k}`).join('\n')}`
      : ''
    const found = input.found ? `\nWhat was already found out about the goal:\n${input.found}` : ''
    const asked = input.intent?.trim() ? `\nThey added: "${input.intent.trim()}"` : ''
    return {
      system:
        baseSystem(ctx) +
        `\n\nRight now you are doing one piece of work, not planning it and not researching it. What comes ` +
        `back is the thing itself — the draft, the list, the outline, the message — written well enough to ` +
        `use or to edit, never a description of what such a thing would contain.\n\n` +
        `You are forbidden from handing the task back. "Gather your last three years of returns and summarise ` +
        `the trend" is not a draft of an executive summary. Where you do not have a real figure, write the ` +
        `sentence with a clearly marked blank — [2024 revenue] — and put that in \`check\`. A draft with four ` +
        `blanks in it is worth an afternoon; an instruction to write one is worth nothing.\n\n` +
        `Do the piece in front of you and not its neighbours. If the step is "draft the summary", do not also ` +
        `file the forms, and do not pad the body with what the next step will cover.`,
      user:
        `Do this.\n\n` +
        `[${s.id}] ${s.title}${s.summary ? `\n${s.summary}` : ''}${s.due ? `\ndue ${s.due}` : ''}` +
        `${under}${near}${known}${found}${asked}\n\n` +
        `title: what to call the thing you made — a name for the file, not a restatement of the task.\n` +
        `body: the work. Markdown. Whatever shape the task actually wants — prose for a summary, a table for ` +
        `a comparison, numbered rows for a shortlist, the message itself for a message. Long enough to be ` +
        `useful and not one line longer. No preamble, no "here is your draft", no closing offer to revise.\n` +
        `check: what they must change or verify before this is used, at most four. Each one specific and ` +
        `pointing at a place in the body — a blank you left, a figure you took from a source, an assumption ` +
        `about their situation.\n` +
        `assumed: what you had to take as true to write it at all. Empty is a good answer.\n` +
        `blocked: only what genuinely cannot be done from here — needs their login, their signature, another ` +
        `person's decision. Say who or what it needs. Not "review it": reviewing is not a block.\n` +
        `learned: anything durable about *them* this taught you. Not about this task. Omit if nothing.\n` +
        `sources: only what you actually looked up, with real URLs.\n` +
        `done: true if the work is finished and the step can be ticked off; false if what you made still ` +
        `needs them to act on it.`,
    }
  },
}
