// Evaporate — what finishing something opened up.
//
// The app is built on a cycle, and the cycle had six stages and a decoration
// where the seventh should be. `evaporateAt()` in Atmosphere.tsx makes a small
// `div.vapor` and removes it 2.7 seconds later. That was the entire
// implementation of the stage that closes the loop, so the ocean only ever
// filled: work went in, nothing came back, and the "new thought" the diagram
// ends on had to come from you every single time.
//
// This is the honest version of it. You have just closed something out; it
// reads what that finishing makes possible or now demands, against what is
// still open, and returns **at most one droplet** — a real thought, in the sky,
// where a thought goes.
//
// One, and often none. That is the whole discipline of this action. A thing
// that returns three follow-ups every time you tick something off is not a
// cycle, it is a treadmill, and it would make finishing anything feel like
// being handed more. Most completions genuinely open nothing: the shoot is
// done, the loan came through, that is the end of it. Saying so is the
// commonest correct answer, and the prompt is written to make it the easy one.
import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Input = z.object({
  /** what was just closed out, in their words */
  finished: z.string().max(300),
  /** what was under it, so the reading is of the whole thing rather than a title */
  inside: z.array(z.string().max(300)).max(40),
  /** other things finished lately — the shape of where they actually are */
  lately: z.array(z.string().max(300)).max(15),
  /** what is still open, so it cannot hand back something they already have */
  open: z.array(z.string().max(300)).max(60),
})

const Output = z.object({
  /**
   * The one thing this finishing makes possible, or now demands.
   *
   * Null is the usual answer, and it is not a failure. Most work closes and
   * opens nothing.
   */
  rises: z
    .object({
      /** the thought itself, in their language, as they would have written it */
      title: z.string().min(1).max(200),
      /** one line: why finishing that thing is what puts this in the air */
      why: z.string().max(200),
      /** question · idea · action — what kind of thing it is */
      kind: z.enum(['question', 'idea', 'action']),
    })
    .nullable(),
  /** one short line for the app to say, whether or not anything rose */
  note: z.string().max(160),
})

export type EvaporateInput = z.infer<typeof Input>
export type EvaporateOutput = z.infer<typeof Output>

export const evaporate: ActionDef<EvaporateInput, EvaporateOutput> = {
  name: 'evaporate',
  version: 1,
  // It arrives on the back of a tick, so it has to be quick, and the judgement
  // — does anything actually follow from this? — is a small one made against
  // material that is entirely in the prompt.
  modelTier: 'fast',
  maxTokens: 700,
  // Their own map, and nothing on the web knows about it. Same reasoning as
  // rain: searching would turn a beat into a wait and bring back nothing.
  searchMaxUses: 0,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const inside = input.inside.length
      ? `\n\nWhat was in it:\n${input.inside.map((c) => `- ${c}`).join('\n')}`
      : ''
    const lately = input.lately.length
      ? `\n\nAlso finished recently:\n${input.lately.map((c) => `- ${c}`).join('\n')}`
      : ''
    const open = input.open.length
      ? `\n\nStill open — none of this back, in any wording:\n${input.open.map((c) => `- ${c}`).join('\n')}`
      : ''
    return {
      system:
        baseSystem(ctx) +
        `\n\nThey have just finished something and closed it out. Your only job is to say whether that finishing ` +
        `put anything new in the air.\n\n` +
        `Nothing is the usual answer. Most work closes and opens nothing: the shoot happened, the loan came ` +
        `through, that is the end of it. Return \`rises: null\` and say so plainly. Handing someone a fresh task ` +
        `every time they tick one off is not a cycle, it is a treadmill, and it makes finishing things feel like ` +
        `being given more.\n\n` +
        `Return something only when finishing this genuinely changed what is possible or what is now owed — a ` +
        `door it opened, a decision it forced, a question that could not be asked until now and can be asked ` +
        `today. Never a tidy-up, never a "review how it went", never the next obvious phase of the same project, ` +
        `and never anything that is already on their open list in different words.`,
      user:
        `They finished: ${input.finished}${inside}${lately}${open}\n\n` +
        `rises: at most one thing, or null. If it is a thing, write it the way they would have written it ` +
        `themselves — their vocabulary, no framing, no "consider". kind is what it actually is: a question if it ` +
        `is something to find out, an idea if it is something to think about, an action if it is something to do. ` +
        `why: one line saying what about finishing this puts it in the air.\n` +
        `note: one short line to say as it lands. If nothing rose, say what they finished is simply done — do ` +
        `not apologise for having nothing, and do not congratulate them.`,
    }
  },
}
