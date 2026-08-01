import { z } from 'zod'
import { baseSystem, type ActionDef } from '../types'
import { isWebUrl } from '../url'

// Find more like this one.
//
// The action that should have existed the first time somebody put a photograph
// on the map and asked for more of them. What happened instead was `answer`:
// it read the picture, went out and searched, and came back with four
// paragraphs about Berlinde De Bruyckere — accurate, well sourced, and not
// what was asked for. The reply to "find me more inspiration like this" is
// pictures. An essay about the pictures is a different thing that nobody
// asked for, and dressing it up as the answer is the app deciding it knows
// better.
//
// So this one is forbidden from writing prose. What it returns is a list of
// *specific works, each with a page you can open* — and the server fetches
// each of those pages and reads its own declared hero image out of it, so what
// lands in the app is a wall of the actual work rather than a list of links.
// See netlify/functions/_lib/reach.ts, which is the half that turns URLs into
// pictures.
//
// The queries are the other half, and they matter as much. No index the model
// can reach is as good at "more like this" as an image search a person drives
// themselves, so it also writes the searches worth running — phrased the way
// somebody who knew the field would phrase them, which is most of the value a
// reference search has.

const Input = z.object({
  /** what the picture is attached to, for context */
  subject: z.object({
    id: z.string(),
    title: z.string().max(300),
    summary: z.string().max(600).nullable().optional(),
  }),
  /** what stands around it on the map — the collection this is a reference for */
  context: z.array(z.string().max(300)).max(30),
  /** the goal it hangs under, in the user's words */
  under: z.string().max(300).optional(),
  /** anything they typed when they asked */
  intent: z.string().max(600).optional(),
  /** the picture itself. Required: this action has nothing to do without it. */
  image: z.object({
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    dataB64: z.string().min(16),
  }),
})

const Output = z.object({
  /**
   * What the picture actually is, in one line.
   *
   * Not a description — a placement. "A black-shrouded seated figure in a
   * white gallery" is what it looks like; "a cloth-draped figure sculpture in
   * the De Bruyckere / Moore lineage" is what it *is*, and only the second is
   * any use for finding more of them.
   */
  reading: z.string().min(1).max(200),
  /**
   * Specific works, each with a page that shows it.
   *
   * Real, sourced, findable. A museum's page for the piece, a gallery's page
   * for the show, an institution's collection record. Not a search result
   * page, not a home page, not an aggregator — the page for the *work*, which
   * is the page that declares the work as its own image.
   */
  finds: z
    .array(
      z.object({
        title: z.string().min(1).max(140),
        /** who made it */
        who: z.string().max(100),
        /** and where it is, or when it was shown */
        where: z.string().max(120),
        /** the one thing it shares with the photograph */
        why: z.string().max(160),
        url: z.string().max(600),
      }),
    )
    .max(12)
    // Dropped, not refused — the same rule `sources` follows. A minute of
    // searching should not be thrown away over one malformed link, and a
    // repair retry is a poor answer to a URL the model was never going to
    // fix. What survives is the finds that are real.
    .transform((rows) => rows.filter((r) => isWebUrl(r.url))),
  /**
   * …and the searches worth running, for the part no list can cover.
   *
   * The most useful thing here is often vocabulary: somebody looking for this
   * would search "shrouded figure sculpture textile" and get nowhere, and
   * would search "Berlinde De Bruyckere blanket sculpture" and find the field.
   */
  searches: z.array(z.string().min(1).max(120)).max(6),
})

export type FindLikeInput = z.infer<typeof Input>
export type FindLikeOutput = z.infer<typeof Output>

export const findLike: ActionDef<FindLikeInput, FindLikeOutput> = {
  name: 'find_like',
  // 2: the pages have to show the work, not describe it — a page with no
  // picture on it arrives as a hole in a wall of pictures
  version: 2,
  modelTier: 'smart',
  maxTokens: 3000,
  // It is looking for things that exist, so it has to go and look. Three is
  // enough: the first identifies the lineage and the rest find the works.
  searchMaxUses: 3,
  // a minute of searching, so it runs where a locked phone cannot interrupt it
  background: true,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    const around = input.context.length
      ? `\nAround it on their map:\n${input.context.map((c) => `- ${c}`).join('\n')}`
      : ''
    const under = input.under ? `\nIt sits under: ${input.under}` : ''
    const asked = input.intent?.trim() ? `\nThey said: "${input.intent.trim()}"` : ''
    return {
      system:
        baseSystem(ctx) +
        `\n\nRight now you are finding more pictures like one they already have. You are not writing about it.\n\n` +
        `Read the image first and place it: medium, lineage, the specific formal move it is making. Then search ` +
        `for real works that make the same move, and return the page for each one.\n\n` +
        `Every url must be a page that **shows the work as a picture**, not a page that describes it. That is the ` +
        `whole test, and it is worth being fussy about: what they get back is a wall of the images those pages ` +
        `carry, so a page with no picture of the piece on it arrives as a hole in the wall.\n\n` +
        `Pages that reliably show the work: a museum's collection record for the object, Wikipedia or Wikimedia ` +
        `Commons for the piece or the series, a gallery's page for that specific show, an institution's press ` +
        `page for the exhibition. Pages that reliably do not: a home page, a search results page, an artist's ` +
        `index of everything they have made, a news article about a sale, a PDF, an image aggregator or a stock ` +
        `library. Prefer the page you actually saw in the search results over a tidier-looking URL you assembled ` +
        `from a pattern — the assembled one is usually a 404, and a 404 is a hole too.\n\n` +
        `If you are not sure a page exists and shows the piece, leave it out. Six real ones beat twelve with ` +
        `six holes in them.\n\n` +
        `Do not describe the image back to them. They can see it. Do not explain the artists at length — one ` +
        `line each on what it shares with their picture, and nothing else. The pictures are the answer.`,
      user:
        `Find more like this.\n\n` +
        `It is a reference on: ${input.subject.title}` +
        `${input.subject.summary ? `\n${input.subject.summary}` : ''}${under}${around}${asked}\n\n` +
        `reading: what this picture is, in one line — the lineage and the move, not the description. ` +
        `They can see what it looks like.\n` +
        `finds: real works that share that move, most alike first. For each: title, who made it, where it is or ` +
        `when it was shown, why it belongs beside theirs in one line, and a page that shows the work as a ` +
        `picture. Up to twelve, and fewer pages that really carry the image is better than more that only ` +
        `mention it.\n` +
        `searches: two to six image searches worth running, in the words somebody who knows this field would ` +
        `use. Include the proper names — the movement, the artists, the material — because those are what make ` +
        `the difference between a search that finds the field and one that finds nothing.`,
      images: [input.image],
    }
  },
}
