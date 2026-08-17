// Layout arithmetic gets exactly one chance to be wrong before it is invisible:
// a NaN radius does not throw, it just quietly puts every drop in the top-left
// corner and draws no skins at all. That is what these check for, on the real
// levels, at the sizes people actually hold.
import { describe, expect, it } from 'vitest'
import { LEVELS } from '@/game/levels'
import { initial } from '@/game/rules'
import { dropR, layout } from './field'

const GLASS = [
  { name: 'small phone', w: 320, h: 568 },
  { name: 'phone', w: 390, h: 844 },
  { name: 'tablet', w: 834, h: 1112 },
  { name: 'desk', w: 1440, h: 900 },
]

describe.each(GLASS)('on a $name', ({ w, h }) => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('places level %i somewhere real', (_id, level) => {
    const s = initial(level)
    const scene = layout(s, level, w, h)
    const finite = (n: number) => Number.isFinite(n)

    expect(finite(scene.core.x) && finite(scene.core.y) && finite(scene.core.R)).toBe(true)
    expect(scene.scale).toBeGreaterThan(0.2)
    expect(scene.rings).toHaveLength(s.membranes.length)

    for (const r of scene.rings) {
      expect(finite(r.x) && finite(r.y) && finite(r.R)).toBe(true)
      expect(r.R).toBeGreaterThan(20)
      if (!r.parent) {
        // a skin nobody can reach is a skin nobody can play
        expect(r.x - r.R).toBeGreaterThan(-1)
        expect(r.x + r.R).toBeLessThan(w + 1)
        expect(r.y - r.R).toBeGreaterThanOrEqual(scene.top - 1)
        expect(r.y + r.R).toBeLessThanOrEqual(scene.bottom + 1)
        // …and one that swallows the core is a skin you cannot deliver to
        expect(Math.hypot(r.x - scene.core.x, r.y - scene.core.y)).toBeGreaterThan(
          r.R + scene.core.R,
        )
      }
    }

    for (const d of s.drops) {
      const home = scene.homes[d.id]
      expect(home).toBeDefined()
      expect(finite(home.x) && finite(home.y)).toBe(true)
      const ring = scene.rings.find((r) => r.id === d.where)
      if (ring) {
        // every held drop starts inside the skin holding it, with its whole self
        const room = ring.R - dropR(d.mass) * scene.scale
        expect(Math.hypot(home.x - ring.x, home.y - ring.y)).toBeLessThanOrEqual(room + 0.5)
      } else {
        expect(home.x).toBeGreaterThan(0)
        expect(home.x).toBeLessThan(w)
        expect(home.y).toBeGreaterThanOrEqual(scene.top)
        expect(home.y).toBeLessThanOrEqual(scene.bottom)
      }
    }
  })
})

describe('a skin', () => {
  it('grows to hold what is in it', () => {
    const level = LEVELS[5] // Two Rooms — two drops behind each skin
    const scene = layout(initial(level), level, 390, 844)
    const one = LEVELS[3] // Skin — one drop behind one skin
    const lone = layout(initial(one), one, 390, 844)
    expect(scene.rings[0].R).toBeGreaterThan(lone.rings[0].R)
  })

  it('nests inside its parent, wholly', () => {
    const level = LEVELS[6] // Branch
    const scene = layout(initial(level), level, 390, 844)
    const outer = scene.rings.find((r) => !r.parent)!
    const inner = scene.rings.find((r) => r.parent)!
    expect(Math.hypot(inner.x - outer.x, inner.y - outer.y) + inner.R).toBeLessThanOrEqual(outer.R)
  })
})
