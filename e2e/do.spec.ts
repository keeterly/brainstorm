// Principle 3 — action on them so you get them done, by hand or with AI.
//
// By hand is ticking, and that is the end of the loop the journey walks. This is
// the other half: the app doing a piece of the work itself. There is exactly one
// path in the whole app that produces a finished thing — `draft`, behind the
// verb "do it" — and until the fixture was canned for it, nothing could exercise
// that path at all in a build anybody can run without a key.
//
// Which verb a step gets is decided by `getOnWithIt`, and now by an answer the
// model gives when it writes the step (`canDraft`) rather than by matching the
// title against fifteen English verbs. That wiring had never been exercised end
// to end.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright'
import {
  backToSky,
  goInside,
  groups,
  open,
  openGroup,
  openMember,
  primaryVerb,
  rows,
  runVerb,
  serve,
  settled,
  tap,
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
  /*
   * A plan first — the steps everything below is about do not exist until ⚡ has
   * run. And it is checked here rather than left to be discovered, because a ⚡
   * that quietly did not happen surfaces four checks later as "no step matching
   * /wax-letter copy/", which reads like the app losing work and is nothing of
   * the kind. Where the setup failed is worth one assertion.
   */
  await openGroup(page, group)
  expect(await primaryVerb(page), 'the group does not offer to make the steps').toMatch(/make the steps/i)
  await runVerb(page)
  await openGroup(page, group)
  const made = (await rows(page)).map((r) => r.title)
  expect(made.some((t) => /wax-letter copy/i.test(t)), `⚡ wrote no plan — the group holds: ${made.join(' | ')}`).toBe(
    true,
  )
  await backToSky(page)
}, 240_000)

afterAll(async () => {
  await app?.close()
  await site?.close()
})

/**
 * Stand in front of one step of the plan, on its own page.
 *
 * From the sky every time, and it makes sure it is in the sky first — running a
 * verb leaves you wherever the app decided to put you, and `openGroup` taps
 * where a group *would* be. Without this it opened whatever page was already up
 * and read that one's rows, which fails looking like the step has vanished.
 */
async function openStep(match: RegExp): Promise<Row> {
  await backToSky(page)
  await openGroup(page, group)
  const step = (await rows(page)).find((r) => match.test(r.title))
  expect(step, `no step matching ${match}`).toBeTruthy()
  // …from the sky, going into the group and tapping the step itself, which is
  // where a person is when they decide to get on with one
  await openMember(page, group, (step as Row).id)
  return step as Row
}

// These three were held back once, on a belief that turned out to be wrong:
// that standing inside a group could strand a member somewhere no finger could
// reach, leaving no reliable way to open one and ask what it offers. Run
// properly they say otherwise — the ring puts everything in reach. The one real
// failure among them was the last check's own assumption that running a verb
// leaves you standing on the page. It does not, and should not.
describe('the app doing a piece of the work', () => {
  it('offers to write the step, in the words of what it will do', async () => {
    /*
     * `rain` said of this one that it could write a first version, and of the
     * expired-film shoot that it could not — one is words and the other is a
     * roll of film. What the button says is what will happen.
     */
    await openStep(/wax-letter copy/i)
    const verb = await primaryVerb(page)
    expect(verb, `the step offers “${verb}”`).toMatch(/do it/i)
  }, 120_000)

  it('does not offer to do a thing that has to be gone and done', async () => {
    // the half of the judgement that matters more: an app offering to shoot a
    // roll of film for you is an app you stop believing
    await backToSky(page)
    await openStep(/expired stock/i)
    const verb = await primaryVerb(page)
    expect(verb, `it offered “${verb}” for going and shooting a roll of film`).not.toMatch(/do it/i)
  }, 120_000)

  it('writes the thing, says something while it does, and hands it back', async () => {
    /*
     * The whole of principle three in one check. Everything before this is the
     * app arranging your thinking; this is the only moment it hands back
     * something that did not exist before.
     *
     * Tapping the verb closes the page, on purpose — the work takes a while,
     * and the app would rather put you back in the sky to watch it happen than
     * sit you in front of a spinner. So coming back to the step afterwards is
     * not the check being careless about where it is; it is the walk a person
     * makes. This was written the other way and failed against an empty verb,
     * which is the app behaving correctly and the check being wrong about it.
     */
    await backToSky(page)
    await openStep(/wax-letter copy/i)
    expect(await primaryVerb(page)).toMatch(/do it/i)

    const heard = await runVerb(page, 90_000)
    console.log(`  while doing the work it said: ${heard.map((h) => `“${h}”`).join(', ') || '(nothing)'}`)
    expect(heard.length, 'it did the work in total silence').toBeGreaterThan(0)

    // …and coming back to the step, the verb it offers is now the one for
    // reading what it wrote. `made` is keyed on the stamp a draft leaves rather
    // than on there being a brief at all, so this is the step having been
    // written, not merely asked about.
    await openStep(/wax-letter copy/i)
    const after = await primaryVerb(page)
    expect(after, `after doing it the step offers “${after}”`).toMatch(/read it/i)

    // which opens it, with the words in it — a page that opens and paints
    // nothing is the failure a source pin cannot see
    await tap(page, '.pans .acts [data-act="onwith"]')
    await page.waitForTimeout(2000)
    const text = await page.evaluate(() => document.querySelector('[data-sky="pageA"]')?.textContent ?? '')
    expect(text.length, 'it brought back nothing to read').toBeGreaterThan(200)
    expect(text, 'what it brought back is not what it wrote').toMatch(/six letters|buyer/i)
    await backToSky(page)
  }, 240_000)
})

