// The one mark on a thought that is yours rather than the app's reading of
// it. Which means the app must never widen it, never guess it, and never
// choke on one it does not recognise.
import { describe, expect, it } from 'vitest'
import { TINTS, TINT_NAMES, isTint, tintOf, tintRGB } from './tints'

describe('the colours you can give a thing', () => {
  it('is a palette you can hold in your head', () => {
    // six is the count a person can learn as a language; a picker is a
    // decision every time you use it
    expect(TINT_NAMES).toHaveLength(6)
    expect(new Set(Object.values(TINTS)).size).toBe(6)
  })

  it('is a plain rgb triplet, because the stylesheet composes it', () => {
    // the drop is glass: the colour is laid over the blur as rgba() at
    // several opacities, so it cannot be a hex or a named colour
    for (const n of TINT_NAMES) {
      expect(tintRGB(n), n).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/)
    }
  })

  it('reads a colour off a thought', () => {
    expect(tintOf({ tint: 'moss' })).toBe('moss')
  })

  it('says no to anything it does not know', () => {
    // extra is a free-form blob written by several flows and by older
    // versions of this app; a stray value must not become a CSS variable
    expect(tintOf({ tint: 'chartreuse' })).toBeNull()
    expect(tintOf({ tint: 42 })).toBeNull()
    expect(tintOf({ tint: null })).toBeNull()
    expect(tintOf({})).toBeNull()
    expect(tintOf(null)).toBeNull()
    expect(tintOf(undefined)).toBeNull()
    expect(isTint('constructor')).toBe(false)
  })
})
