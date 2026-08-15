// Driving the real app, in a real browser, on a phone-shaped screen.
//
// Everything else in this repo tests the app by reading it. The unit tests read
// the domain, which is honest because the domain is importable; `css.test.ts`
// reads `SkyPage.tsx` as a *string*, which is the only handle anybody has on an
// eight-thousand-line imperative closure — it pins decisions along with the
// reason for them, so a silent revert fails loudly. What none of it can do is
// notice that a control renders and is covered, that a page opens and paints
// nothing, or that a tap is wired to the wrong handler. Those have to be found
// by opening the app, and until now they were found by hand, in throwaway
// scripts, in a temp directory that does not survive the session.
//
// This is that, kept. Everything below is a thing a throwaway probe had to
// rediscover, with the reason it is here.
import { chromium, type Browser, type Page } from 'playwright'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

/** The phone this app is used on. */
export const PHONE = { width: 393, height: 852 }

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
}

/**
 * Serve a built directory, with no dependency on anything.
 *
 * A single-page app served off the filesystem needs exactly two behaviours:
 * real files where they exist, and index.html for everything else. That is
 * thirty lines, and thirty lines is cheaper than a dependency that has to be
 * kept current, installed in CI, and understood by whoever reads this next.
 */
export async function serve(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer(async (req, res) => {
    const raw = decodeURIComponent((req.url ?? '/').split('?')[0])
    // …and it may not climb out of the directory it was pointed at
    const rel = normalize(raw).replace(/^(\.\.[/\\])+/, '')
    for (const candidate of [join(dir, rel), join(dir, 'index.html')]) {
      try {
        const body = await readFile(candidate)
        res.writeHead(200, { 'content-type': TYPES[extname(candidate)] ?? 'application/octet-stream' })
        res.end(body)
        return
      } catch {
        /* fall through to the shell */
      }
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

/**
 * A browser standing in for the phone.
 *
 * No `executablePath`. Every throwaway probe hard-coded the one in this
 * container, and that path does not exist on a CI runner —
 * `PLAYWRIGHT_BROWSERS_PATH` is what resolves it correctly in both places.
 */
export async function open(url: string): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  const browser: Browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: PHONE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    /*
     * Without this the suite measures a sky that is not running.
     *
     * Headless Chromium reports `prefers-reduced-motion: reduce`, and the sky
     * reads that as permission to skip everything: `glide` eases at 1 instead
     * of 0.22, the breath is switched off, departures do not stagger. A probe
     * written against that browser sees an app nobody uses.
     */
    reducedMotion: 'no-preference',
  })
  const page = await ctx.newPage()
  // A thrown exception in the frame loop leaves the sky frozen and looking
  // fine. Collected rather than thrown, so a test can assert on them and a
  // failure names the error instead of a timeout.
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  await page.goto(url, { waitUntil: 'networkidle' })
  await boot(page)
  return { page, errors, close: () => browser.close() }
}

/**
 * Wait out the opening.
 *
 * The app fades its name up over the sky for a beat before dissolving — and
 * the curtain takes the first gesture with it, so anything done before this
 * returns is thrown away. It is a real screen, not a spinner: waiting for the
 * network to be idle is not the same as waiting for it to have gone.
 */
export async function boot(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.skyb').length > 0, null, { timeout: 20_000 })
  // it unmounts itself rather than fading to nothing and staying, so its
  // absence is the honest signal
  await page.waitForFunction(() => !document.querySelector('.opening'), null, { timeout: 20_000 })
  await settled(page)
}

/** Where every bubble is drawn, in the field's own space — the camera lives on
 *  the field itself, so this is free of any camera motion. Reading screen
 *  coordinates instead conflates the two, which cost a whole re-measure once. */
export async function bubbles(page: Page): Promise<Record<string, [number, number]>> {
  return page.evaluate(() => {
    const out: Record<string, [number, number]> = {}
    for (const el of document.querySelectorAll<HTMLElement>('.skyb')) {
      const id = el.dataset.id
      if (!id || id === '__invite') continue
      const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(el.style.transform)
      if (m) out[id] = [+m[1] + el.clientWidth / 2, +m[2] + el.clientHeight / 2]
    }
    return out
  })
}

/**
 * Wait until the sky stops moving, rather than waiting a while and hoping.
 *
 * The layout is a settling one: springs, separation, a breath that never stops.
 * Every throwaway probe slept for a guessed number of milliseconds, which is
 * how a suite becomes flaky on a slow machine and slow on a fast one. This
 * watches instead, and gives up loudly.
 */
export async function settled(page: Page, quietMs = 500, timeoutMs = 15_000): Promise<void> {
  const started = Date.now()
  let last = await bubbles(page)
  let quietSince = Date.now()
  for (;;) {
    await page.waitForTimeout(120)
    const now = await bubbles(page)
    // the breath alone is a couple of pixels and never stops, so "still" has to
    // mean still enough rather than identical
    const moved = Object.keys(now).some((id) => {
      const a = last[id]
      const b = now[id]
      return !a || Math.hypot(a[0] - b[0], a[1] - b[1]) > 3
    })
    last = now
    if (moved) quietSince = Date.now()
    else if (Date.now() - quietSince >= quietMs) return
    if (Date.now() - started > timeoutMs) throw new Error('the sky never settled')
  }
}

/**
 * Wait for an open page to have finished arriving.
 *
 * `.on` is added when the page *starts* opening: the front travels for the
 * better part of a second, the rows ride a layer that slides, and the field is
 * focused only once it has all passed. Measuring in that window reads numbers
 * that are true for a frame — a row's tick can be a hundred and sixty pixels
 * off the left edge on its way in, which looks exactly like a control that
 * cannot be reached and is nothing of the kind. Ask again when it has stopped.
 */
export async function pageReady(page: Page, timeoutMs = 10_000): Promise<void> {
  await page.waitForSelector('[data-sky="page"].on', { timeout: timeoutMs })
  const where = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.pans .row')].map((r) => Math.round(r.getBoundingClientRect().x)).join(','),
    )
  const started = Date.now()
  let last = await where()
  let quietSince = Date.now()
  for (;;) {
    await page.waitForTimeout(100)
    const now = await where()
    if (now !== last) quietSince = Date.now()
    last = now
    if (Date.now() - quietSince >= 400) return
    if (Date.now() - started > timeoutMs) throw new Error('the page never stopped moving')
  }
}

