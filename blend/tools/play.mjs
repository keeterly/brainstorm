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
const arrivals = async () => Number(await page.locator('.bar.top .count b').textContent())
const massOf = (id) => page.locator(`[data-id="${id}"] .mass`).textContent()
const line = () => page.locator('.line').textContent()

/* ── level 1: the two moves it is made of ─────────────────────────────────── */
await open(1)
ok('level 1 opens with two drops', (await page.locator('.drop').count()) === 2)
ok('…and one arrival to spend', (await arrivals()) === 1)
await drag('[data-id="d0"]', '[data-id="d1"]')
ok('red into yellow leaves one drop', (await page.locator('.drop').count()) === 1)
ok('…worth two', (await massOf('d1')) === '2')
await drag('[data-id="d1"]', '.core')
await page.waitForTimeout(1400)
ok('the core takes it and the sky is empty', (await page.locator('.drop').count()) === 0)
ok('and it says so', (await page.locator('.card h2').textContent()) === 'One colour.')

/* ── level 2: the colour it will not have, and the drop that is too big ───── */
await open(2)
await drag('[data-id="d0"]', '.core')
ok('the core refuses a colour that is not its own', (await page.locator('.drop').count()) === 4)
ok('…and says why', /not the core/.test(await line()))
ok('…and spends no arrival on it', (await arrivals()) === 2)

await drag('[data-id="d0"]', '[data-id="d2"]') // blue into blue — allowed, and still blue
ok('the same colour may join itself', (await massOf('d2')) === '2')
await drag('[data-id="d1"]', '[data-id="d2"]') // …but now nothing fits
ok('a merge over the cap is refused', (await massOf('d2')) === '2')
ok('…and says why', /too much/.test(await line()))

await page.locator('.bar.bot button[aria-label="undo"]').click()
await page.waitForTimeout(400)
ok('undo puts the two blues back', (await page.locator('.drop').count()) === 4)

await drag('[data-id="d0"]', '[data-id="d1"]') // blue into yellow — green
await drag('[data-id="d1"]', '.core')
await page.waitForTimeout(500)
ok('a green arrives and the core closes once behind it', (await arrivals()) === 1)

/* ── level 4: out through a skin ──────────────────────────────────────────── */
await open(4)
ok('level 4 has one skin', (await page.locator('.skin').count()) === 1)
const core = await centre('.core')
await dragTo('[data-id="d2"]', { x: core.x + 100, y: core.y + 150 })
ok('a drop small enough passes out', (await page.locator('.skin').count()) === 1)
await dragTo('[data-id="d3"]', { x: core.x - 100, y: core.y + 150 })
ok('…and the skin is shed once it is empty', (await page.locator('.skin').count()) === 0)

/* ── level 5: what you join inside still has to fit ───────────────────────── */
await open(5)
await drag('[data-id="d2"]', '[data-id="d3"]')
ok('two reds join behind the skin', (await massOf('d3')) === '2')
const ring = await centre('.skin .wall')
await dragTo('[data-id="d3"]', { x: ring.x, y: ring.y + 300 })
ok('…and are then too big for the pore', (await page.locator('.skin').count()) === 1)
ok('…and are told why', /too big/.test(await line()))

await browser.close()
console.log(failures ? `\n${failures} failed` : '\nall good')
process.exit(failures ? 1 : 0)
