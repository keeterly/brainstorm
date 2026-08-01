// Find more like this one, and come back with pictures.
//
// The shape is two steps and the second one is the point. The model finds real
// works and the page for each; the server then reads each page's own declared
// image and hands the URLs back, so what lands on screen is a wall of the work
// rather than a list of links. A reference search that returns links is a
// research task; one that returns pictures is a moodboard.
//
// Nothing here is written to the graph on its own. Pictures arrive, you look
// at them, and the ones worth keeping are kept by you — see `keepImage`. The
// app does not get to decide which references belong on your map.
import { supabase } from '@/lib/supabase'
import { runAction } from '@/ai/client'
import { DEMO, DEMO_PREVIEW } from '@/lib/demo'
import type { FindLikeOutput } from '@shared/ai/actions/find-like'
import type { Sizing } from './gaugeFlow'

/** One work, and the picture of it if its page had one. */
export interface Find {
  title: string
  who: string
  where: string
  why: string
  url: string
  /** the page's own hero image, once it has been read. null = it had none. */
  image: string | null
}

export type FindResult =
  | { kind: 'found'; reading: string; finds: Find[]; searches: string[]; runId: string | null }
  /** it went and looked and there was nothing real to show */
  | { kind: 'nothing'; reading: string; searches: string[] }
  | { kind: 'failed'; why?: string }

async function authHeader(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? `Bearer ${token}` : null
}

/**
 * Read a set of pages and pull out the picture each one declares.
 *
 * Best-effort by design: a page that is down, or slow, or has no Open Graph on
 * it comes back with `image: null` and simply does not appear on the wall. One
 * dead museum link must not cost the other eleven.
 */
export async function previewPages(urls: string[]): Promise<Map<string, { image: string | null; title: string | null }>> {
  const out = new Map<string, { image: string | null; title: string | null }>()
  if (!urls.length) return out
  // The demo has no server to read pages with, and a wall with no pictures on
  // it is exactly the failure this whole feature exists to end.
  if (DEMO) {
    for (const u of urls) {
      const image = DEMO_PREVIEW[u]
      if (image) out.set(u, { image, title: null })
    }
    return out
  }
  const auth = await authHeader()
  if (!auth) return out
  try {
    const r = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ mode: 'cards', urls: urls.slice(0, 12) }),
    })
    if (!r.ok) return out
    const body = (await r.json()) as { cards: { url: string; image: string | null; title: string | null }[] }
    for (const c of body.cards ?? []) out.set(c.url, { image: c.image, title: c.title })
  } catch {
    /* a wall with no pictures on it is still a list of real works */
  }
  return out
}

/**
 * Fetch one image as something that can be stored.
 *
 * The browser cannot do this itself. A cross-origin image drawn to a canvas
 * taints it, so there is no way to read the pixels back out on the client, and
 * a reference kept as a remote URL stops being a reference the day the gallery
 * reorganises its site. So the bytes come back through the server and are kept
 * the same way a photograph from the camera roll is kept.
 */
export async function keepImage(url: string): Promise<string | null> {
  if (DEMO) return null
  const auth = await authHeader()
  if (!auth) return null
  try {
    const r = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ mode: 'keep', urls: [url] }),
    })
    if (!r.ok) return null
    const body = (await r.json()) as { dataUrl?: string }
    return body.dataUrl ?? null
  } catch {
    return null
  }
}

export async function findLikeThis(
  subject: { id: string; title: string; summary?: string | null },
  image: { mediaType: string; dataB64: string },
  opts: { context?: string[]; under?: string; intent?: string; sizing?: Sizing } = {},
): Promise<FindResult> {
  let out: FindLikeOutput
  let runId: string | null = null
  try {
    const res = await runAction<FindLikeOutput>(
      'find_like',
      {
        subject: { id: subject.id, title: subject.title, summary: subject.summary ?? null },
        context: (opts.context ?? []).slice(0, 30),
        under: opts.under,
        intent: opts.intent?.trim() || undefined,
        image,
      },
      opts.sizing ? { searches: opts.sizing.searches } : {},
    )
    out = res.output
    runId = res.runId
  } catch (e) {
    const why = (e as Error)?.message
    return { kind: 'failed', why: why && why.length < 90 ? why.toLowerCase() : undefined }
  }

  const seen = new Set<string>()
  const wanted = out.finds.filter((f) => {
    const k = f.url.trim()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const shots = await previewPages(wanted.map((f) => f.url))
  const finds: Find[] = wanted.map((f) => ({
    title: f.title,
    who: f.who,
    where: f.where,
    why: f.why,
    url: f.url,
    image: shots.get(f.url)?.image ?? null,
  }))
  // Pictures first, then the rest. A work whose page kept its image is worth
  // more here than one that is only a link, and sorting rather than dropping
  // means a page that simply has no Open Graph on it is still findable.
  finds.sort((a, b) => Number(!!b.image) - Number(!!a.image))
  if (!finds.length) return { kind: 'nothing', reading: out.reading, searches: out.searches }
  return { kind: 'found', reading: out.reading, finds, searches: out.searches, runId }
}

/**
 * A search somebody can actually run, for the part no list covers.
 *
 * Images, not web — the whole point is to look at things. It goes to the
 * browser rather than staying in the app because no index this app can reach
 * competes with the one everybody already has, and pretending otherwise would
 * be the same mistake as answering a request for pictures with prose.
 */
export function imageSearchUrl(q: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`
}
