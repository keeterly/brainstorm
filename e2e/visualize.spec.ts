// Principle 1 — help you visualize your ideas.
//
// The sky is the answer to that, and the honest question is not "does it look
// good" but "how much of your thinking can you actually see, and can you read
// it". Both are measurable, and neither had ever been measured.
//
// Sized against the real graph rather than the demo: 79 open thoughts, ten of
// them loose in the sky, the other 87% inside fourteen groups. So a check that
// only ever looks at a handful of bubbles is not checking the thing that is
// used.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright'
import { backToSky, bubbles, emptySky, goInside, groups, open, serve, settled, write } from './harness'

const BUILD = fileURLToPath(new URL('./.build', import.meta.url))

let site: Awaited<ReturnType<typeof serve>>
let app: Awaited<ReturnType<typeof open>>
let page: Page

beforeAll(async () => {
  site = await serve(BUILD)
  app = await open(site.url)
  page = app.page
}, 180_000)

afterAll(async () => {
  await app?.close()
  await site?.close()
})

/** Every bubble's text, as it is actually drawn on the glass. */
const drawn = () =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.skyb')]
      .filter((e) => e.dataset.id && e.dataset.id !== '__invite' && !e.classList.contains('recede'))
      .map((e) => {
        const t = e.querySelector('.t')
        const r = t?.getBoundingClientRect()
        return {
          id: e.dataset.id as string,
          // computed, so it is what the browser resolved rather than what the
          // stylesheet asked for. In world units — the camera scales the whole
          // field, so a comfortable size here can be nothing on the glass, and
          // the caller multiplies by the zoom to find out.
          px: t ? parseFloat(getComputedStyle(t).fontSize) : 0,
          onGlass: r ? Math.round(r.width) : 0,
          words: (t?.textContent ?? '').trim().length,
        }
      }),
  )

/** How far the camera is standing back. */
const zoom = () =>
  page.evaluate(() => {
    const f = document.querySelector('[data-sky="field"]')
    return f ? new DOMMatrix(getComputedStyle(f).transform).a : 1
  })

