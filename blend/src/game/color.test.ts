import { describe, expect, it } from 'vitest'
import { blend, delta, PIGMENT, paint, rybToRgb, same, type RYB } from './color'

const pot = (color: RYB, mass = 1) => ({ color, mass })

describe('blending', () => {
  it('makes green out of blue and yellow, which is the whole reason for RYB', () => {
    const [r, g, b] = paint(blend([pot(PIGMENT.blue), pot(PIGMENT.yellow)]))
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })

  it('makes orange out of red and yellow', () => {
    const [r, g, b] = rybToRgb(blend([pot(PIGMENT.red), pot(PIGMENT.yellow)]))
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
  })

  it('does not care what order the pot was filled in', () => {
    const a = blend([pot(PIGMENT.red), pot(PIGMENT.blue), pot(PIGMENT.yellow)])
    const b = blend([pot(PIGMENT.yellow), pot(PIGMENT.red), pot(PIGMENT.blue)])
    expect(delta(a, b)).toBe(0)
  })

  it('is associative, so pairing drops up differently lands in the same place', () => {
    const oneGo = blend([pot(PIGMENT.red), pot(PIGMENT.red), pot(PIGMENT.blue)])
    const twoReds = blend([pot(PIGMENT.red), pot(PIGMENT.red)])
    const inTwoSteps = blend([pot(twoReds, 2), pot(PIGMENT.blue)])
    expect(delta(oneGo, inTwoSteps)).toBeLessThan(1e-12)
  })

  it('weighs by mass — a big red and a small blue is not a halfway violet', () => {
    const heavy = blend([pot(PIGMENT.red, 3), pot(PIGMENT.blue, 1)])
    expect(heavy[0]).toBeCloseTo(0.75, 6)
    expect(heavy[2]).toBeCloseTo(0.25, 6)
    expect(same(heavy, PIGMENT.violet)).toBe(false)
  })

  it('counts an exact match as the same colour and a near miss as a miss', () => {
    expect(same(blend([pot(PIGMENT.red), pot(PIGMENT.blue)]), PIGMENT.violet)).toBe(true)
    expect(same(blend([pot(PIGMENT.red, 1.2), pot(PIGMENT.blue)]), PIGMENT.violet)).toBe(false)
  })

  it('lifts chroma for the screen without moving the hue off it', () => {
    const c = blend([pot(PIGMENT.red), pot(PIGMENT.yellow)])
    const honest = rybToRgb(c)
    const shown = paint(c)
    // same hue order, more distance between the channels
    expect(shown[0] - shown[2]).toBeGreaterThan(honest[0] - honest[2])
  })
})
