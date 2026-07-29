// One ocean, drawn once, shared by every surface. The water is a place things
// sink into — a body with depth, not a line at the bottom of the screen.
import { sky } from './daylight'

export const WATER_H = 150
const SURFACE = 26

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
  cachedLine = c.getBoundingClientRect().top + SURFACE
  return cachedLine
}

export function drawWater(ctx: CanvasRenderingContext2D, W: number, t: number, reduced: boolean) {
  const [wr, wg, wb] = sky.water
  ctx.clearRect(0, 0, W, WATER_H)
  const amp = reduced ? 0 : 2.6

  ctx.beginPath()
  ctx.moveTo(0, WATER_H)
  for (let x = 0; x <= W; x += 6) ctx.lineTo(x, surfaceY(x, t, amp, 0.9, 0))
  ctx.lineTo(W, WATER_H)
  ctx.closePath()
  // the ocean takes the hour's colour with it
  const body = ctx.createLinearGradient(0, SURFACE - 12, 0, WATER_H)
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
