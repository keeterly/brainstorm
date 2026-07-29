// One ocean, drawn once, shared by every surface. The water is a place things
// sink into — a body with depth, not a line at the bottom of the screen.
import { sky } from './daylight'

// A band at the very bottom edge, not a quarter of the screen. The ocean used
// to sit above the tab bar, so everything from the waterline down read as
// water and the sky lost a fifth of its height to it.
export const WATER_H = 112
export const SURFACE = 26
// The ocean is painted deeper than the band it occupies, so when it tilts to
// stay level with gravity there is still water below the bottom edge.
export const WATER_DEEP = 150
export const WATER_DRAW_H = WATER_H + WATER_DEEP

// The y of the water's surface at x. Three harmonics at frequencies that share
// no common multiple, so the surface never repeats itself — real water has no
// wavelength you can point at.
export function surfaceY(x: number, t: number, amp: number, speed: number, off: number) {
  return (
    SURFACE +
    Math.sin(x * 0.016 + t * speed + off) * amp +
    Math.sin(x * 0.0313 - t * speed * 0.71) * amp * 0.5 +
    Math.sin(x * 0.00714 + t * speed * 0.29 + 1.7) * amp * 0.62 +
    Math.sin(x * 0.0537 + t * speed * 1.13) * amp * 0.16
  )
}

// The waterline in page coordinates — where a drop meets the ocean. Measured
// from the canvas itself rather than assumed, because the ocean sits above the
// tab bar and the safe area, and only the element knows where that lands.
let cachedLine = -1
export function invalidateWaterline() {
  cachedLine = -1
}
export function waterlineY() {
  if (cachedLine >= 0) return cachedLine
  const c = document.querySelector('[data-water]') as HTMLElement | null
  if (!c) return window.innerHeight - WATER_H + SURFACE
  // offsetTop, not the bounding rect: the ocean tilts to stay level with
  // gravity, and a rect would report the tilted box rather than where the
  // water actually is. Layout is what we want here, not paint.
  cachedLine = (c.offsetParent ? c.offsetTop : c.getBoundingClientRect().top) + SURFACE
  return cachedLine
}

/** Where the surface is at a given x. The ocean pivots about the centre of the
 *  screen as the phone tilts, so away from the middle the line is higher on
 *  one side — a drop let go near an edge has to be judged against the water
 *  that is actually under it. */
export function seaLineAt(x: number, tiltDeg: number, W: number) {
  if (!tiltDeg) return waterlineY()
  return waterlineY() + (x - W / 2) * Math.tan((-tiltDeg * Math.PI) / 180)
}

/** The colour the ocean reaches at its deepest, opaque, over the ground it
 *  sits on. iOS paints whatever is below the web view — behind the home
 *  indicator — with the document canvas colour, and on a tall phone that strip
 *  is outside our layout entirely. Painting it this colour is the only way the
 *  world reaches the bottom of the glass instead of ending in a flat bar. */
export function seaFloor(ground: [number, number, number]): string {
  const [wr, wg, wb] = sky.water
  const deep = [wr * 0.4, wg * 0.45, wb * 0.6]
  const a = 0.32
  const c = deep.map((d, i) => Math.round(d * a + ground[i] * (1 - a)))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export function drawWater(ctx: CanvasRenderingContext2D, W: number, t: number, reduced: boolean) {
  const [wr, wg, wb] = sky.water
  ctx.clearRect(0, 0, W, WATER_DRAW_H)
  const amp = reduced ? 0 : 2.6

  ctx.beginPath()
  ctx.moveTo(0, WATER_DRAW_H)
  for (let x = 0; x <= W; x += 6) ctx.lineTo(x, surfaceY(x, t, amp, 0.9, 0))
  ctx.lineTo(W, WATER_DRAW_H)
  ctx.closePath()
  // the ocean takes the hour's colour with it
  const body = ctx.createLinearGradient(0, SURFACE - 12, 0, WATER_DRAW_H)
  body.addColorStop(0, `rgba(${wr + 44},${wg + 54},${wb + 50},0.07)`)
  body.addColorStop(0.5, `rgba(${wr},${wg},${wb},0.13)`)
  body.addColorStop(1, `rgba(${Math.round(wr * 0.4)},${Math.round(wg * 0.45)},${Math.round(wb * 0.6)},0.32)`)
  ctx.fillStyle = body
  ctx.fill()

  ctx.beginPath()
  for (let x = 0; x <= W; x += 6) {
    const y = surfaceY(x, t, amp, 0.9, 0)
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = `rgba(${Math.min(255, wr + 130)},${Math.min(255, wg + 110)},${Math.min(255, wb + 80)},0.3)`
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.beginPath()
  for (let x = 0; x <= W; x += 6) {
    const y = surfaceY(x, t, amp * 1.3, 0.6, 2.1) + 7
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = `rgba(${Math.min(255, wr + 110)},${Math.min(255, wg + 100)},${Math.min(255, wb + 80)},0.09)`
  ctx.stroke()
}
