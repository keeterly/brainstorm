import { describe, expect, it } from 'vitest'
import { BREATH_MAX, BREATH_RATE, breath } from './breath'

// One frame of the render loop, at sixty a second — the same step the sky uses.
const TICK = 0.016

describe('the sky breathes', () => {
  it('never carries a drop further than a few pixels from where it belongs', () => {
    // The whole property. Over ten minutes of frames, in every phase, for a
    // dozen drops — nothing may ever be more than a breath from home.
    let worst = 0
    for (let f = 0; f < 60 * 600; f++) {
      const t = f * TICK
      for (let i = 0; i < 12; i++) {
        const b = breath(t, i)
        worst = Math.max(worst, Math.hypot(b.x, b.y))
      }
    }
    expect(worst).toBeLessThanOrEqual(BREATH_MAX + 1e-9)
    expect(BREATH_MAX).toBeLessThan(5)
  })

  it('is an offset, not something that accumulates', () => {
    /*
     * The bug, stated as arithmetic.
     *
     * The old line added the sine to the position every frame, which
     * integrates it: the excursion becomes amplitude over frequency rather
     * than amplitude. Reproduced here so the number is on the record —
     * measured in the browser at up to 101 pixels of travel, and it comes out
     * of these two constants alone.
     */
    let x = 0
    let worst = 0
    for (let f = 0; f < 60 * 200; f++) {
      x += Math.sin(f * TICK * 0.09) * 0.06
      worst = Math.max(worst, Math.abs(x))
    }
    expect(worst).toBeGreaterThan(40)
    // …and the same span of time, done as an offset, stays inside a breath
    let now = 0
    for (let f = 0; f < 60 * 200; f++) now = Math.max(now, Math.abs(breath(f * TICK, 0).x))
    expect(now).toBeLessThan(4)
  })

  it('comes back to where it started, every cycle', () => {
    const period = (Math.PI * 2) / BREATH_RATE
    const a = breath(0, 3)
    const b = breath(period * 5, 3)
    // x closes exactly; y runs at four fifths of the rate, so it only lines up
    // every five — which is the point of the two being out of step
    expect(b.x).toBeCloseTo(a.x, 6)
    expect(b.y).toBeCloseTo(a.y, 6)
  })

  it('is quick enough to read as breathing rather than as travelling', () => {
    // seventy seconds a cycle was the other half of the old mistake: a thing
    // that takes a minute to move and come back is not breathing
    expect((Math.PI * 2) / BREATH_RATE).toBeLessThan(15)
  })

  it('never lets a sky full of drops pulse as one', () => {
    // if every drop shared a phase the whole map would swell together, which
    // is a heartbeat and not a sky
    const at = Array.from({ length: 8 }, (_, i) => breath(1.7, i).x)
    const spread = Math.max(...at) - Math.min(...at)
    expect(spread).toBeGreaterThan(3)
  })
})
