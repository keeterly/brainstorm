// Open the game the way a phone would and take pictures of it.
//
// A game is a thing you look at. Tests can prove a level is winnable and say
// nothing at all about whether the sky is worth being in, so this drives the
// real build in a real browser at a real phone size — and it plays a couple of
// moves, because a still of a board nobody has touched hides every bug in the
// dragging.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL ?? 'http://localhost:4173/'
const OUT = process.env.OUT ?? 'shots'
mkdirSync(OUT, { recursive: true })

const SCALE = Number(process.env.SCALE ?? 2)
const phone = { width: 390, height: 844, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: phone, ...phone })

/** Drag one drop onto another, the way a thumb does — slowly, in steps. */
async function drag(from, to) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    const t = i / 12
    await page.mouse.move(
      a.x + a.width / 2 + (b.x + b.width / 2 - (a.x + a.width / 2)) * t,
      a.y + a.height / 2 + (b.y + b.height / 2 - (a.y + a.height / 2)) * t,
    )
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  await page.waitForTimeout(420)
}

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })

async function open(level, greeted = true) {
  await page.addInitScript(
    ([done, greet]) => {
      localStorage.setItem(
        'blend.progress.v1',
        JSON.stringify({ done, best: {}, greeted: greet }),
      )
    },
    [level - 1, greeted],
  )
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
}

// the card a first-time player meets
await open(1, false)
await shot('01-title')
await page.getByText('Begin').click()
await page.waitForTimeout(1200)
await shot('02-level-1')

// …and the two moves that finish it
const drops = page.locator('.drop')
await drag(drops.nth(0), drops.nth(1))
await shot('03-blended')
await drag(page.locator('.drop').first(), page.locator('.core'))
await page.waitForTimeout(1400)
await shot('04-won')

for (const level of [5, 7, 10]) {
  await open(level)
  await shot(`0${level === 10 ? 7 : level}-level-${level}`)
}

// the shelf of skies
await open(6)
await page.locator('.bar.bot button').first().click()
await page.waitForTimeout(600)
await shot('09-skies')

// a refusal, said out loud rather than swallowed
await open(2)
const two = page.locator('.drop')
await drag(two.nth(0), two.nth(2))
await page.waitForTimeout(200)
await shot('08-refused')

await browser.close()
console.log(`shots in ${OUT}/`)
