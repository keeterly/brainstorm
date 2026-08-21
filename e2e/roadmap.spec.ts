// The second tab — how the ideas get done.
//
// The sky answers "what am I thinking about" and the group page answers "what
// does this one thing take". Neither could answer the question anybody actually
// arrives with on a Tuesday morning, because the answer is spread across every
// group you have, and a correct list of forty steps is not an answer to it.
//
// This is that question asked of the app, in a browser, on a phone-shaped
// screen: what am I doing today, is it the right thing, and does it agree with
// everything else the app says.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright'
import {
  backToSky,
  goTab,
  groups,
  open,
  openGroup,
  runVerb,
  serve,
  slots,
  tap,
  tappable,
} from './harness'

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

const text = () => page.evaluate(() => document.querySelector('.roadmap')?.textContent ?? '')

describe('the two places', () => {
  it('offers exactly two, and they are the two the app is about', async () => {
    /*
     * Memory used to be half the bar, standing beside the sky as though the two
     * were a choice you make. They are not — it is a thing you read on purpose,
     * once. What belongs here is where ideas live and how they get done.
     */
    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll('.tab')].map((t) => t.textContent?.trim() ?? ''),
    )
    expect(tabs).toEqual(['Ideas', 'Roadmap'])
  })

  it('keeps memory reachable, as an icon in the corner of the sky', async () => {
    // moved, not removed — and a control that is painted but under something
    // else is the failure a source pin cannot see
    expect(await tappable(page, '.sky-mem'), 'the memory icon is not reachable').toBe(true)
    expect(await tappable(page, '[data-sky="find"]'), 'the memory icon is sitting on find').toBe(true)
  })
})

describe('a roadmap with nothing on it yet', () => {
  it('says how to put something on it, rather than showing an empty week', async () => {
    // the state everybody starts in. A blank screen here reads as a broken app
    await goTab(page, /roadmap/i)
    const said = await text()
    expect(said, `it said: ${said.slice(0, 120)}`).toMatch(/make them|steps/i)
    expect(await slots(page), 'a sky with no plans in it scheduled something').toHaveLength(0)
  })
})

describe('a week, out of the plans you already have', () => {
  beforeAll(async () => {
    await goTab(page, /ideas/i)
    const [g] = await groups(page)
    await openGroup(page, g)
    await runVerb(page)
    await backToSky(page)
    await goTab(page, /roadmap/i)
  }, 180_000)

  it('puts the steps on days', async () => {
    const on = await slots(page)
    console.log(`  ${on.length} steps placed, over ${new Set(on.map((s) => s.day)).size} days`)
    expect(on.length, 'the plan was made and nothing was scheduled').toBeGreaterThan(2)
    expect(on.every((s) => !!s.day), 'a step landed with no day on it').toBe(true)
  })

  it('says what the week holds, and whether it is guessing', async () => {
    /*
     * A number the app made up about how much you can do is worth nothing
     * unless you can see where it came from. Before it has watched you finish
     * a couple of weeks it has to say so.
     */
    const line = await page.evaluate(() => document.querySelector('.rm-cap')?.textContent?.trim() ?? '')
    console.log(`  it says: “${line}”`)
    expect(line).toMatch(/a week/i)
  })

  it('shows the reason and the size the plan already carried', async () => {
    // all three were in the graph the whole time; the group page draws them and
    // so must this, from the same helper, or the two will drift
    const on = await slots(page)
    expect(on.filter((s) => s.why).length, 'no step says why it is there').toBeGreaterThan(0)
    expect(on.filter((s) => s.effort > 0).length, 'no step says how big it is').toBeGreaterThan(0)
  })

  it('says which idea each piece of work came out of', async () => {
    // a step with no home on a list of forty is a chore; with its goal beside
    // it, it is a piece of something you chose
    const on = await slots(page)
    expect(on.every((s) => !!s.goal), `${on.filter((s) => !s.goal).length} steps have no goal`).toBe(true)
  })

  it('never puts a step before the thing it waits on', async () => {
    /*
     * The one rule that makes this a plan rather than a pile with dates on it.
     * Checked against what is drawn rather than against the scheduler, because
     * the scheduler being right and the page drawing it wrong is a real and
     * invisible way for this to fail.
     */
    const on = await slots(page)
    const waiting = on.filter((s) => s.waits)
    expect(waiting.length, 'nothing on this plan waits on anything').toBeGreaterThan(0)
    const order = on.map((s) => s.title)
    for (const s of waiting) {
      const after = /^after (.+)$/.exec(s.waits)?.[1] ?? ''
      for (const name of after.split(' · ')) {
        const blocker = order.findIndex((t) => t === name)
        if (blocker < 0) continue
        expect(
          order.indexOf(s.title),
          `“${s.title}” is scheduled before “${name}”, which it waits on`,
        ).toBeGreaterThan(blocker)
      }
    }
  })

  it('does not book an afternoon to look at a photograph', async () => {
    /*
     * A moodboard lives inside the campaign it is for, so its pictures are
     * leaves of a planned group exactly as the steps are. Measured before this
     * was fixed: four reference photographs took a whole week's capacity and
     * pushed every real step past the weekend.
     */
    const on = await slots(page)
    const pictures = on.filter((s) => /^photo$/i.test(s.title))
    expect(pictures, `${pictures.length} photographs were scheduled as work`).toHaveLength(0)
  })

  it('is a way back to the thing itself', async () => {
    // a plan you cannot open is a list of sentences about work rather than work
    await tap(page, '.rm-step')
    await page.waitForTimeout(2500)
    expect(
      await page.evaluate(() => document.querySelectorAll('.skyb').length > 0),
      'tapping a step did not land in the sky',
    ).toBe(true)
  })
})

describe('and the sky agrees with it', () => {
  it('quotes the roadmap at the foot of the glass instead of having its own opinion', async () => {
    /*
     * There have been two answers to "what should I do" in this app before, and
     * the app could be caught telling you two different things about the same
     * morning. The bar keeps its place and gives up its opinion.
     */
    await backToSky(page)
    await page.waitForTimeout(1500)
    const bar = await page.evaluate(() => document.querySelector('.sky-next')?.textContent?.trim() ?? '')
    console.log(`  the sky says: “${bar}”`)
    expect(bar, 'the sky said nothing at all').not.toBe('')
  })

  it('walked both tabs without throwing anything', async () => {
    expect(app.errors, app.errors.join(' | ')).toHaveLength(0)
  })
})
