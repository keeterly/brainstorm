import { describe, expect, it } from 'vitest'
import { FRONT_WOBBLE, frontPath, frontReach } from './SkyPage'

/** The points the browser actually interpolates and fills between. */
function points(clip: string): [number, number][] {
  const nums = (clip.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]])
  return out
}

/** Ray casting, the same question the compositor asks of every pixel. */
function covers(clip: string, x: number, y: number): boolean {
  const p = points(clip)
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i]
    const [xj, yj] = p[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// every corner of a phone-sized page, plus origins well outside it — a drop's
// position is in world space, so after a pan the page can open from off screen
const SIZES: [number, number][] = [
  [393, 852],
  [393, 911],
  [430, 932],
  [320, 568],
]

describe('the front the page arrives behind', () => {
  it('is a path, so it can grow into another path instead of snapping', () => {
    // `circle()` cannot interpolate against `path()`. If either end of the
    // transition ever goes back to a circle the page stops arriving and starts
    // appearing, which is the whole thing this replaced.
    expect(frontPath(100, 200, 0)).toMatch(/^path\('M .* Z'\)$/)
    expect(frontPath(100, 200, 400)).toMatch(/^path\('M .* Z'\)$/)
  })

  it('grows through the same points, so the shape travels rather than morphs', () => {
    const small = points(frontPath(150, 300, 40))
    const big = points(frontPath(150, 300, 400))
    expect(small).toHaveLength(big.length)
    // and each point moved outward along its own ray, not sideways
    const angle = (p: [number, number]) => Math.atan2(p[1] - 300, p[0] - 150)
    for (let i = 0; i < small.length; i++) {
      expect(Math.abs(angle(small[i]) - angle(big[i]))).toBeLessThan(0.01)
    }
  })

  it('is not a circle — that was the complaint', () => {
    const p = points(frontPath(196, 426, 500))
    const r = p.map(([x, y]) => Math.hypot(x - 196, y - 426))
    const outOfRound = (Math.max(...r) - Math.min(...r)) / Math.max(...r)
    expect(outOfRound).toBeGreaterThan(0.05)
  })

  it('opens the same shape twice in the same place, and a different one elsewhere', () => {
    expect(frontPath(120, 300, 200)).toBe(frontPath(120, 300, 200))
    expect(frontPath(121, 300, 200)).not.toBe(frontPath(120, 300, 200))
  })

  it('collapses to the point you pressed, so it closes back into your thumb', () => {
    for (const [x, y] of points(frontPath(140, 260, 0))) {
      expect(x).toBeCloseTo(140, 1)
      expect(y).toBeCloseTo(260, 1)
    }
  })
})

describe('how far the front has to travel', () => {
  it('covers all four corners from anywhere, dents included', () => {
    // A wobbled edge is pulled inward as much as it is pushed outward. Sized to
    // the corner alone it lands with a bite of night sky in one of them, and
    // this is the test that catches that — from every origin, not the easy ones.
    const bad: string[] = []
    for (const [w, h] of SIZES) {
      for (let ox = -120; ox <= w + 120; ox += 37) {
        for (let oy = -120; oy <= h + 120; oy += 53) {
          const clip = frontPath(ox, oy, frontReach(ox, oy, w, h))
          for (const [cx, cy] of [
            [0, 0],
            [w, 0],
            [0, h],
            [w, h],
          ]) {
            if (!covers(clip, cx, cy)) bad.push(`${w}x${h} from ${ox},${oy} misses ${cx},${cy}`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('leaves real room rather than scraping past, so a curve that dips is still safe', () => {
    // the polygon test above is the sampled points; the browser draws a spline
    // through them, which can bow inward a little between two of them
    const [w, h] = [393, 911]
    const corner = Math.hypot(196, 911 - 426)
    expect(frontReach(196, 426, w, h) * (1 - FRONT_WOBBLE)).toBeGreaterThan(corner + 15)
  })

  it('does not blow up when the page opens from a corner of itself', () => {
    for (const [ox, oy] of [
      [0, 0],
      [393, 911],
    ]) {
      const r = frontReach(ox, oy, 393, 911)
      expect(Number.isFinite(r)).toBe(true)
      expect(r).toBeGreaterThan(Math.hypot(393, 911))
    }
  })
})
