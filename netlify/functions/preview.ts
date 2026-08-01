// POST /api/preview — turn a list of pages into a wall of pictures.
//
// `find_like` comes back with works and the page for each one. A list of links
// is not what anybody asked for; the pictures are. So this goes to each page,
// reads the image the page itself declares — Open Graph, then structured data,
// then a figure — and hands back the URL of it. The app draws them.
//
// Four ways of asking rather than one, because one was not enough: a real wall
// of five museum and gallery pages came back with a single picture on it. See
// heroImage, which has the reasoning and the order.
//
// And `mode: 'keep'` fetches the bytes of one image, so a reference can be
// pulled onto the map and still be there when the page it came from is gone.
// The browser cannot do that itself: a cross-origin image taints the canvas,
// so there is no way to read one back out on the client.
//
// Everything about where a fetch may land lives in _lib/reach.ts, including
// the reasoning. Nothing here trusts a URL because a model produced it.
import { z } from 'zod'
import { corsHeaders, originAllowed } from './_lib/guard'
import { verifyUser } from './_lib/auth'
import { HEAD_BYTES, IMAGE_BYTES, heroImage, pageTitle, reach, readCapped } from './_lib/reach'

const BodySchema = z.object({
  mode: z.enum(['cards', 'keep']).default('cards'),
  /** pages to read, for `cards`; exactly one image, for `keep` */
  urls: z.array(z.string().max(600)).min(1).max(12),
})

/** What one page turned out to be. */
interface Card {
  url: string
  image: string | null
  title: string | null
}

const json = (status: number, body: unknown, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Read one page and pull the picture it says is its own. */
async function card(url: string): Promise<Card> {
  const r = await reach(url, 'text/html,application/xhtml+xml')
  if (!r) return { url, image: null, title: null }
  // A missing content-type is not a reason to give up — plenty of older
  // gallery servers send none at all, and the parsers below simply find
  // nothing if it turns out not to be markup. Only an explicit *other* type is
  // worth refusing, and the one that matters is a PDF.
  const type = r.headers.get('content-type') ?? ''
  if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
    return { url, image: null, title: null }
  }
  const head = new TextDecoder().decode(await readCapped(r, HEAD_BYTES))
  // `r.url` is not set on a manual-redirect fetch, so relative URLs resolve
  // against the address we asked for — which, after reach()'s hand-rolled
  // redirect loop, is the one we actually ended up at.
  return { url, image: heroImage(head, url), title: pageTitle(head) }
}

export default async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' }, cors)
  if (!originAllowed(req)) return json(403, { error: 'Forbidden' }, cors)

  // Signed in, like everything else. This fetches on the app's behalf and a
  // fetcher anybody may drive is a fetcher somebody will drive.
  const user = await verifyUser(req)
  if (!user) return json(401, { error: 'Sign in first' }, cors)

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch {
    return json(400, { error: 'Bad request body' }, cors)
  }

  if (body.mode === 'keep') {
    const r = await reach(body.urls[0], 'image/*')
    if (!r) return json(502, { error: 'could not fetch that image' }, cors)
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    // Only the four the app can draw, and only what the server says it is —
    // the extension on the URL is a claim by whoever wrote the link.
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) {
      return json(415, { error: 'that link is not an image' }, cors)
    }
    const bytes = await readCapped(r, IMAGE_BYTES)
    if (!bytes.length) return json(502, { error: 'that image was empty' }, cors)
    const b64 = Buffer.from(bytes).toString('base64')
    return json(200, { dataUrl: `data:${type};base64,${b64}`, bytes: bytes.length }, cors)
  }

  // All at once: twelve museum pages one after another is a minute, and in
  // parallel it is as slow as the slowest of them. Each one already carries
  // its own timeout, so the whole call is bounded whatever they do.
  const cards = await Promise.all(body.urls.map((u) => card(u).catch(() => ({ url: u, image: null, title: null }))))
  return json(200, { cards }, cors)
}

export const config = { path: '/api/preview' }
