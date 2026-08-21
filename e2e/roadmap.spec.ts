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
  openMember,
  pageReady,
  primaryVerb,
  rows,
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
    /*
     * A plan you cannot open is a list of sentences about work rather than the
     * work — and this check used to assert only that tapping a step landed you
     * somewhere with bubbles in it, which is true of doing nothing at all. It
     * passed for two commits while the link was dead: every step pointed at
     * `/?open=<id>`, the router took the query before the sky could read it,
     * and you arrived on the Ideas tab looking at the whole sky with no idea
     * anything had failed. It asks for the page now.
     */
    const want = (await slots(page))[0]
    await tap(page, '.rm-body')
    const opened = await page
      .waitForFunction(() => !!document.querySelector('[data-sky="page"].on'), null, { timeout: 12_000 })
      .then(() => true)
      .catch(() => false)
    expect(opened, `tapping “${want.title}” never opened anything`).toBe(true)
    const heading = await page.evaluate(
      () => document.querySelector('[data-sky="pageQ"]')?.textContent?.trim() ?? '',
    )
    expect(heading, `it opened a page headed “${heading}”`).toMatch(/this thought|this group/i)
    // …and it is the one you asked for, not merely a page
    const shown = await page.evaluate(
      () => (document.querySelector('[data-sky="pageT"]') as HTMLTextAreaElement | null)?.value ?? '',
    )
    console.log(`  tapped “${want.title}” → opened “${shown.slice(0, 40)}”`)
    expect(shown.slice(0, 24), 'it opened a different thought').toBe(want.title.slice(0, 24))
    // …and it has to have finished arriving before it can be closed: `.on`
    // lands when the page starts opening, and tapping its × mid-flight misses
    await pageReady(page).catch(() => undefined)
    await backToSky(page)
  }, 120_000)

  it('schedules only things the app itself calls a next step', async () => {
    /*
     * Every drop's own page says which it is — "something to do · it can come up
     * as your next step" against "a note · it will not come up as a next step" —
     * and the roadmap used to schedule both. Measured on the demo before this:
     * today was an `idea` somebody jotted down once, Tuesday was an open
     * `question` whose own page offers to *answer* it, and the properly written
     * steps sat behind them for the rest of the week.
     */
    await goTab(page, /roadmap/i)
    await page.waitForTimeout(1200)
    const on = await slots(page)
    console.log(`  today: “${on.find((s) => /today/i.test(s.day))?.title ?? '(nothing)'}”`)
    const notWork = on.filter((s) => /^photo$/i.test(s.title) || /\?$/.test(s.title))
    expect(
      notWork.map((s) => s.title),
      'it scheduled something the app says is not a next step',
    ).toHaveLength(0)
  }, 120_000)

  it('lets you tick it off without leaving the tab that asked you to do it', async () => {
    /*
     * The end of the loop, and it was not reachable from here. The only way to
     * say you had done today's thing was to remember which group it lived in,
     * cross to the other tab, open that group and find the row — on the tab
     * whose entire question is "what am I doing today".
     */
    await goTab(page, /roadmap/i)
    await page.waitForTimeout(1200)
    const before = await slots(page)
    expect(before.length, 'nothing to tick').toBeGreaterThan(0)
    expect(await tappable(page, '.rm-tick'), 'the tick is not reachable').toBe(true)
    await tap(page, '.rm-tick')
    await page.waitForTimeout(1800)
    const after = await slots(page)
    console.log(`  ticked “${before[0].title}” — ${before.length} steps became ${after.length}`)
    expect(after.length, 'ticking it off changed nothing').toBe(before.length - 1)
  }, 120_000)
})

describe('the ones you actually chose', () => {
  it('offers to take a group up, and says which way round it is', async () => {
    // a group having a plan means somebody asked what it would take; it does
    // not mean you have decided to spend a week on it
    await backToSky(page)
    await goTab(page, /ideas/i)
    const [g] = await groups(page)
    await openGroup(page, g)
    const verb = await page.evaluate(
      () => document.querySelector('.pans [data-act="pursue"]')?.textContent?.trim() ?? '',
    )
    console.log(`  the group offers: “${verb}”`)
    expect(verb).toMatch(/working on this/i)
  }, 120_000)

  it('narrows the roadmap to what you said you were doing', async () => {
    /*
     * Until anything is marked, the roadmap shows everything with a plan and
     * says so — an empty screen is a worse teacher than a full one. The moment
     * you mark one, it is the list of what you chose.
     */
    await tap(page, '.pans [data-act="pursue"]')
    await page.waitForTimeout(1600)
    expect(
      await page.evaluate(() => !!document.querySelector('.pans [data-act="pursue"].on')),
      'the toggle does not look like it is on',
    ).toBe(true)
    await backToSky(page)
    await goTab(page, /roadmap/i)
    expect(
      await page.evaluate(() => !!document.querySelector('.rm-all')),
      'it is still saying it shows everything after a group was chosen',
    ).toBe(false)
    expect((await slots(page)).length, 'choosing a group emptied the roadmap').toBeGreaterThan(0)
  }, 120_000)
})

