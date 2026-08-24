/*
 * Screenshots of the real app, at the size it is actually used.
 *
 * Not a check — it asserts almost nothing. It walks the loop a person walks and
 * photographs each stop, on a 393x852 phone at 3x, so a change to how the app
 * looks can be looked at rather than described.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import type { Page } from 'playwright'
import {
  backToSky,
  goInside,
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
  settled,
  tap,
  type Row,
} from './harness'

const BUILD = fileURLToPath(new URL('./.build', import.meta.url))
const OUT = fileURLToPath(new URL('./shots', import.meta.url))

let site: Awaited<ReturnType<typeof serve>>
let app: Awaited<ReturnType<typeof open>>
let page: Page
let group: string
const taken: string[] = []

async function shot(name: string, settle = 900) {
  await page.waitForTimeout(settle)
  const n = `${String(taken.length + 1).padStart(2, '0')}-${name}`
  await page.screenshot({ path: `${OUT}/${n}.png` })
  taken.push(n)
  console.log(`  📷 ${n}`)
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true })
  site = await serve(BUILD)
  app = await open(site.url)
  page = app.page
  ;[group] = await groups(page)
}, 180_000)

afterAll(async () => {
  console.log(`\n  ${taken.length} shots in e2e/shots/`)
  await app?.close()
  await site?.close()
})

describe('what the app looks like', () => {
  it('walks the loop and photographs it', async () => {
    // 1 — the sky, as it opens
    await settled(page)
    await shot('the-sky', 2500)

    // 2 — standing inside a group: the members in orbit, and the way further in
    await goInside(page, group)
    await shot('inside-a-group', 1600)

    // 3 — the plan, before there is one
    await openGroup(page, group)
    await shot('a-group-before-its-plan')

    // 4 — ⚡ making the steps
    expect(await primaryVerb(page)).toMatch(/make the steps/i)
    await runVerb(page)
    await backToSky(page)
    await openGroup(page, group)
    await shot('the-plan')

    // 5 — the roadmap
    await backToSky(page)
    await goTab(page, /roadmap/i)
    await shot('the-roadmap', 1600)

    // 6 — and the brief, which is the thing that changed
    await goTab(page, /ideas/i)
    await backToSky(page)
    await openGroup(page, group)
    const all = await rows(page)
    let idea: Row | undefined
    for (const r of all) {
      await openMember(page, group, r.id)
      if (/work it/i.test(await primaryVerb(page))) {
        idea = r
        break
      }
    }
    if (idea) {
      await runVerb(page, 120_000)
      await openMember(page, group, idea.id)
      await shot('a-step-with-a-brief-under-it')
      await tap(page, '.pans [data-act="brief"]')
      await pageReady(page)
      await shot('the-brief-as-a-map', 2200)
    }
    expect(taken.length).toBeGreaterThan(4)
  }, 300_000)
})
