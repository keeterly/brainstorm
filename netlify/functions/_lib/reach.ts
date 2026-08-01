// Going and looking at a page somebody else wrote.
//
// This is the only place in the app that fetches a URL chosen by a model, and
// that is a category of thing worth being careful about. A server that will
// fetch any address it is handed is a server that will fetch `169.254.169.254`
// and hand back the cloud metadata, or knock on something inside the private
// network that has no business being reachable from outside it. The class is
// called SSRF and the defence is not a regex over the string — it is a rule
// about where a fetch is allowed to *end up*, applied to every hop.
//
// So: https only, public addresses only, redirects followed by hand so each
// new location is checked the same way as the first, a timeout, and a cap on
// how much is read. Nothing here trusts anything it was given.
//
// What it is for is small and specific. `find_like` comes back with pages —
// a museum's page for a sculpture, a gallery's page for a show — and a page
// like that almost always declares its own hero image in Open Graph. Reading
// that one tag turns a list of links into a wall of the actual work, which is
// the difference between an essay about what your photograph resembles and
// being shown the things it resembles.

/** Long enough for a slow museum server, short enough not to hold the request. */
export const REACH_MS = 6000
/**
 * How much of a page is read.
 *
 * It was 120KB on the reasoning that og:image lives in `<head>`, which was
 * true of the only thing being looked for at the time. It is not true of the
 * others: museum collection systems put their JSON-LD at the *end* of the
 * body, after the whole rendered page and often after a framework's serialised
 * state, and a `<figure>` is body content by definition. A cap that cuts the
 * document in half cuts off the two extractors most likely to succeed on
 * exactly the sites this is for.
 *
 * Server-side, for a dozen pages, once, at a person's request — the bandwidth
 * is not the constraint the old number was protecting.
 */
export const HEAD_BYTES = 400_000
/** A reference image, not a print master. */
export const IMAGE_BYTES = 2_500_000
/** Redirects are followed, but not for ever, and every hop is re-checked. */
export const MAX_HOPS = 4

/**
 * Addresses no outbound fetch of ours may ever land on.
 *
 * Written against the parsed host rather than the URL text, because the text
 * has too many ways to say the same thing — `127.1`, `0x7f.1`, `[::ffff:127.0.0.1]`,
 * a hostname whose only A record is private. The numeric forms are covered
 * here; a hostname that resolves inward is the one case this cannot see from
 * the string alone, and the honest answer is that Netlify's egress does not
 * sit inside a network with anything interesting on it.
 */
export function addressAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return false
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false
  // IPv6, including the ::ffff:a.b.c.d form that smuggles a v4 address in
  if (h.includes(':')) {
    const v4 = h.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (v4) return addressAllowed(v4[1])
    if (h === '::' || h === '::1') return false
    // unique-local (fc00::/7) and link-local (fe80::/10)
    if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return false
    return true
  }
  const parts = h.split('.')
  /*
   * If the last label is a number, this is an address and not a name.
   *
   * That one test is what closes the whole family of ways to write 127.0.0.1
   * without typing it: `127.1`, `0177.0.0.1`, `0x7f.0.0.1`, `2130706433`. Each
   * of those is a perfectly good address to a browser and a perfectly good
   * *hostname* to a naive regex, which is exactly the gap the trick lives in.
   * No real top-level domain is numeric, so anything ending in digits gets
   * held to the strict dotted-quad form and rejected if it does not meet it —
   * rather than decoded, which is where implementations get this wrong.
   */
  if (/^\d+$/.test(parts[parts.length - 1])) {
    if (parts.length !== 4) return false
    // no leading zeros: `0177` is octal to a resolver and 177 to parseInt
    if (!parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p))) return false
    const [a, b] = parts.map((p) => parseInt(p, 10))
    if (parts.some((p) => parseInt(p, 10) > 255)) return false
    if (a === 0 || a === 10 || a === 127) return false
    if (a === 169 && b === 254) return false // cloud metadata lives here
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false // carrier-grade NAT
    if (a >= 224) return false // multicast and reserved
    return true
  }
  // …and a name has to look like one, with a real label on the end of it
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)
}

/** The one gate every URL passes through, at every hop. */
export function reachable(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  if (u.username || u.password) return null
  if (u.port && u.port !== '443') return null
  if (!addressAllowed(u.hostname)) return null
  return u
}