describe('what you can see of your own thinking', () => {
  it('draws something legible at the size the sky actually opens at', async () => {
    /*
     * The type on a drop asks for `max(10.5, min(19, 6 + r × 0.105))` in world
     * units and the camera multiplies it, so legibility is a product — and what
     * `drawn` reads is the computed size, which is that product already held
     * against the floor in `.skyb .t`. Both halves are recorded, because the
     * world size drifting up is how you would notice the floor doing work.
     */
    const k = await zoom()
    const all = await drawn()
    const onScreen = all.map((b) => b.px * k)
    const smallest = Math.min(...onScreen)
    console.log(
      `  ${all.length} bubbles, camera at ${k.toFixed(2)}× — type from ` +
        `${Math.min(...all.map((b) => b.px)).toFixed(1)}px to ${Math.max(...all.map((b) => b.px)).toFixed(1)}px in world, ` +
        `${smallest.toFixed(1)}px smallest on screen`,
    )
    // 8px is already uncomfortably small on a phone held at arm's length; below
    // it there is no reading, only shapes
    expect(smallest, 'a bubble’s words are too small to read').toBeGreaterThanOrEqual(8)
  })

  it('does not draw one thing on top of another', async () => {
    // the whole promise of a place is that things are somewhere; two bubbles
    // sharing a spot is two ideas you cannot tell apart
    await settled(page)
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.skyb')]
        .filter((e) => e.dataset.id && e.dataset.id !== '__invite' && !e.classList.contains('recede'))
        .map((e) => {
          const r = e.getBoundingClientRect()
          return { id: e.dataset.id as string, x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width / 2 }
        }),
    )
    const on: string[] = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        // discs, not boxes: the elements are square and the things are round,
        // so a corner overlap is not an overlap
        if (d < (a.r + b.r) * 0.82) on.push(`${a.id}/${b.id} ${Math.round(d)}px apart`)
      }
    }
    expect(on, `bubbles are sitting on each other: ${on.join(', ')}`).toHaveLength(0)
  })

  it('keeps what is inside a group out of the sky until you go in', async () => {
    /*
     * This is the 87%. It is the design — a group collapses, or the sky is a
     * list — but it means the screen for seeing what you have is showing you a
     * fraction of it, and that fraction should be a known number rather than a
     * surprise.
     */
    const [g] = await groups(page)
    expect(g, 'the demo world has no group in it').toBeTruthy()
    const before = Object.keys(await bubbles(page)).length
    await goInside(page, g)
    const inside = Object.keys(await bubbles(page)).length
    console.log(`  ${before} bubbles in the sky; going into one group reveals ${inside - before} more`)
    expect(inside).toBeGreaterThan(before)
    await backToSky(page)
  })

  // Held back once on a fear that turned out not to be true: that two deep,
  // with the ring running off the side, there might be no open water left to
  // tap and so no way back out. Of everything this suite looked for that was
  // the one that would have frightened me most, and it does not happen — there
  // is water at 30,170 on every opening measured. Live, because it is the check
  // that would say so if it ever started to.
  it('goes into a group inside a group, and comes back out one level at a time', async () => {
    /*
     * The case the real graph is full of and the journey never reaches: the
     * demo has a wall of references nested inside the campaign. Out of a
     * sub-group is into the group that held it, not all the way to the surface
     * — going three deep and being thrown to the top is a loss.
     */
    const [outer] = await groups(page)
    await goInside(page, outer)
    const inner = (await groups(page)).find((id) => id !== outer)
    expect(inner, 'nothing nested to go into').toBeTruthy()
    await goInside(page, inner as string)
    const deep = await page.evaluate(() => document.querySelectorAll('.skyb.recede').length)
    expect(deep, 'going deeper did not put anything behind you').toBeGreaterThan(0)
    await backToSky(page)
    expect(await page.evaluate(() => document.querySelectorAll('.skyb.recede').length)).toBe(0)
  })

  it('says which group you are standing in', async () => {
    // a place you can be lost in is not a place you can think in — and the
    // only thing that names where you are is the group's own bubble, so it has
    // to be on the glass and readable
    const [g] = await groups(page)
    await goInside(page, g)
    const named = await page.evaluate((id) => {
      const el = document.querySelector<HTMLElement>(`[data-id="${id}"]`)
      if (!el || el.classList.contains('recede')) return null
      const r = el.getBoundingClientRect()
      const t = (el.querySelector('.t')?.textContent ?? '').trim()
      const onGlass = r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight
      return t && onGlass ? t : null
    }, g)
    expect(named, 'nothing on screen says which group you are inside').toBeTruthy()
    await backToSky(page)
  })

  it('stays legible and stays on the glass as the sky fills up', async () => {
    /*
     * The week, walked one thought at a time, which is the way thinking actually
     * arrives and the way nothing was ever measured.
     *
     * Two things are being squeezed at once. `radiusOf` shrinks a loose drop by
     * `min(22, (loose − 5) × 2.5)` down to a floor of 36, and `fitAll` pulls the
     * camera back, down to 0.35× — different units, no shared floor, which is
     * how the type walked 9.3px down to 8.0px over eight thoughts and would have
     * kept going. And `fitAll` only ever ran on a burst of three or more, so
     * writing one at a time re-framed nothing: measured at eight, a group sat at
     * x = 407 on a glass 393 wide, in a settled sky, with nothing said about it.
     * You write something and something else silently leaves the screen, which
     * is the exact opposite of what a sky is for.
     *
     * Both numbers are traced at every step, so the point at which the sky stops
     * working is written down rather than guessed at.
     *
     * "Off the glass" is deliberately not "a pixel over the edge". A round body
     * whose rim crosses the bezel is what every phone screen looks like, and it
     * is entirely readable and entirely tappable. What the audit actually caught
     * was a group at x = 407 on a glass 393 wide — its *middle* past the edge,
     * which is a thought you can neither read nor tap. That is the line, and it
     * is drawn at the half: a body more than half gone is gone.
     *
     * The raw overhangs are printed on every run whatever the verdict, because
     * the framing does not yet hold everything flush and pretending otherwise
     * would be the suite hiding a number it can see. Measured after the framing
     * work: usually nothing over at all, sometimes twenty pixels of a sixty-four
     * pixel drop for a second or two before the re-frame catches it.
     */
    await backToSky(page)
    const trace: string[] = []
    const over: string[] = []
    const lost: string[] = []
    for (let i = 0; i < 8; i++) {
      await write(page, `Filler thought number ${i + 1} for the crowding measurement`)
      const k = await zoom()
      const all = await drawn()
      const smallest = Math.min(...all.map((b) => b.px * k))
      const edges = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.skyb')]
          .filter((e) => e.dataset.id && e.dataset.id !== '__invite' && !e.classList.contains('recede'))
          .map((e) => {
            const r = e.getBoundingClientRect()
            const px = Math.round(Math.max(-r.left, -r.top, r.right - innerWidth, r.bottom - innerHeight))
            const cx = r.x + r.width / 2
            const cy = r.y + r.height / 2
            return {
              words: (e.querySelector('.t')?.textContent ?? '').slice(0, 22),
              px,
              // the two that mean you have lost it: no middle to aim at, or
              // most of it gone
              gone: cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight || px > Math.min(r.width, r.height) / 2,
            }
          })
          .filter((x) => x.px > 0),
      )
      trace.push(`${all.length}: ${smallest.toFixed(1)}px`)
      if (edges.length) over.push(`at ${all.length}, ${edges.map((o) => `“${o.words}” ${o.px}px`).join(' and ')}`)
      for (const e of edges.filter((x) => x.gone)) lost.push(`at ${all.length} thoughts, “${e.words}” ${e.px}px over`)
    }
    console.log(`  smallest text on screen as the sky fills — ${trace.join(', ')}`)
    console.log(`  bodies crossing the edge — ${over.join('; ') || 'none, at any count'}`)
    console.log(`  …and none of them more than half gone: ${lost.length === 0}`)
    const last = Number(trace[trace.length - 1].split(': ')[1].replace('px', ''))
    expect(last, `text has shrunk past reading: ${trace.join(', ')}`).toBeGreaterThanOrEqual(8)
    expect(lost, `writing a thought pushed another off the screen: ${lost.join('; ')}`).toHaveLength(0)
  }, 180_000)

  /*
   * This once caught the group you had just gone into sitting at 408,468 on a
   * screen 393 wide, and was read as the ring being sized to the world rather
   * than the window. It is not that. The ring is the one thing that goes on
   * being laid out while you stand inside a group; what was also running was
   * the whole sky's layout, arranging itself under you and walking the group
   * out from under the camera that had just been aimed at it — which is why it
   * happened on some openings and not others. `busy` now counts being inside a
   * group as a reason to hold still, and this is the check that watches it.
   */
  it('keeps what is in an open group on the glass and reachable', async () => {
    /*
     * Going into a group lays its contents out on a ring around it. Measured
     * here rather than asserted from the source, because where the ring lands
     * depends on where the drops were and varies between openings — which is
     * exactly the shape of thing a source pin cannot hold.
     *
     * A member you cannot reach is a thought you cannot open, which is the whole
     * of what going into a group is for.
     */
    await backToSky(page)
    const [g] = await groups(page)
    await goInside(page, g)
    await settled(page)
    const trouble = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.skyb')]
        .filter((e) => e.dataset.id && e.dataset.id !== '__invite' && !e.classList.contains('recede'))
        .map((e) => {
          const r = e.getBoundingClientRect()
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          const off =
            r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight
              ? `${Math.round(Math.max(-r.left, -r.top, r.right - innerWidth, r.bottom - innerHeight))}px off`
              : ''
          const under = top && !(top === e || e.contains(top)) ? 'under something' : ''
          return { words: (e.querySelector('.t')?.textContent ?? '').slice(0, 24), off, under }
        })
        .filter((x) => x.off || x.under),
    )
    if (trouble.length) {
      console.log(`  in an open group: ${trouble.map((t) => `“${t.words}” ${[t.off, t.under].filter(Boolean).join(' and ')}`).join('; ')}`)
    }
    const unreachable = trouble.filter((t) => t.under)
    expect(unreachable, `a member cannot be tapped: ${unreachable.map((t) => t.words).join(', ')}`).toHaveLength(0)
    await backToSky(page)
  }, 120_000)

  // The same thing, measured for how often rather than whether. An opening that
  // works most times is the worst shape a defect can have, and it is the shape
  // the one above had — so the check above is not enough on its own.
  it('does that every time, not most times', async () => {
    /*
     * Where the ring lands is not the same twice — the drops start at random
     * places and the layout settles from there — so opening a group once and
     * finding everything reachable proves very little. This opens it repeatedly
     * and fails if any single opening strands a member, because from where you
     * are sitting the bad opening is the only one that matters.
     */
    const [g] = await groups(page)
    const bad: string[] = []
    for (let round = 1; round <= 6; round++) {
      await backToSky(page)
      await goInside(page, g)
      await settled(page)
      const stranded = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.skyb')]
          .filter((e) => e.dataset.id && e.dataset.id !== '__invite' && !e.classList.contains('recede'))
          .filter((e) => {
            const r = e.getBoundingClientRect()
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            const covered = !!top && !(top === e || e.contains(top))
            const outside = r.right < 8 || r.left > innerWidth - 8 || r.bottom < 8 || r.top > innerHeight - 8
            return covered || outside
          })
          .map((e) => (e.querySelector('.t')?.textContent ?? '').slice(0, 24)),
      )
      if (stranded.length) bad.push(`opening ${round}: ${stranded.join(', ')}`)
    }
    if (bad.length) console.log(`  ${bad.length} of 6 openings stranded something — ${bad.join(' | ')}`)
    expect(bad, `a member was out of reach on some openings: ${bad.join(' | ')}`).toHaveLength(0)
    await backToSky(page)
  }, 180_000)

  it('is still readable when it frames the whole sky', async () => {
    /*
     * The case the two numbers meet in, and the one thing this suite found that
     * was real.
     *
     * The type on a drop was floored at 10.5px *in world units* and the camera
     * at `MIN_K = 0.35`, neither written knowing about the other, so the size on
     * the glass was a product nobody had bounded: framing fourteen bubbles put
     * the smallest words at 8.0–8.2px and still falling, and an ordinary week is
     * more than fourteen. `.skyb .t` now takes `max(--fs, 9px / --k)` — the
     * world size normally, and never under nine on the glass however far the
     * camera stands back.
     *
     * Framing everything is one double-tap on open water and is exactly what you
     * do when you want to see what you have, which is the whole of principle
     * one. Whatever this measures is the real answer to "can you read your sky".
     */
    await backToSky(page)
    const water = await emptySky(page)
    expect(water, 'no open water to double-tap').toBeTruthy()
    const [x, y] = water as [number, number]
    await page.mouse.click(x, y)
    await page.waitForTimeout(120)
    await page.mouse.click(x, y)
    await settled(page)
    const k = await zoom()
    const all = await drawn()
    const smallest = Math.min(...all.map((b) => b.px * k))
    console.log(
      `  framed: ${all.length} bubbles, camera at ${k.toFixed(2)}×, smallest text ${smallest.toFixed(1)}px on screen`,
    )
    expect(smallest, `framing the whole sky leaves text at ${smallest.toFixed(1)}px`).toBeGreaterThanOrEqual(8)
  }, 120_000)

  it('never threw anything while being looked at', async () => {
    expect(app.errors, app.errors.join(' | ')).toHaveLength(0)
  })
})
