// Rain — the cloud lets go, and what falls is work.
//
// This is the gesture at the dead centre of the app's metaphor, and until now
// it was the only one that did not think. `planOf()` was a string template:
// row one restated the group's own name, rows two to four were the first three
// members with `Rough out "…"` glued in front of them, row five was the same
// closing sentence every time. Same five rows for any group of any content,
// three of them wearing an identical subtitle because the subtitle was a
// literal. It truncated each member to 46 characters, so a row said *less*
// than the bubble it came from, and it silently dropped everything past the
// third member.
//
// What it is instead: the thing that reads a full cloud and says what actually
// falls out of it. The distinction that makes this a separate action rather
// than a second `deepen` is that everything it needs is already here — this is
// your own thinking, gathered over days, and the web has never heard of it.
// So it does not search, it does not go away, and it does not take a minute.
// It condenses.
//
// The output is actions, and they are meant to become real thoughts under the
// goal — which is what the rest of the app is waiting for. A leaf under a goal
// is exactly the shape the third moon reads: a question gets `answer it`,
// something makeable gets `do it`, anything else gets `work it`. Rain used to
// end in a private blob nothing else could see. Now it ends where the funnel
// starts.
import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Input = z.object({
  /** what the group is called, in the user's words */
  name: z.string().max(300),
  /** everything in it — all of it, not the first three */
  inside: z.array(z.string().max(300)).max(60),
  /** what they have already told these things themselves */
  known: z.array(z.string().max(600)).max(20),
  /** what the agent has already found out about this goal, if it has */
  found: z.string().max(3000).optional(),
  /** what is already hanging under it as work, so nothing arrives twice */
  already: z.array(z.string().max(300)).max(40),
})

const Output = z.object({
  /**
   * What this cloud is actually about, in one line.
   *
   * Not the group's name back. The name is what they called it when they had
   * three things in it; this is what it turned out to be once it had ten.
   */
  read: z.string().min(1).max(200),
  /** the work that falls out of it */
  steps: z
    .array(
      z.object({
        tempId: z.string().min(1).max(24),
        title: z.string().min(1).max(160),
        /** one line, in their language, for why this one and why now */
        why: z.string().max(200),
        effort: z.number().int().min(1).max(5),
        dependsOn: z.array(z.string().max(24)).max(6),
        /**
         * Could the app write the first version of this one?
         *
         * The comment at the top of this file has always said what happens to a
         * step once it lands — a question gets `answer it`, something makeable
         * gets `do it`, anything else gets `work it` — and nothing ever asked
         * the model which of those it had just written. The app worked it out
         * afterwards from the wording, by matching the opening against fifteen
         * English verbs, so "Linesheet copy for the Lyon mill" and "Ask the mill
         * for lead times" were never offered even though both are things it
         * could have drafted in ten seconds.
         *
         * Whoever wrote the step knows. This asks.
         */
        canDraft: z.boolean(),
      }),
    )
    .min(1)
    .max(7),
  /**
   * What it could not get from the material, and would need to be told.
   *
   * The honest alternative to inventing a step. A cloud of half-formed ideas
   * sometimes genuinely does not contain a next action, and saying which one
   * question would unlock it is worth more than five chores.
   */
  missing: z.array(z.string().max(200)).max(3),
  /** durable facts about them this reading turned up */
  learned: z.array(z.string().max(200)).max(3),
  /** one line for the app to say as it lands */
  note: z.string().max(200),
})

export type RainInput = z.infer<typeof Input>
export type RainOutput = z.infer<typeof Output>

export const rain: ActionDef<RainInput, RainOutput> = {
  name: 'rain',
  version: 1,
  // Smart, because condensing ten half-thoughts into the four things that
  // actually follow from them is the hardest judgement in the app — and cheap
  // anyway with no search and a small output.
  modelTier: 'smart',
  maxTokens: 2000,
  // It must not go and look anything up. This is their own material and the
  // web has never heard of it; searching would turn a two-second gesture into
  // a minute and bring back nothing about *this*. That is `work it`, and it is
  // one moon away.
  searchMaxUses: 0,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const inside = input.inside.length
      ? `\n\nWhat is in it:\n${input.inside.map((c) => `- ${c}`).join('\n')}`
      : ''
    const known = input.known.length
      ? `\n\nWhat they have said about these themselves:\n${input.known.map((k) => `- ${k}`).join('\n')}`
      : ''
    const found = input.found ? `\n\nWhat was already found out about it:\n${input.found}` : ''
    const already = input.already.length
      ? `\n\nAlready hanging under it as work — none of this again:\n${input.already.map((a) => `- ${a}`).join('\n')}`
      : ''
    return {
      system:
        baseSystem(ctx) +
        `\n\nA group of their thoughts has filled up and they have asked what falls out of it. You are ` +
        `condensing, not planning and not researching: everything you need is in front of you, it is their own ` +
        `material, and nothing on the open web knows anything about it.\n\n` +
        `The one thing you must not do is hand their own notes back with a verb in front. "Rough out X" where X ` +
        `is a thing they already wrote is not a step — it is the same thought wearing a hat, and a list of those ` +
        `is what this replaced. A step earns its place by saying something the pile did not already say: what ` +
        `these things have in common, what has to be true first, what the one decision is that the rest are ` +
        `waiting on, what can be closed out in an afternoon.\n\n` +
        `Read across the whole group rather than down it. Four ideas about a memory layer are not four tasks — ` +
        `they are one question about storage and one thing worth building to answer it. Two or three real steps ` +
        `beat seven tidy ones, and if the cloud genuinely does not contain a next action yet, say so in ` +
        `\`missing\` and return the one or two steps that do follow. Never pad to a number.`,
      user:
        `They called it: ${input.name}${inside}${known}${found}${already}\n\n` +
        `read: one plain line — what is this actually about, now that it has this much in it? Not the name back. ` +
        `If the group has turned into something more specific than what they called it, say the specific thing.\n` +
        `steps: what genuinely follows, at most 7 and usually fewer. Each one an action they take, small enough ` +
        `to sit down and start, phrased in their vocabulary. Order only where it truly matters, via dependsOn on ` +
        `your own tempIds. Effort 1 (a few minutes) to 5 (a week of real work).\n` +
        `  · Nothing that restates an item above. Not reworded, not merged, not "decide about" one of them.\n` +
        `  · Nothing generic. "Show it to someone", "sit with it", "make a plan" apply to every group ever ` +
        `made and so belong to none of them. If a step would still make sense under a different group's name, ` +
        `it is not a step.\n` +
        `  · canDraft: true if you could write a useful first version of this from what is in front of you — a ` +
        `note, an outline, a shortlist, an email, a brief, a set of questions to send someone. False for ` +
        `anything whose substance is out in the world and not on this page: booking, signing, paying, meeting, ` +
        `filing, phoning, going somewhere, deciding something only they can decide. Judge the work, not the ` +
        `wording — a step that opens with a noun can still be something you could draft.\n` +
        `missing: what you would have to be told to take this further — at most 3, and empty is the usual ` +
        `answer. Use it instead of inventing a step, never as well as one.\n` +
        `learned: anything durable about *them* this taught you. Not about this project. Omit if nothing.\n` +
        `note: one short line to say as it lands, in their language. What fell out, not that something did.`,
    }
  },
}