/** Tap a thing the way a thumb would — at the middle of where it is drawn. */
export async function tap(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`nothing to tap at ${selector}`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

/**
 * Is this actually reachable by a finger?
 *
 * `toBeVisible` answers a different question. A control can be painted, have a
 * size, pass every visibility check, and still be under something — which is
 * precisely the failure that source pins cannot see and that a person hits
 * immediately.
 */
export async function tappable(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return !!top && (top === el || el.contains(top) || top.contains(el))
  }, selector)
}

/**
 * A patch of open water, with room around it.
 *
 * Not merely a pixel with nothing on it. The sky breathes and drifts, and a
 * hold takes the better part of a second — so a point that is clear when it is
 * chosen can have a bubble over it by the time the finger goes down, and then
 * the gesture opens that bubble instead of the writing sheet. Everything
 * downstream then fails somewhere else entirely, which is a miserable thing to
 * debug and did in fact happen here.
 *
 * So it wants a clear disc, not a clear point, and the caller checks again
 * immediately before pressing.
 */
export async function emptySky(page: Page, margin = 26): Promise<[number, number] | null> {
  return page.evaluate((m) => {
    const clear = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      return !!el && !el.closest('.skyb') && !el.closest('button') && !el.closest('.sky-page')
    }
    for (let y = 170; y < 560; y += 10) {
      for (let x = 30; x < 364; x += 10) {
        if (
          clear(x, y) &&
          clear(x - m, y) &&
          clear(x + m, y) &&
          clear(x, y - m) &&
          clear(x, y + m)
        ) {
          return [x, y] as [number, number]
        }
      }
    }
    return null
  }, margin)
}

/** Hold empty sky, which is how you write. */
export async function write(page: Page, text: string): Promise<void> {
  // …and the sky has to be still first, or the water chosen here has drifted
  // under something by the time the finger has finished pressing on it
  await settled(page)
  const spot = await emptySky(page)
  if (!spot) throw new Error('no open water to write on')
  await page.mouse.move(spot[0], spot[1])
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  /*
   * Type until it sticks.
   *
   * `.on` lands the moment the page *starts* opening, and it goes on arranging
   * itself for another half-second after that — filling the field with whatever
   * draft was being held. Text typed into that gap is overwritten and then
   * committed as nothing: a capture that silently does not happen, which is
   * exactly what this suite caught on its first run.
   *
   * Waiting for the field to take focus would be the tidier signal and does not
   * work: a headless browser does not always give the page focus at all. So it
   * types, checks, and types again until the app stops arguing.
   */
  await pageReady(page)
  const field = page.locator('[data-sky="pageT"]')
  for (let attempt = 0; ; attempt++) {
    await field.fill(text)
    await page.waitForTimeout(250)
    if ((await field.inputValue()) === text) break
    if (attempt >= 12) throw new Error('the page kept overwriting what was typed into it')
  }
  await tap(page, '[data-sky="pageD"]')
  // …and the page takes its own time going away again
  await page.waitForFunction(() => !document.querySelector('[data-sky="page"].on'), null, { timeout: 5000 })
  await settled(page)
}

/** What the app has just said, at the foot of the sky. */
export async function said(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('.sky-voice')?.textContent?.trim() ?? '')
}
