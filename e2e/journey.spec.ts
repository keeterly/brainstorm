// The loop, as the person who uses this app describes it:
//
//   "I jot down ideas and organize them by thought bubbles. Then when I want to
//    work on them I focus on the group and check off what I can."
//
// Four moves — jot, group, open, tick — and everything else in the app is in
// service of them. This walks all four with nothing but gestures a person could
// find without being told, and it is the one test that should never be allowed
// to fail: if this breaks, the app does not work, whatever else is green.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright'
import { emptySky, open, pageReady, said, serve, settled, tap, tappable, write } from './harness'

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

const count = () =>
  page.evaluate(
    () => [...document.querySelectorAll('.skyb')].filter((e) => (e as HTMLElement).dataset.id !== '__invite').length,
  )

describe('jot → group → open → tick', () => {
  it('opens onto a sky with your thinking already in it', async () => {
    // the opening is a beat, not a screen you have to get past — `boot` waits
    // for it to take itself away, and if it never does this fails here
    expect(await count()).toBeGreaterThan(0)
    expect(app.errors, app.errors.join(' | ')).toHaveLength(0)
  })

  it('lets you write by holding the empty sky, and nothing else', async () => {
    // the one gesture the app teaches out loud, because it is the only one you
    // could not guess. If holding open water stops opening the sheet, there is
    // no way into the app at all.
    const before = await count()
    await write(page, 'A test thought and the line that finishes it')
    expect(await count()).toBe(before + 1)
  })

  it('says what it did with what you wrote', async () => {
    // silence after a capture is the app taking something and not saying where
    expect(await said(page)).not.toBe('')
  })

  it('offers a way back out of a capture', async () => {
    // the one gesture that *makes* something offered nothing for a year; a
    // capture you did not mean had no way out but hunting the thing down
    const bar = await page.evaluate(() => document.querySelector('.sky-undo.show')?.textContent?.trim() ?? '')
    expect(bar).toMatch(/take it back|keep it loose/)
  })

  it('goes inside a group when you tap one', async () => {
    const group = await page.evaluate(
      () => ([...document.querySelectorAll('.skyb.pool')][0] as HTMLElement | undefined)?.dataset.id ?? null,
    )
    expect(group, 'the demo world has no group in it').toBeTruthy()
    await tap(page, `[data-id="${group}"]`)
    await settled(page)
    // everything that is not this group steps back — that is what "inside" is
    expect(await page.evaluate(() => document.querySelectorAll('.skyb.recede').length)).toBeGreaterThan(0)
  })

  it('opens the group itself on the second tap', async () => {
    const group = await page.evaluate(
      () => ([...document.querySelectorAll('.skyb.pool:not(.recede)')][0] as HTMLElement | undefined)?.dataset.id ?? null,
    )
    await tap(page, `[data-id="${group}"]`)
    await pageReady(page)
    const rows = await page.evaluate(() => document.querySelectorAll('.pans .row').length)
    expect(rows, 'the group opened with nothing in it').toBeGreaterThan(0)
  })

  it('lets you check something off, and shows that you did', async () => {
    // The end of the loop, and the reason for all of it.
    //
    // The tick is aimed at with a real tap rather than clicked in the DOM, so
    // this also asserts that the most-pressed control on the page is somewhere
    // a thumb can actually land.
    //
    // …once the page has stopped arriving, and once the row is scrolled to.
    // Rows ride a layer that slides in, so a tick measured on its way past reads
    // as 129 pixels off the left edge of the glass; and a list long enough to
    // scroll has rows above the fold, which `tappable` reports as unreachable
    // because from where it is standing they are. Both look exactly like a
    // control nobody can press, and neither is one. A person waits for the page
    // and scrolls to the row; so does this, and then asks.
    const tick = '.pans .row:not(.ticked) .tick'
    await pageReady(page)
    await page.locator(tick).first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    const before = await page.evaluate(() => document.querySelectorAll('.pans .row.ticked').length)
    expect(await tappable(page, tick), 'the tick is not reachable').toBe(true)
    await tap(page, tick)
    await page.waitForTimeout(900)
    const after = await page.evaluate(() => document.querySelectorAll('.pans .row.ticked').length)
    expect(after).toBe(before + 1)
  })

  it('gets you back to the sky the way you came', async () => {
    await tap(page, '[data-sky="pageX"]')
    await page.waitForTimeout(1200)
    expect(await page.evaluate(() => !document.querySelector('[data-sky="page"].on'))).toBe(true)
    const water = await emptySky(page)
    if (water) {
      await page.mouse.click(water[0], water[1])
      await settled(page)
    }
    expect(await page.evaluate(() => document.querySelectorAll('.skyb.recede').length)).toBe(0)
  })

  it('walked the whole loop without throwing anything', async () => {
    // an exception in the frame loop leaves the sky frozen and looking fine
    expect(app.errors, app.errors.join(' | ')).toHaveLength(0)
  })

  it('never needed a control that was not reachable', async () => {
    /*
     * The failure a source pin cannot see: painted, sized, and underneath
     * something else.
     *
     * Only the ones that are meant to be there the whole time. The pen yields
     * its slot whenever the app is speaking or offering something — one voice
     * in one place — so asserting it is always tappable would be asserting the
     * opposite of the design.
     */
    expect(await tappable(page, '[data-sky="find"]'), 'find is not reachable by a finger').toBe(true)
  })

  it('always leaves one pen you can reach', async () => {
    /*
     * There are two, and only ever one of them at a time. The bar that says
     * what to do next carries a pen on its end; the bare pen stands in the same
     * slot for a sky with nothing to say, and steps aside whenever the bar or
     * the app's own voice is using it — one message in one place. Which of them
     * is up is not the point. That neither of them is would mean no way to
     * write without first finding open water, which is the gesture nobody
     * guesses.
     */
    await page.waitForFunction(() => !document.querySelector('.sky-voice.show'), null, { timeout: 15_000 })
    const pens = ['[data-sky="write"]', '[data-sky="nextPen"]']
    const reachable = await Promise.all(pens.map((p) => tappable(page, p)))
    expect(reachable.filter(Boolean).length, `neither pen is reachable (${pens.join(', ')})`).toBeGreaterThan(0)
  })
})
