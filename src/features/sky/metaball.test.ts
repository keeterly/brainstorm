import { describe, expect, it } from 'vitest'
import { echoRing, metaballPath, MORPH_PERP } from './SkyPage'

function coords(d: string) {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
}

describe('the neck between two drops', () => {
  it('is absent when they are too far apart to reach', () => {
    expect(metaballPath(0, 0, 40, 400, 0, 40)).toBeNull()
  })
  it('forms once they come within reach', () => {
    const d = metaballPath(0, 0, 40, 110, 0, 40)
    expect(d).toBeTruthy()
    expect(d).toMatch(/^M /)
    expect(d?.endsWith('Z')).toBe(true)
  })
  it('never emits a coordinate that is not a number', () => {
    for (let gap = 0; gap < 130; gap += 3) {
      const d = metaballPath(0, 0, 40, 80 + gap, 12, 55)
      if (!d) continue
      expect(d).not.toMatch(/NaN|Infinity|undefined/)
    }
  })
  it('becomes a single surface once one drop is inside the other', () => {
    const d = metaballPath(0, 0, 80, 4, 0, 20)
    expect(d).toBeTruthy()
    expect(d).not.toMatch(/NaN/)
    // the surviving outline is the larger drop's
    expect(d).toContain('80.0')
  })
  it('survives drops of very different sizes', () => {
    const d = metaballPath(0, 0, 18, 130, 0, 112)
    expect(d === null || !/NaN/.test(d)).toBe(true)
  })
})

describe('drops leaning into each other', () => {
  it('reaches further along the line between them than a circle would', () => {
    // horizontal pair, so the reach shows up as a wider x span
    const plain = metaballPath(0, 0, 40, 110, 0, 40) as string
    const leaned = metaballPath(0, 0, 40, 110, 0, 40, 0.17, 0.17) as string
    const spanX = (d: string) => {
      const c = coords(d)
      const xs = c.filter((_, i) => i % 2 === 0)
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(spanX(leaned)).toBeGreaterThan(spanX(plain))
  })
  it('pays for the reach by narrowing across it', () => {
    const plain = metaballPath(0, 0, 40, 110, 0, 40) as string
    const leaned = metaballPath(0, 0, 40, 110, 0, 40, 0.17, 0.17) as string
    // the arc radii are the body's semi-axes: across the line it must shrink
    const across = (d: string) => Number(/A ([\d.]+) ([\d.]+)/.exec(d)?.[2])
    expect(across(leaned)).toBeCloseTo(40 * (1 - 0.17 * MORPH_PERP), 1)
    expect(across(leaned)).toBeLessThan(across(plain))
  })
  it('is unchanged from the circle case when nothing is leaning', () => {
    expect(metaballPath(0, 0, 40, 110, 12, 55, 0, 0)).toBe(metaballPath(0, 0, 40, 110, 12, 55))
  })
  it('stays finite while a pair closes and deforms together', () => {
    for (let gap = 0; gap < 140; gap += 2) {
      const k = Math.min(0.17, gap / 400)
      const d = metaballPath(0, 0, 40, 70 + gap, 30, 62, k, k)
      if (d) expect(d).not.toMatch(/NaN|Infinity|undefined/)
    }
  })
})

describe('the echo a live drop sends out', () => {
  it('closes on itself so the ring has no seam', () => {
    const d = echoRing(0, 0, 50, 1.7, 0.05)
    expect(d).toMatch(/^M /)
    expect(d.endsWith('Z')).toBe(true)
    expect(d).not.toMatch(/NaN/)
  })
  it('is never a true circle, but never loses its shape either', () => {
    const d = echoRing(0, 0, 50, 2.4, 0.06)
    const pts: number[] = []
    // every curve lands on a ring point; measure those
    for (const m of d.matchAll(/C [-\d.]+ [-\d.]+, [-\d.]+ [-\d.]+, ([-\d.]+) ([-\d.]+)/g)) {
      pts.push(Math.hypot(Number(m[1]), Number(m[2])))
    }
    expect(pts.length).toBeGreaterThan(20)
    const lo = Math.min(...pts)
    const hi = Math.max(...pts)
    expect(hi - lo).toBeGreaterThan(0.5) // genuinely irregular
    expect(lo).toBeGreaterThan(50 * (1 - 0.06 * 1.01)) // and still a ring
    expect(hi).toBeLessThan(50 * (1 + 0.06 * 1.01))
  })
  it('gives every drop its own ring, and repeats it exactly', () => {
    expect(echoRing(0, 0, 50, 1.7, 0.05)).toBe(echoRing(0, 0, 50, 1.7, 0.05))
    expect(echoRing(0, 0, 50, 1.7, 0.05)).not.toBe(echoRing(0, 0, 50, 4.4, 0.05))
  })
})
