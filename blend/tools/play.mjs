// Play the game with a real thumb, in a real browser, and fail loudly.
//
// The unit tests prove the rules; this proves the *hand* — that a drag lands
// where the player aimed it, that a skin lets go when it should, that a
// refusal is said out loud, and that a level can actually be finished by
// dragging things rather than by calling functions.
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:4173/'
const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

let failures = 0
const ok = (claim, truth) => {
  console.log(`${truth ? '  ok  ' : ' FAIL '} ${claim}`)
  if (!truth) failures++
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: phone, ...phone })
page.on('pageerror', (e) => {
  console.log(` FAIL  the page threw: ${e.message}`)
  failures++
})

async function open(level) {
  await page.addInitScript(
    (done) =>
      localStorage.setItem('blend.progress.v1', JSON.stringify({ done, best: {}, greeted: true })),
    level - 1,
  )
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
}

const centre = async (sel) => {
  const box = await page.locator(sel).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragTo(sel, to) {
  const from = await centre(sel)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 14; i++) {
    const t = i / 14
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
    await page.waitForTimeout(14)
  }
  await page.mouse.up()
  await page.waitForTimeout(380)
}

const drag = async (sel, ontoSel) => dragTo(sel, await centre(ontoSel))
const moves = async () => Number(await page.locator('.bar.top .count b').textContent())
const line = () => page.locator('.line').textContent()

/* ── level 1: the two moves it is made of ─────────────────────────────────── */
await open(1)
ok('level 1 opens with two drops', (await page.locator('.drop').count()) === 2)
await drag('[data-id="d0"]', '[data-id="d1"]')
ok('dragging one drop into the other leaves one', (await page.locator('.drop').count()) === 1)
ok('…and counts a move', (await moves()) === 1)
ok('…and the drop is now worth two', (await page.locator('.drop .mass').textContent()) === '2')
await drag('[data-id="d1"]', '.core')
await page.waitForTimeout(1400)
ok('the core takes it and the sky is empty', (await page.locator('.drop').count()) === 0)
ok('and it says so', (await page.locator('.card h2').textContent()) === 'One colour.')

/* ── level 2: a colour the core will not have ─────────────────────────────── */
await open(2)
await drag('[data-id="d0"]', '.core')
ok('the core refuses a colour that is not its own', (await page.locator('.drop').count()) === 4)
ok('…and says why', /not the core/.test(await line()))
ok('…and no move is spent on it', (await moves()) === 0)

/* ── level 4: out through a skin, then home ───────────────────────────────── */
await open(4)
ok('level 4 has one skin', (await page.locator('.skin').count()) === 1)
const core = await centre('.core')
await dragTo('[data-id="d1"]', { x: core.x + 96, y: core.y + 150 })
ok('a small drop passes out through the skin', (await page.locator('.skin').count()) === 0)
await drag('[data-id="d1"]', '[data-id="d0"]')
await drag('[data-id="d0"]', '.core')
await page.waitForTimeout(1400)
ok('level 4 finishes in three moves', (await page.locator('.card h2').textContent()) === 'One colour.')
ok('…which is par', /par/.test(await page.locator('.card .lede').textContent()))

/* ── level 5: what you join inside still has to fit ───────────────────────── */
await open(5)
await drag('[data-id="d2"]', '[data-id="d3"]')
const ring = await centre('.skin .wall')
await dragTo('[data-id="d3"]', { x: ring.x, y: ring.y + 260 })
ok('a drop too big for the pore stays behind the skin', (await page.locator('.skin').count()) === 1)
ok('…and is told why', /too big/.test(await line()))

await browser.close()
console.log(failures ? `\n${failures} failed` : '\nall good')
process.exit(failures ? 1 : 0)
