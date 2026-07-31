import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'
import { sourceList } from '../url'

// Answer — for the things on your map that are not work, they are questions.
//
// "Pull live Google Flights / ITA Matrix fares for LAX→CDG premium economy,
// Sept 28 out / Oct 9 back." That is not a task. Nobody wants to *do* it. What
// they want is the number. Handing that back a plan — "1. Open ITA Matrix.
// 2. Enter your dates." — is the app describing the errand instead of running
// it, and it is what ⚡ did to every question on the map, because deepen only
// knows how to produce steps.
//
// So this one is forbidden from producing steps. It goes and finds out, and
// what comes back is the answer: the figure, the requirement, the date, the
// name — with what it is as of, and what it could not pin down.
//
// That last part is not a formality. Some questions genuinely cannot be
// answered off the open web: a live fare lives behind a query nobody can run
// for you. The honest answer there is the real range, the real sources, and the
// one thing you have to do yourself to get the exact number — not silence, and
// not a made-up price.

const Ref = z.object({
  id: z.string(),
  title: z.string().max(300),
  type: z.string().max(30).optional(),
  summary: z.string().max(600).nullable().optional(),
  due: z.string().nullable().optional(),
})

const Input = z.object({
  subject: Ref,
  /** what stands around it — the siblings and the goal that give the question
   *  its frame. "Fares for LAX→CDG" means something different under "SS27
   *  Lookbook" than it does on its own. */
  context: z.array(z.string().max(300)).max(40),
  /** the goal it hangs under, in the user's words */
  under: z.string().max(300).optional(),
  /** anything they typed when they asked */
  intent: z.string().max(2000).optional(),
  /**
   * A question *about* the subject rather than the subject itself.
   *
   * "Memory architecture proof of concept" is not a question, and there was no
   * way to stand in front of it and ask what mem 2.0 is. When this is set it is
   * the thing being answered and the subject becomes the frame around it —
   * which is most of what makes the answer worth having, because "what is mem
   * 2.0" asked while looking at a memory architecture is a narrower question
   * than the same five words on their own.
   */
  question: z.string().max(600).optional(),
  image: z
    .object({
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      dataB64: z.string().min(16),
    })
    .optional(),
})

const Output = z.object({
  /** the question as it actually reads, said back plainly */
  asked: z.string().min(1).max(200),
  /** the answer. Leads with the specific thing — the number, the name, the
   *  date — not with a description of the topic. */
  answer: z.string().min(1).max(900),
  /** the concrete part, pulled out so it can be read in one glance */
  facts: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        value: z.string().min(1).max(140),
        note: z.string().max(180).optional(),
      }),
    )
    .max(8),
  /** how fresh this is, and how fast it goes off */
  asOf: z.string().max(160),
  /** what could not be pinned down, and the one thing that would pin it */
  unknown: z
    .array(
      z.object({
        what: z.string().min(1).max(200),
        toKnow: z.string().max(220),
      }),
    )
    .max(4),
  /** only what the answer genuinely creates. Usually nothing. */
  next: z
    .array(
      z.object({
        tempId: z.string().min(1).max(24),
        title: z.string().min(1).max(160),
        why: z.string().max(200),
        effort: z.number().int().min(1).max(5),
      }),
    )
    .max(3),
  sources: sourceList(10),
  /** durable facts about this person, worth remembering next time */
  learned: z.array(z.string().max(200)).max(3),
  /** whether asking this is now finished — the answer is in hand and there is
   *  nothing left of it to do */
  settled: z.boolean(),
})

export type AnswerInput = z.infer<typeof Input>
export type AnswerOutput = z.infer<typeof Output>

export const answer: ActionDef<AnswerInput, AnswerOutput> = {
  name: 'answer',
  // 2: a question can now be *about* the subject rather than be it
  version: 2,
  modelTier: 'smart',
  maxTokens: 6000,
  // A question is narrower than a brief, so it converges sooner: four searches
  // on one figure is three re-readings of the same page.
  searchMaxUses: 3,
  // still a minute of looking things up, so it runs where a locked phone
  // cannot interrupt it
  background: true,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const s = input.subject
    const around = input.context.length
      ? `\nAround it on their map:\n${input.context.map((c) => `- ${c}`).join('\n')}`
      : ''
    const under = input.under ? `\nIt sits under: ${input.under}` : ''
    const asked = input.intent?.trim() ? `\nThey added: "${input.intent.trim()}"` : ''
    const q = input.question?.trim()
    const picture = input.image
      ? `\nAn image is attached — it is part of the question. Read what is actually in it and answer about that.`
      : ''
    return {
      system:
        baseSystem(ctx) +
        `\n\nRight now you are answering one question, not planning one. Search the web first — the answer is ` +
        `expected to contain things they did not tell you. Prefer primary and official sources, and say what ` +
        `each figure is as of.\n\n` +
        `You are forbidden from handing back the errand. "Open ITA Matrix and enter your dates" is not an ` +
        `answer; the fare is. If the exact figure is behind something you cannot reach, give the real range you ` +
        `can source, say plainly that it is a range and why, and put the one thing that would settle it in ` +
        `\`unknown\` — never invent a precise number to look decisive.`,
      user:
        (q
          ? `Answer their question.\n\n"${q}"\n\nThey asked it while looking at this, which is the frame ` +
            `for it and not the question — answer what they asked, about this.\n\n`
          : `Answer this.\n\n`) +
        `[${s.id}] ${s.title}${s.type ? ` (${s.type})` : ''}${s.summary ? `\n${s.summary}` : ''}` +
        `${s.due ? `\ndue ${s.due}` : ''}${under}${around}${asked}${picture}\n\n` +
        `asked: the question as it actually reads, in one plain line. If the wording is shorthand, say the full ` +
        `question it stands for.\n` +
        `answer: the answer itself, two to five sentences. Open with the specific thing — the figure, the name, ` +
        `the date, the yes or no. Then only what is needed to use it. No preamble, no restating the question, ` +
        `no encouragement.\n` +
        `facts: the concrete part, one row each, so it can be read at a glance. At most 8. Label short, value ` +
        `specific ("$1,180–$1,420 round trip", "Air France AF65, 777-300ER"). Note is one line of what makes that row ` +
        `matter. Skip the row entirely rather than pad it.\n` +
        `asOf: when this is true as of, and how quickly it moves. Say it in their terms — "fares checked today; ` +
        `these move daily" beats an ISO date.\n` +
        `unknown: only what you genuinely could not settle. For each, the one specific thing that would settle ` +
        `it — the query to run, the person to ask, the page to log into. Empty is a good answer.\n` +
        `next: leave this empty unless the answer itself created real work that is not already on their map. At ` +
        `most three, each small enough to sit down and do. An answer is not an excuse to add tasks.\n` +
        `sources: what you actually used, with real URLs from the search results.\n` +
        `learned: anything durable you now know about *them* — how they travel, what they are building, what ` +
        `they already hold. Not about this question. Nothing you were already told. Omit if nothing.\n` +
        `settled: true if knowing this is the whole of it and the item can be closed; false if they still have ` +
        `to act on what you found.`,
      images: input.image ? [input.image] : undefined,
    }
  },
}
