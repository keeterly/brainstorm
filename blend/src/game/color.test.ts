import { describe, expect, it } from 'vitest'
import { blend, HUE, missing, nameOf, primaries, same, tint, within } from './color'

describe('blending', () => {
  it('makes the six colours a child would expect', () => {
    expect(blend(HUE.red, HUE.yellow)).toBe(HUE.orange)
    expect(blend(HUE.yellow, HUE.blue)).toBe(HUE.green)
    expect(blend(HUE.red, HUE.blue)).toBe(HUE.violet)
    expect(blend(HUE.red, HUE.yellow, HUE.blue)).toBe(HUE.ink)
  })

  it('lets the same colour join itself and stay itself', () => {
    expect(blend(HUE.red, HUE.red)).toBe(HUE.red)
    expect(blend(HUE.green, HUE.green)).toBe(HUE.green)
  })

  it('ignores a primary a colour already has', () => {
    expect(blend(HUE.orange, HUE.red)).toBe(HUE.orange)
    expect(blend(HUE.orange, HUE.yellow)).toBe(HUE.orange)
  })

  it('goes to ink when a secondary meets the primary it lacks, and stays there', () => {
    expect(blend(HUE.orange, HUE.blue)).toBe(HUE.ink)
    expect(blend(HUE.green, HUE.violet)).toBe(HUE.ink)
    expect(blend(HUE.ink, HUE.clear)).toBe(HUE.ink)
  })

  it('does not care what order the pot was filled in', () => {
    expect(blend(HUE.red, HUE.blue, HUE.yellow)).toBe(blend(HUE.yellow, HUE.red, HUE.blue))
    expect(blend(blend(HUE.red, HUE.red), HUE.yellow)).toBe(blend(HUE.red, blend(HUE.red, HUE.yellow)))
  })

  it('only ever grows — nothing here takes a colour back out', () => {
    for (const a of Object.values(HUE))
      for (const b of Object.values(HUE)) expect(within(a, blend(a, b))).toBe(true)
  })

  it('adds nothing when clear joins in', () => {
    expect(blend(HUE.clear, HUE.violet)).toBe(HUE.violet)
    expect(primaries(HUE.clear)).toEqual([])
  })
})

describe('reading a colour', () => {
  it('names all seven, and paints all seven', () => {
    const seen = new Set<string>()
    for (const [name, h] of Object.entries(HUE)) {
      expect(nameOf(h)).toBe(name)
      expect(tint(h)).toMatch(/^\d+, \d+, \d+$/)
      seen.add(tint(h))
    }
    expect(seen.size).toBe(8)
  })

  it('knows what a drop still needs, and when it is past needing anything', () => {
    expect(missing(HUE.red, HUE.orange)).toBe(HUE.yellow)
    expect(missing(HUE.orange, HUE.orange)).toBe(HUE.clear)
    // an ink drop can never be an orange one again
    expect(missing(HUE.ink, HUE.orange)).toBe(-1)
  })

  it('counts a colour as the same only when it is exactly the same', () => {
    expect(same(HUE.orange, blend(HUE.red, HUE.yellow))).toBe(true)
    expect(same(HUE.orange, HUE.ink)).toBe(false)
    expect(same(HUE.orange, HUE.red)).toBe(false)
  })
})