describe('moving something', () => {
  it('puts it where you put it, and marks it as yours rather than the app’s', async () => {
    /*
     * Not a drag: the step is already a way into the thing, and a drag between
     * day headings on a phone is a fiddle. A row of dates you can hit with a
     * thumb says what the options are, which a drag never does.
     */
    const before = await slots(page)
    expect(before.length, 'nothing to move').toBeGreaterThan(0)
    const moving = before[0]
    await tap(page, '.rm-move')
    await page.waitForTimeout(700)
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll('.rm-chip')].map((c) => c.textContent?.trim() ?? ''),
    )
    console.log(`  ${chips.length} days offered: ${chips.slice(0, 5).join(' · ')}…`)
    expect(chips.length, 'no days were offered').toBeGreaterThan(4)
    // a day that is not the one it is already on
    await page.evaluate(() => {
      const cs = [...document.querySelectorAll<HTMLElement>('.rm-chip')]
      cs[Math.min(4, cs.length - 1)]?.click()
    })
    await page.waitForTimeout(1600)
    const after = await slots(page)
    const now = after.find((s) => s.title === moving.title)
    console.log(`  “${moving.title}” went from ${moving.day} to ${now?.day}`)
    expect(now, 'the step vanished when it was moved').toBeTruthy()
    expect(now?.day, 'it did not move').not.toBe(moving.day)
    expect(
      await page.evaluate(() => !!document.querySelector('.rm-step.pinned')),
      'nothing shows that the day is yours now',
    ).toBe(true)
  }, 120_000)

  it('still will not put a step in front of what it waits on', async () => {
    /*
     * A pin is a preference, not an instruction. Dragging a step ahead of its
     * own blocker is not a scheduling choice, it is a contradiction — and the
     * plan wins. Checked against what is drawn, because the scheduler being
     * right and the page drawing it wrong is a real way for this to fail.
     */
    const on = await slots(page)
    const order = on.map((s) => s.title)
    for (const s of on.filter((x) => x.waits)) {
      for (const name of (/^after (.+)$/.exec(s.waits)?.[1] ?? '').split(' · ')) {
        const blocker = order.indexOf(name)
        if (blocker < 0) continue
        expect(order.indexOf(s.title), `“${s.title}” is above “${name}”, which it waits on`).toBeGreaterThan(
          blocker,
        )
      }
    }
  })
})

describe('the app doing a piece of the week', () => {
  it('offers to write what it can, and says what it is leaving to you', async () => {
    /*
     * The whole of the third principle in one card, and the second half is what
     * earns the first. An app that offers to shoot a roll of film for you is an
     * app you stop believing — so the split is `canDraft`, the model's own
     * judgement, made at the moment it wrote the step.
     */
    await goTab(page, /roadmap/i)
    await page.waitForTimeout(1200)
    const card = await page.evaluate(() => document.querySelector('.rm-doing')?.textContent ?? '')
    console.log(`  it offers: “${/I can write[^.]*now/.exec(card)?.[0] ?? '(nothing)'}”`)
    expect(card, 'it did not offer to do anything').toMatch(/I can write \S+ of the \d+/)
    expect(card, 'it did not say what it was leaving to you').toMatch(/need you/i)
  }, 120_000)

  it('writes them, saying which one it is on, and hands them back', async () => {
    /*
     * Everything before this is the app arranging your thinking. This is the
     * only moment it hands back something that did not exist before — and it
     * has to keep saying which one it is on, because a batch that works in
     * silence is one you cannot tell from a batch that has died.
     */
    const heard = new Set<string>()
    await tap(page, '.rm-go')
    for (let i = 0; i < 120; i++) {
      const line = await page.evaluate(
        () => document.querySelector('.rm-doing-line')?.textContent?.trim() ?? '',
      )
      if (line) heard.add(line)
      const busy = await page.evaluate(() => !!document.querySelector('.rm-doing-line.busy'))
      if (!busy && i > 4) break
      await page.waitForTimeout(600)
    }
    console.log(`  while it worked it said: ${[...heard].map((h) => `“${h}”`).join(', ')}`)
    expect([...heard].some((h) => /writing \d+ of \d+/.test(h)), 'it worked in silence').toBe(true)
    const last = await page.evaluate(
      () => document.querySelector('.rm-doing-line')?.textContent?.trim() ?? '',
    )
    expect(last, `it finished by saying “${last}”`).toMatch(/wrote \d+|stopped after/)
  }, 240_000)

  it('leaves each one readable on the step itself', async () => {
    // the batch is not a place results live: they land exactly where a single
    // "do it" lands, so there is one place to read a thing the agent wrote
    await goTab(page, /ideas/i)
    await page.waitForTimeout(1500)
    const [g] = await groups(page)
    await openGroup(page, g)
    const step = (await rows(page)).find((r) => /wax-letter copy/i.test(r.title))
    expect(step, 'the written step is gone').toBeTruthy()
    await openMember(page, g, (step as { id: string }).id)
    const verb = await primaryVerb(page)
    console.log(`  the step it wrote now offers: “${verb}”`)
    expect(verb, `after the batch the step offers “${verb}”`).toMatch(/read it/i)
    await tap(page, '.pans .acts [data-act="onwith"]')
    await page.waitForTimeout(2500)
    const text = await page.evaluate(() => document.querySelector('[data-sky="pageA"]')?.textContent ?? '')
    expect(text.length, 'it brought back nothing to read').toBeGreaterThan(200)
    expect(text, 'what came back is not what it wrote').toMatch(/six letters|buyer/i)
    await backToSky(page)
  }, 240_000)

  it('does not tick anything off for you', async () => {
    /*
     * The rule the single "do it" already keeps, and the batch keeps it too:
     * the agent does not get to tick your list, and it does not get to do it
     * before you have read what it made.
     */
    await goTab(page, /ideas/i)
    const [g] = await groups(page)
    await openGroup(page, g)
    const written = (await rows(page)).find((r) => /wax-letter copy/i.test(r.title))
    expect(written?.done, 'the agent ticked a step off by itself').toBe(false)
  }, 120_000)
})

