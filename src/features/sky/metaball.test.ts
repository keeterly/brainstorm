import { describe, expect, it } from 'vitest'
import { metaballPath } from './SkyPage'

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