describe('finishing things', () => {
  it('offers to close a group once nothing open is left in it', async () => {
    /*
     * A goal could never finish. The sky draws only what is open, so ticking the
     * last thing under a group made its members vanish and left the goal sitting
     * there looking exactly like a thought nobody had touched.
     *
     * Against the nested wall of references rather than the campaign that holds
     * it, and deliberately: a group whose members include another *group* does
     * not run out of open work when its leaves are ticked, because the sub-group
     * is still open and still a member. That is coherent, and it means the offer
     * only ever fires on a group of leaves — worth knowing, and the reason this
     * test aims where it does.
     */
    await backToSky(page)
    await goInside(page, group)
    const inner = (await groups(page)).find((id) => id !== group)
    expect(inner, 'nothing nested to finish').toBeTruthy()
    await openMember(page, group, inner as string)
    for (let i = 0; i < 12; i++) {
      const stillOpen = (await rows(page)).filter((r) => !r.done)
      if (!stillOpen.length) break
      await tickRow(page, stillOpen[0].id)
    }
    expect((await rows(page)).filter((r) => !r.done), 'something is still open in it').toHaveLength(0)
    await backToSky(page)
    // the offer waits for the undo bar of the tick itself to have had its turn
    const asked = await page
      .waitForFunction(() => /finish it/i.test(document.querySelector('.sky-undo.show')?.textContent ?? ''), null, {
        timeout: 25_000,
      })
      .then(() => true)
      .catch(() => false)
    const bar = await page.evaluate(() => document.querySelector('.sky-undo.show')?.textContent?.trim() ?? '')
    console.log(`  after the last tick the app ${asked ? `offered: “${bar}”` : `offered “${bar || 'nothing'}”`}`)
    expect(asked, 'nothing was offered when the group ran out of open work').toBe(true)
  }, 240_000)
})

describe('when it cannot reach the engine', () => {
  it('says so rather than failing quietly', async () => {
    /*
     * A verb that does nothing and says nothing is worse than one that is not
     * there: you tap it again, and again, and conclude the app is broken rather
     * than that the aeroplane has no wifi.
     */
    await page.route('**/api/**', (route) => route.abort())
    await page.route('**/.netlify/**', (route) => route.abort())
    await backToSky(page)
    await settled(page)
    const [g] = await groups(page)
    await openGroup(page, g)
    const heard = await runVerb(page, 45_000).catch(() => [] as string[])
    const bar = await page.evaluate(() => document.querySelector('.sky-undo.show')?.textContent?.trim() ?? '')
    console.log(`  with the engine unreachable it said: “${heard.join(' / ') || bar || '(nothing)'}”`)
    expect(heard.join('') || bar, 'the app said nothing at all when the work could not be done').not.toBe('')
    await page.unroute('**/api/**')
    await page.unroute('**/.netlify/**')
  }, 120_000)

  it('is still usable afterwards', async () => {
    await backToSky(page)
    expect(await page.evaluate(() => document.querySelectorAll('.skyb').length)).toBeGreaterThan(0)
    expect(app.errors, app.errors.join(' | ')).toHaveLength(0)
  })
})