describe('and the sky agrees with it', () => {
  it('quotes the roadmap at the foot of the glass instead of having its own opinion', async () => {
    /*
     * There have been two answers to "what should I do" in this app before, and
     * the app could be caught telling you two different things about the same
     * morning. The bar keeps its place and gives up its opinion.
     */
    // …and it has to be looked at from the sky. `backToSky` is about getting
    // out of a page or a group, and on the other tab there is no sky for it to
    // do anything to — which read as the bar saying nothing at all.
    await goTab(page, /ideas/i)
    await page.waitForTimeout(2000)
    const bar = await page.evaluate(() => document.querySelector('.sky-next')?.textContent?.trim() ?? '')
    console.log(`  the sky says: “${bar}”`)
    expect(bar, 'the sky said nothing at all').not.toBe('')
  })

  it('names the very step the roadmap has first today', async () => {
    /*
     * The check that would have caught it, and did not exist when it broke.
     *
     * "The bar said something" is not agreement. `firstToday` was computing its
     * week without the days you had moved things to, so the roadmap honoured a
     * pin and the sky did not — and a step moved to Thursday went on being
     * announced at the foot of the glass as the first thing today. Both are
     * "what should I do", and there must only ever be one answer.
     */
    // …from the sky, with nothing open over it. A page left up swallows the tab
    // tap, and this then reads an empty roadmap and lets itself off — which is
    // exactly how it passed while the two disagreed.
    await backToSky(page)
    await goTab(page, /roadmap/i)
    const on = await slots(page)
    expect(on.length, 'never got to the roadmap, so this check proved nothing').toBeGreaterThan(0)
    const firstToday = on.find((s) => /today/i.test(s.day))
    await goTab(page, /ideas/i)
    await page.waitForTimeout(2000)
    const bar = await page.evaluate(
      () => document.querySelector('[data-sky="nextLb"]')?.textContent?.trim() ?? '',
    )
    const why = await page.evaluate(
      () => document.querySelector('[data-sky="nextWhy"]')?.textContent?.trim() ?? '',
    )
    console.log(`  roadmap: “${firstToday?.title ?? '(nothing today)'}” · sky: “${bar}” (${why})`)
    if (!firstToday) {
      // Nothing is due to start today, so the ladder answers instead — and the
      // one thing the sky must not do is go on claiming the roadmap said it.
      expect(why, 'the sky claims the roadmap has something today when it has nothing').not.toMatch(
        /roadmap/i,
      )
      return
    }
    // the sky clips a long name at forty and marks the clip; compare what it
    // actually claims to be showing rather than a slice of the same length
    const claimed = bar.replace(/…$/, '')
    expect(
      firstToday.title.startsWith(claimed) && claimed.length > 8,
      `the sky says “${bar}”, the roadmap says “${firstToday.title}”`,
    ).toBe(true)
  }, 120_000)

  it('walked both tabs without throwing anything', async () => {
    expect(app.errors, app.errors.join(' | ')).toHaveLength(0)
  })
})