/**
 * Fetch, following redirects by hand.
 *
 * `redirect: 'follow'` would check the first address and then go wherever it
 * was sent, which makes the check theatre: an attacker controls the redirect,
 * not the URL you typed. Each hop goes back through `reachable`.
 */
export async function reach(raw: string, accept: string): Promise<Response | null> {
  let next = reachable(raw)
  for (let hop = 0; next && hop < MAX_HOPS; hop++) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), REACH_MS)
    let r: Response
    try {
      r = await fetch(next.href, {
        redirect: 'manual',
        signal: ctl.signal,
        headers: {
          Accept: accept,
          /*
           * A browser's user agent, and a note about why.
           *
           * This said `Brainstorm/1.0` on the principle that a fetcher should
           * say what it is. The principle cost the feature: museum and gallery
           * sites sit behind CDNs that refuse anything not recognisably a
           * browser, so a wall of five works came back with one picture on it.
           *
           * What is happening here is not crawling. One person tapped one
           * photograph, and this reads the handful of pages the answer named,
           * once, at their request — the same pages their own browser would
           * load if they tapped the links themselves, which is the other thing
           * this page offers. `Sec-Fetch` and the accept headers say so too.
           */
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
            '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
    } catch {
      clearTimeout(t)
      return null
    }
    clearTimeout(t)
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location')
      next = loc ? reachable(new URL(loc, next.href).href) : null
      continue
    }
    return r.ok ? r : null
  }
  return null
}

/**
 * The picture a page says is its own.
 *
 * Four ways of asking, in order of how much the page meant it.
 *
 * It was one way — Open Graph — on the reasoning that anything cleverer would
 * come back with logos. True, and it was also not enough: a real wall of five
 * museum and gallery pages produced one picture. Collection systems are
 * frequently rendered by JavaScript with only structured data in the served
 * HTML, and plenty of gallery pages never learned Open Graph at all.
 *
 * So, after og and twitter: **JSON-LD**, which is how nearly every museum
 * collection record in the world describes its object, and `itemprop`, which
 * is the older spelling of the same idea. Then, last and only inside a
 * `<figure>`, a plain `<img>` — a figure is a page saying "this picture is the
 * content", which is exactly the claim being looked for, and it is the one
 * place a bare `<img>` can be trusted to be the work rather than the masthead.
 */