/*
 * What ⚡ brings back, drawn rather than written.
 *
 * `deepen` returns its steps with an effort each and a `dependsOn` list between
 * them, and `applyDeepen` writes both into the graph as real thoughts and real
 * edges. The brief then rendered a markdown summary that mentioned neither —
 * the app built a graph, wrote sentences about it, and showed you the sentences.
 */
describe('the brief is a map, not a wall', () => {
  it('draws the steps with the wires between them', async () => {
    // Something with nothing under it yet — that is what `work it` is for, and
    // it is the branch of getOnWithIt that reaches `deepen`.
    await backToSky(page)
    await openGroup(page, group)
    const all = await rows(page)
    // Found rather than named. Which of the plan's steps reaches `deepen`
    // depends on what `rain` happened to write, and a check that hard-codes one
    // title fails looking like the map is broken when the plan simply came out
    // differently.
    let idea: Row | undefined
    for (const r of all) {
      await openMember(page, group, r.id)
      if (/work it/i.test(await primaryVerb(page))) {
        idea = r
        break
      }
    }
    expect(idea, `nothing here reaches ⚡ — the plan holds: ${all.map((r) => r.title).join(' | ')}`).toBeTruthy()
    console.log(`  working out: “${(idea as Row).title}”`)

    const heard = await runVerb(page, 120_000)
    console.log(`  while working it out: ${heard.map((h) => `“${h}”`).join(', ') || '(nothing)'}`)

    /*
     * …and then read it.
     *
     * Not through the primary verb. Working something out gives it steps, which
     * makes it a group — so `onwith` now offers what you do with a group, and
     * tapping it opened the plan rather than the brief. The way to the brief is
     * the button that exists for it, which only appears once there is one.
     */
    await openMember(page, group, (idea as Row).id)
    const readIt = await page.evaluate(
      () => document.querySelector('.pans [data-act="brief"]')?.textContent?.trim() ?? '',
    )
    expect(readIt, 'nothing offers to read what came back').not.toBe('')
    await tap(page, '.pans [data-act="brief"]')
    await page.waitForTimeout(2500)

    const why = await page.evaluate(() => {
      const pg = document.querySelector('[data-sky="page"]') as HTMLElement | null
      const pa = document.querySelector('[data-sky="pageA"]')
      return {
        mode: pg?.dataset.mode ?? '(none)',
        on: pg?.classList.contains('on'),
        kids: pa?.children.length ?? 0,
        classes: [...(pa?.children ?? [])].map((c) => c.className).slice(0, 12),
        text: (pa?.textContent ?? '').slice(0, 160),
      }
    })
    console.log(`  page: ${JSON.stringify(why)}`)
    const map = await page.evaluate(() => {
      const el = document.querySelector('[data-sky="map"]')
      if (!el) return null
      const svg = el.querySelector('[data-sky="wires"]') as SVGSVGElement | null
      const nodes = [...el.querySelectorAll('.mnode')] as HTMLElement[]
      return {
        nodes: nodes.length,
        spine: svg?.querySelectorAll('.spine').length ?? 0,
        branch: svg?.querySelectorAll('.branch').length ?? 0,
        // the picture has to have a size, or it is drawn into nothing
        h: Math.round(svg?.getBoundingClientRect().height ?? 0),
        // …and nothing may run out the side of it on a phone
        over: nodes.filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent?.slice(0, 30)),
        titles: nodes.map((n) => (n.querySelector('.t')?.textContent ?? '').slice(0, 28)),
        // the numbered list it replaced is gone
        steps: document.querySelectorAll('[data-sky="pageA"] .step').length,
      }
    })
    console.log(`  map: ${JSON.stringify(map)}`)

    expect(map, 'the brief drew no map at all').toBeTruthy()
    const m = map as NonNullable<typeof map>
    expect(m.nodes, 'a map with nothing on it').toBeGreaterThan(1)
    expect(m.spine, 'the steps are not joined to each other').toBeGreaterThan(0)
    // the demo's third step waits on the first, which the sequence cannot say —
    // see DEMO_OUTPUT.deepen
    expect(m.branch, 'the dependency the order does not carry was not drawn').toBeGreaterThan(0)
    expect(m.h, 'the wires were drawn into a box with no height').toBeGreaterThan(20)
    expect(m.over, 'a step ran out the side of the map').toEqual([])
    expect(m.steps, 'the numbered list is still there under the map').toBe(0)
    await backToSky(page)
  }, 240_000)
})
