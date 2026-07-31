// Look — read a wall of references and say what they are actually about.
//
// This is the one thing the app can do that nothing else in its market can.
//
// Milanote, Kosmik, Miro and the rest of the moodboard tools *hold* your
// references beautifully. That is the whole of it: they are surfaces where
// images look good next to each other. The board never has an opinion, so the
// hardest part of concept work — noticing what the eleven things you pinned
// have in common, and what is conspicuously missing from them — is still
// entirely yours, done from memory, usually at the end when it is too late to
// act on.
//
// So the move is not to hold references better. It is to read them:
//
//   "These eleven are all about light falling through fabric — and none of
//    them are about the clothes."
//
// That is a sentence no competitor in any band can produce, and it is exactly
// the sentence a designer needs at the concept stage.
//
// What it is not: a critique, a rating, or a description. Describing pictures
// back to the person who chose them is worthless — they were there. The value
// is entirely in the *across*: the thing that recurs and that nobody said out
// loud, and the gap that recurring thing leaves.
//
// It lands as a brief on the group, which means `rain` then gets it as `found`
// — so a moodboard can be read, and then rained into the work that follows
// from what it turned out to be about. Concept to execution, on pictures.
import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'

const Input = z.object({
  /** what they called the group, if they called it anything */
  name: z.string().max(300),
  /**
   * The references themselves.
   *
   * Small on purpose — these are the drop faces, not the full-size copies. A
   * gist is all this needs: palette, light, framing, subject, era. Anything
   * that turns on reading text in a picture is `ask` on that one picture,
   * which sends a legible copy of it.
   */
  images: z
    .array(
      z.object({
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
        dataB64: z.string().min(1).max(900000),
      }),
    )
    .min(2)
    .max(12),
  /** anything in the group that is words rather than a picture */
  alongside: z.array(z.string().max(300)).max(30),
  /** what they have already said about these themselves */
  known: z.array(z.string().max(600)).max(20),
})

const Output = z.object({
  /**
   * What the whole wall is about, in one line.
   *
   * The line they would have arrived at eventually. Not a list of subjects —
   * the thing underneath the subjects.
   */
  read: z.string().min(1).max(200),
  /** the two to four things that genuinely recur, each said once and plainly */
  threads: z
    .array(
      z.object({
        what: z.string().min(1).max(120),
        /** where it shows, in their own terms — never "in images 2, 5 and 9" */
        where: z.string().max(200),
      }),
    )
    .max(4),
  /**
   * What is not here.
   *
   * The sharpest thing this action produces and the reason it exists. A
   * reference wall is defined as much by its absences as its contents, and an
   * absence is precisely what you cannot see by looking at the wall — because
   * the thing you are looking for is not on it.
   */
  missing: z.array(z.string().max(200)).max(3),
  /** a name for the group, if theirs is a placeholder or plainly not it */
  name: z.string().max(60).nullable(),
  /** durable things about how this person sees, worth keeping */
  learned: z.array(z.string().max(200)).max(3),
  /** one short line to say as it lands */
  note: z.string().max(160),
})

export type LookInput = z.infer<typeof Input>
export type LookOutput = z.infer<typeof Output>

export const look: ActionDef<LookInput, LookOutput> = {
  name: 'look',
  version: 1,
  // Smart. Noticing what a set of pictures has in common — and what it is
  // missing — is a judgement, and a cheap model produces the description this
  // action exists not to produce.
  modelTier: 'smart',
  maxTokens: 1400,
  // Their own references. The web has never seen this wall.
  searchMaxUses: 0,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const alongside = input.alongside.length
      ? `\n\nWords in the same group:\n${input.alongside.map((a) => `- ${a}`).join('\n')}`
      : ''
    const known = input.known.length
      ? `\n\nWhat they have said about these themselves:\n${input.known.map((k) => `- ${k}`).join('\n')}`
      : ''
    return {
      system:
        baseSystem(ctx) +
        `\n\nThey have gathered ${input.images.length} visual references together and asked what they add up to. ` +
        `You are reading across the wall, not down it.\n\n` +
        `Do not describe the pictures. They chose them and they were there; a description hands their own eyes ` +
        `back to them and is worth nothing. Do not rate them, do not say which is strongest, and do not suggest ` +
        `references they should add. What you are looking for is the thing that runs through several of them that ` +
        `nobody has said out loud yet — the light, the distance, the era, the palette, what the frame is always ` +
        `doing, what the pictures are of when you stop noticing what they are of.\n\n` +
        `And then the harder half: what is not here. A reference wall is defined as much by its absences, and an ` +
        `absence is the one thing that cannot be seen by looking at the wall. If eleven images are about a mood ` +
        `and none of them show the product, that is the most useful sentence you can say.\n\n` +
        `Be specific enough to be wrong. "Moody and atmospheric" is true of every reference wall ever assembled ` +
        `and so says nothing about this one.`,
      user:
        `They called it: ${input.name || '(unnamed)'}${alongside}${known}\n\n` +
        `read: one plain line — what is this wall actually about? The line they would have got to eventually.\n` +
        `threads: at most 4, and fewer is better. Each one a thing that genuinely recurs, said once. \`where\` ` +
        `points at it in their language — what is happening in the pictures, never "images 2, 5 and 9".\n` +
        `missing: at most 3. What a wall like this has not got. Say it flatly; do not soften it into advice.\n` +
        `name: a better name for the group, or null if theirs is already right.\n` +
        `learned: anything durable about how *this person* sees — not about this project. Omit if nothing.\n` +
        `note: one short line to say as it lands, in their language.`,
      images: input.images,
    }
  },
}
