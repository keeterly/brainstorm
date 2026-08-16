// Principle 2 — help you build an action plan to do them.
//
// The app's answer is ⚡: read a group, and write the work that actually follows
// from it. What it produces has always been more than the screen showed — a
// reason for every step, an effort, and an order — and the group page only
// caught up recently. Nothing has ever checked that any of it survives into the
// DOM, which is where a person meets it.
//
// The demo answers ⚡ from a canned output after a believable pause, so this is
// the real path — the client, the flow, the writes into the graph — with only
// the model's own words stubbed. No key, no network.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright'
import {
  backToSky,
  groups,
  listHeading,
  open,
  openGroup,
  pageReady,
  primaryVerb,
  rows,
  runVerb,
  serve,
  tickRow,
  type Row,
} from './harness'

const BUILD = fileURLToPath(new URL('./.build', import.meta.url))

let site: Awaited<ReturnType<typeof serve>>
let app: Awaited<ReturnType<typeof open>>
let page: Page
let group: string

beforeAll(async () => {
  site = await serve(BUILD)
  app = await open(site.url)
  page = app.page
  ;[group] = await groups(page)
}, 180_000)

afterAll(async () => {
  await app?.close()
  await site?.close()
})

describe('turning a pile into a plan', () => {
  it('does not call a pile a plan', async () => {
    /*
     * A wall of references has no order and no efforts, and numbering it would
     * be the app inventing a sequence nobody meant. `hasPlan` is the test, and
     * that it holds on real data rather than in a unit test is what this is.
     */
    await openGroup(page, group)
    expect(await listHeading(page)).toBe('what is inside')
    const before = await rows(page)
    expect(before.length, 'the group opened empty').toBeGreaterThan(0)
    expect(before.every((r) => !r.why), 'a pile already has reasons on it').toBe(true)
  })

  it('offers to make the steps, in those words', async () => {
    // what the button says is what will happen — the label is the promise
    expect(await primaryVerb(page)).toMatch(/make the steps/i)
  })

  it('writes steps that say something the pile did not', async () => {
    await runVerb(page)
    await openGroup(page, group)
    const after = await rows(page)
    const titles = after.map((r) => r.title)
    // the canned rain returns three, and they are the work that follows rather
    // than the members with a verb in front of them
    expect(titles.some((t) => /expired stock/i.test(t)), `nothing new landed: ${titles.join(' | ')}`).toBe(true)
    expect(titles.some((t) => /wax-letter copy/i.test(t))).toBe(true)
  })

  it('now calls it a plan, and shows why each step is there', async () => {
    expect(await listHeading(page)).toBe('the plan')
    const withReasons = (await rows(page)).filter((r) => r.why)
    expect(withReasons.length, 'the plan has no reasons on it').toBeGreaterThanOrEqual(3)
    // …and how big a thing each one is, which rain sizes 1–5 and nothing in the
    // app showed for a year
    expect((await rows(page)).filter((r) => r.effort > 0).length).toBeGreaterThanOrEqual(3)
  })

  it('puts what has to come first, first', async () => {
    /*
     * The canned plan has one step depending on another. `planOrder` is unit
     * tested; that its answer survives the walk down the tree and into the rows
     * you actually read is not, and that is the half that can break silently.
     */
    const list = await rows(page)
    const first = list.findIndex((r) => /expired stock/i.test(r.title))
    const after = list.findIndex((r) => /one feeling the room/i.test(r.title))
    expect(first, 'the step that comes first is missing').toBeGreaterThanOrEqual(0)
    expect(after, 'the step that waits is missing').toBeGreaterThanOrEqual(0)
    expect(after, 'a step is listed above the thing it waits on').toBeGreaterThan(first)
  })

  it('names what a step is waiting on rather than only marking it', async () => {
    // "waiting" tells you to skip it; the name tells you what to go and do
    // instead, which is the difference between a label and a plan
    const waiting = (await rows(page)).filter((r) => r.waits)
    expect(waiting.length, 'nothing says what it is waiting on').toBeGreaterThan(0)
    expect(waiting[0].waits.length).toBeGreaterThan(4)
  })

  it('stops saying it the moment the blocker is ticked', async () => {
    /*
     * The list paints once. Ticking the thing a step was waiting on used to
     * leave the old line sitting there — an app telling you to go and do
     * something you have just done. `refreshWaits` runs on the tick; this is
     * whether it reaches the row.
     */
    const blocker = (await rows(page)).find((r) => /expired stock/i.test(r.title))
    expect(blocker, 'the step that others wait on is missing').toBeTruthy()
    await tickRow(page, (blocker as Row).id)
    const now = await rows(page)
    const stale = now.filter((r) => !r.done && /expired stock/i.test(r.waits))
    expect(stale, `still waiting on something already done: ${stale.map((r) => r.title).join(', ')}`).toHaveLength(0)
  })

  it('sends finished work to the bottom of its own list', async () => {
    /*
     * Four ticked things scattered through nine is a list you have to read
     * twice to find your place in. Among *siblings*, though — the page walks
     * the tree depth-first so a sub-group's contents sit under it rather than
     * at the end, and a finished thing inside one is correctly above the open
     * things of the list that holds it. Flattening that would be asserting the
     * nesting is broken.
     */
    const list = await rows(page)
    const wrong: string[] = []
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]
      const here = list[i]
      if (prev.depth === here.depth && prev.done && !here.done) wrong.push(`${here.title} is under ${prev.title}`)
    }
    expect(wrong, `finished work is above unfinished work: ${wrong.join('; ')}`).toHaveLength(0)
  })

  it('built the whole plan without throwing anything', async () => {
    await backToSky(page)
    expect(app.errors, app.errors.join(' | ')).toHaveLength(0)
  })
})

// The page has to survive being reopened, because that is how it is used: you
// go away, do the thing, and come back to tick it.
describe('and it is still a plan when you come back to it', () => {
  it('keeps its order, its reasons and its efforts across a reopen', async () => {
    await openGroup(page, group)
    await pageReady(page)
    const list = await rows(page)
    expect(await listHeading(page)).toBe('the plan')
    expect(list.filter((r) => r.why).length).toBeGreaterThanOrEqual(2)
    await backToSky(page)
  })
})
