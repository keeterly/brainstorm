import { describe, expect, it } from 'vitest'
import { daylightAt } from './daylight'

const at = (h: number, m = 0) => {
  const d = new Date(2026, 6, 29, h, m, 0)
  return daylightAt(d)
}

describe('daylight', () => {
  it('names the hours the way a person would', () => {
    expect(at(3).name).toBe('night')
    expect(at(6).name).toBe('dawn')
    expect(at(9).name).toBe('morning')
    expect(at(13).name).toBe('midday')
    expect(at(17).name).toBe('afternoon')
    expect(at(20).name).toBe('evening')
    expect(at(23).name).toBe('night')
  })

  it('is warm at either end of the day and cool in the middle', () => {
    expect(at(6).warm).toBeGreaterThan(at(12).warm)
    expect(at(19).warm).toBeGreaterThan(at(12).warm)
    expect(at(12).warm).toBeLessThan(0.3)
  })

  it('lifts the sky at midday and lets it fall at night', () => {
    const lum = (c: [number, number, number]) => c[0] + c[1] + c[2]
    expect(lum(at(12).top)).toBeGreaterThan(lum(at(2).top))
    expect(lum(at(12).horizon)).toBeGreaterThan(lum(at(2).horizon))
  })

  it('drifts continuously — no visible switch between hours', () => {
    // a minute apart must never move a channel by more than a step or two
    for (let h = 0; h < 24; h++) {
      const a = at(h, 59)
      const b = at((h + 1) % 24, 0)
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(a.top[i] - b.top[i])).toBeLessThanOrEqual(3)
        expect(Math.abs(a.water[i] - b.water[i])).toBeLessThanOrEqual(3)
      }
    }
  })

  it('wraps around midnight without a jump', () => {
    const before = at(23, 59)
    const after = at(0, 0)
    expect(Math.abs(before.top[2] - after.top[2])).toBeLessThanOrEqual(3)
  })
})
