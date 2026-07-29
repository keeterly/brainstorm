import { beforeEach, describe, expect, it } from 'vitest'
import { __resetUpright, __setUprightTarget, rollFrom, stepUpright, uprightAngle, worldTilt } from './upright'
import { seaLineAt } from './water'

const settle = (steps = 200) => {
  for (let i = 0; i < steps; i++) stepUpright()
  return uprightAngle()
}

describe('which way is up', () => {
  it('leaves the world alone when the phone is held normally', () => {
    // held upright, facing you: nothing to correct
    expect(rollFrom(90, 0)).toBeCloseTo(0, 1)
  })
  it('turns the world back when the phone rolls', () => {
    // right edge down is a clockwise roll, so the world turns anticlockwise
    expect(rollFrom(0, 90)).toBeCloseTo(-90, 1)
    expect(rollFrom(0, -90)).toBeCloseTo(90, 1)
  })
  it('stands the world back up when the phone is upside down', () => {
    expect(Math.abs(rollFrom(-90, 0) as number)).toBeCloseTo(180, 1)
  })
  it('reads a gentle tilt as a gentle tilt', () => {
    const r = rollFrom(70, 20) as number
    expect(r).toBeLessThan(0)
    expect(r).toBeGreaterThan(-30)
  })
  it('refuses to guess when the phone is flat on a table', () => {
    // beta and gamma both near zero: there is no "down" in the screen's plane
    // and the raw angle thrashes between readings
    expect(rollFrom(0, 0)).toBeNull()
    expect(rollFrom(3, -2)).toBeNull()
  })
})

describe('holding the world level', () => {
  beforeEach(() => __resetUpright())

  it('eases to where the phone is rather than snapping', () => {
    __setUprightTarget(40)
    const first = stepUpright()
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(12) // a fraction of the way, not all of it
    expect(settle()).toBeCloseTo(40, 1)
  })
  it('takes the short way round instead of spinning', () => {
    __setUprightTarget(170)
    settle()
    __setUprightTarget(-170)
    // 20 degrees the short way, not 340 the long way
    let travelled = 0
    let prev = uprightAngle()
    for (let i = 0; i < 200; i++) {
      const now = stepUpright()
      let d = now - prev
      if (d > 180) d -= 360
      if (d < -180) d += 360
      travelled += Math.abs(d)
      prev = now
    }
    expect(travelled).toBeLessThan(40)
  })
  it('holds still for anyone who asked for less motion', () => {
    __setUprightTarget(45)
    expect(stepUpright(true)).toBe(0)
  })
  it('lets a drop turn all the way but holds the rectangle to a range', () => {
    __setUprightTarget(120)
    settle()
    expect(uprightAngle()).toBeCloseTo(120, 0) // the drops go the whole way
    expect(Math.abs(worldTilt())).toBeLessThanOrEqual(20) // the sky does not
  })
})

describe('the surface under a drop you are letting go of', () => {
  it('is the same everywhere when the phone is level', () => {
    expect(seaLineAt(0, 0, 400)).toBe(seaLineAt(400, 0, 400))
  })
  it('rises on one side and falls on the other once it tilts', () => {
    const left = seaLineAt(0, 12, 400)
    const mid = seaLineAt(200, 12, 400)
    const right = seaLineAt(400, 12, 400)
    // the middle is the pivot and never moves
    expect(mid).toBe(seaLineAt(200, 0, 400))
    expect(left).toBeGreaterThan(mid)
    expect(right).toBeLessThan(mid)
    expect(left - mid).toBeCloseTo(mid - right, 5)
  })
})