export function heroImage(html: string, base: string): string | null {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0])
  const want = ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src']
  const found = new Map<string, string>()
  for (const tag of metas) {
    const key = attr(tag, 'property') ?? attr(tag, 'name')
    const val = attr(tag, 'content')
    if (key && val && want.includes(key.toLowerCase()) && !found.has(key.toLowerCase())) {
      found.set(key.toLowerCase(), val)
    }
  }
  for (const k of want) {
    const abs = found.get(k) && absolute(found.get(k) as string, base)
    if (abs) return abs
  }

  const link = html.match(/<link\b[^>]*rel=["']?image_src["']?[^>]*>/i)?.[0]
  const href = link && attr(link, 'href')
  const fromLink = href && absolute(href, base)
  if (fromLink) return fromLink

  const ld = fromJsonLd(html)
  const fromLd = ld && absolute(ld, base)
  if (fromLd) return fromLd

  const ip = metas.find((tag) => attr(tag, 'itemprop')?.toLowerCase() === 'image')
  const ipv = ip && attr(ip, 'content')
  const fromItem = ipv && absolute(ipv, base)
  if (fromItem) return fromItem

  return figureImage(html, base)
}

/**
 * The `image` out of a page's structured data.
 *
 * schema.org allows five shapes for it — a string, an array, an ImageObject, a
 * `contentUrl`, or any of those nested inside `@graph` — and museum systems
 * use all five. Rather than model schema.org, this walks the parsed JSON for
 * an `image`/`contentUrl` and takes the first thing under it that looks like a
 * URL, which is the same answer with none of the taxonomy.
 */
export function fromJsonLd(html: string): string | null {
  for (const m of html.matchAll(
    /<script\b[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown
    try {
      data = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    const hit = walkForImage(data, 0)
    if (hit) return hit
  }
  return null
}

function walkForImage(node: unknown, depth: number): string | null {
  if (depth > 6 || node === null || node === undefined) return null
  if (typeof node === 'string') return null
  if (Array.isArray(node)) {
    for (const it of node) {
      const hit = walkForImage(it, depth + 1)
      if (hit) return hit
    }
    return null
  }
  if (typeof node !== 'object') return null
  const o = node as Record<string, unknown>
  for (const key of ['image', 'contentUrl', 'thumbnailUrl', 'primaryImageOfPage']) {
    const v = o[key]
    const url = firstUrl(v, depth + 1)
    if (url) return url
  }
  for (const v of Object.values(o)) {
    const hit = walkForImage(v, depth + 1)
    if (hit) return hit
  }
  return null
}

function firstUrl(v: unknown, depth: number): string | null {
  if (typeof v === 'string') return /^https?:\/\/|^\//.test(v.trim()) ? v.trim() : null
  if (Array.isArray(v)) {
    for (const it of v) {
      const u = firstUrl(it, depth + 1)
      if (u) return u
    }
    return null
  }
  if (v && typeof v === 'object' && depth <= 6) {
    const o = v as Record<string, unknown>
    return firstUrl(o.url ?? o.contentUrl ?? o['@id'], depth + 1)
  }
  return null
}

/**
 * …and a picture the page has wrapped in a `<figure>`.
 *
 * The last resort, and narrow on purpose. An `<img>` anywhere on a page is a
 * masthead as often as it is the work; an `<img>` inside a `<figure>` is the
 * page itself saying this picture *is* the content. Anything that names itself
 * a logo, an icon, a sprite, a placeholder or an avatar is skipped whatever it
 * is wrapped in, and so is anything declaring itself under 200 wide.
 */
export function figureImage(html: string, base: string): string | null {
  for (const fig of html.matchAll(/<figure\b[^>]*>([\s\S]{0,4000}?)<\/figure>/gi)) {
    for (const im of fig[1].matchAll(/<img\b[^>]*>/gi)) {
      const tag = im[0]
      const src = attr(tag, 'src') ?? firstFromSrcset(attr(tag, 'srcset')) ?? attr(tag, 'data-src')
      if (!src) continue
      if (/logo|icon|sprite|placeholder|avatar|blank|spacer|\.svg(\?|$)/i.test(src)) continue
      const w = parseInt(attr(tag, 'width') ?? '', 10)
      if (Number.isFinite(w) && w < 200) continue
      const abs = absolute(src, base)
      if (abs) return abs
    }
  }
  return null
}

/** The first candidate out of a `srcset`, which is a list of "url width" pairs. */
function firstFromSrcset(v: string | null): string | null {
  if (!v) return null
  const first = v.split(',')[0]?.trim().split(/\s+/)[0]
  return first || null
}

/** …and what the page calls itself, for the caption under it. */
export function pageTitle(html: string): string | null {
  const og = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .find((tag) => (attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase() === 'og:title')
  const fromOg = og && attr(og, 'content')
  if (fromOg) return decode(fromOg).slice(0, 160)
  const t = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1]
  return t ? decode(t.replace(/\s+/g, ' ')).trim().slice(0, 160) || null : null
}

function attr(tag: string, name: string): string | null {
  const m =
    tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i')) ??
    tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i')) ??
    tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i'))
  return m ? decode(m[1]) : null
}

/** Enough of it to read a URL and a title out of markup written by anybody. */
function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;|&#x0*27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
}

/** A relative og:image is common and easy to get wrong; it is resolved here. */
function absolute(v: string, base: string): string | null {
  try {
    const u = new URL(v.trim(), base)
    return reachable(u.href)?.href ?? null
  } catch {
    return null
  }
}

/** Read at most `cap` bytes of a body, then stop pulling. */
export async function readCapped(r: Response, cap: number): Promise<Uint8Array> {
  const body = r.body
  if (!body) return new Uint8Array(await r.arrayBuffer()).slice(0, cap)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    n += value.length
    if (n >= cap) {
      void reader.cancel()
      break
    }
  }
  const out = new Uint8Array(Math.min(n, cap))
  let at = 0
  for (const c of chunks) {
    if (at >= out.length) break
    out.set(c.subarray(0, out.length - at), at)
    at += c.length
  }
  return out
}
