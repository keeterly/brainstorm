import { describe, expect, it } from 'vitest'
import { card, clearance, contact, disc, normal, oilPath, pull, rim, sd } from './shape'

describe('measuring a body', () => {
  it('measures a disc the way a circle measures', () => {
    const d = disc(0, 0, 40)
    expect(sd(d, 0, 0)).toBeCloseTo(-40, 4)
    expect(sd(d, 40, 0)).toBeCloseTo(0, 4)
    expect(sd(d, 100, 0)).toBeCloseTo(60, 4)
    expect(sd(d, 0, -70)).toBeCloseTo(30, 4)
  })
  it('measures a card by its edges, not by a circle around it', () => {
    const c = card(0, 0, 150, 40, 20)
    // straight out from the middle of a long edge
    expect(sd(c, 0, 40)).toBeCloseTo(0, 4)
    expect(sd(c, 0, 60)).toBeCloseTo(20, 4)
    // out past the end
    expect(sd(c, 170, 0)).toBeCloseTo(20, 4)
    // the corner is the far point, and it is nearer than a bounding circle
    expect(sd(c, 150, 40)).toBeGreaterThan(0)
    expect(sd(c, 150, 40)).toBeLessThan(Math.hypot(150, 40) - 40)
  })
  it('points the way out from wherever you are', () => {
    const c = card(0, 0, 150, 40, 20)
    const [nx, ny] = normal(c, 0, 60)
    expect(nx).toBeCloseTo(0, 2)
    expect(ny).toBeCloseTo(1, 2)
    const [ex] = normal(c, 200, 0)
    expect(ex).toBeCloseTo(1, 2)
  })
})

describe('two bodies deciding how far apart they are', () => {
  it('agrees with circles when both bodies are circles', () => {
    const a = disc(0, 0, 40)
    const b = disc(110, 0, 30)
    expect(clearance(a, b)).toBeCloseTo(40, 4)
    expect(contact(a, b)).toBeNull()
    expect(contact(a, b, 50)?.depth).toBeCloseTo(10, 4)
  })
  it('lets a drop sit closer to the flat of a card than to a circle round it', () => {
    const c = card(0, 0, 150, 40, 20)
    const d = disc(0, 90, 34)
    // by the true shape they are 16 apart
    expect(clearance(c, d)).toBeCloseTo(16, 4)
    // a bounding circle would have called it an overlap and shoved it away
    expect(90 - (Math.hypot(150, 40) + 34)).toBeLessThan(0)
  })
  it('pushes a drop off the end of a card sideways, not diagonally', () => {
    const c = card(0, 0, 150, 40, 20)
    const hit = contact(c, disc(180, 0, 34), 6)
    expect(hit).not.toBeNull()
    expect(hit!.nx).toBeCloseTo(1, 2)
    expect(hit!.ny).toBeCloseTo(0, 2)
    expect(hit!.depth).toBeCloseTo(150 + 34 + 6 - 180, 3)
  })
  it('resolves an overlap in one move, whatever the shapes', () => {
    const c = card(0, 0, 150, 40, 20)
    const d = disc(120, 20, 34)
    const hit = contact(c, d, 8)!
    expect(hit.depth).toBeGreaterThan(0)
    const moved = disc(d.x + hit.nx * hit.depth, d.y + hit.ny * hit.depth, 34)
    expect(clearance(c, moved)).toBeGreaterThan(8 - 0.5)
  })
})

describe('finding a body’s surface', () => {
  it('lands on a disc exactly where trigonometry says it should', () => {
    const d = disc(10, -5, 40)
    for (const a of [0, 1, 2.2, -3, 5.5]) {
      const [x, y] = rim(d, a)
      expect(x).toBeCloseTo(10 + Math.cos(a) * 40, 2)
      expect(y).toBeCloseTo(-5 + Math.sin(a) * 40, 2)
    }
  })
  it('lands on a card’s real edge, which a circle would miss', () => {
    const c = card(0, 0, 150, 40, 20)
    const [x, y] = rim(c, Math.PI / 2)
    expect(x).toBeCloseTo(0, 2)
    expect(y).toBeCloseTo(40, 2)
    const [ex] = rim(c, 0)
    expect(ex).toBeCloseTo(150, 2)
  })
  it('always lands on the surface, at any angle', () => {
    const c = card(3, 7, 120, 46, 22)
    for (let a = -Math.PI; a < Math.PI; a += 0.11) {
      const [x, y] = rim(c, a)
      expect(Math.abs(sd(c, x, y))).toBeLessThan(0.01)
    }
  })
})

describe('nothing here is a true circle', () => {
  it('leaves a body without a seed exactly the primitive it is', () => {
    const d = disc(0, 0, 40)
    for (const a of [0, 1, 2.2, -3]) expect(sd(d, Math.cos(a) * 40, Math.sin(a) * 40)).toBeCloseTo(0, 6)
  })
  it('wanders off the primitive once it has one, but only just', () => {
    const d = disc(0, 0, 40, 0.37)
    const offs: number[] = []
    for (let a = -Math.PI; a < Math.PI; a += 0.05) offs.push(-sd(d, Math.cos(a) * 40, Math.sin(a) * 40))
    const hi = Math.max(...offs)
    const lo = Math.min(...offs)
    expect(hi - lo).toBeGreaterThan(1) // genuinely irregular
    expect(hi).toBeLessThan(40 * 0.06) // and still a drop
    expect(lo).toBeGreaterThan(-40 * 0.06)
  })
  it('closes on itself — the same bearing is the same surface', () => {
    const d = disc(0, 0, 40, 0.61)
    for (const a of [0.3, 1.9, -2.2]) {
      expect(sd(d, Math.cos(a) * 50, Math.sin(a) * 50)).toBeCloseTo(sd(d, Math.cos(a + Math.PI * 2) * 50, Math.sin(a + Math.PI * 2) * 50), 6)
    }
  })
  it('gives every thought its own imperfection, and the same one every time', () => {
    const at = (seed: number) => sd(disc(0, 0, 40, seed), 44, 0)
    expect(at(0.2)).not.toBeCloseTo(at(0.8), 2)
    expect(at(0.2)).toBe(at(0.2))
  })
  it('still finds the surface, and still separates, with the wander on', () => {
    const c = card(0, 0, 150, 40, 40, 0.44)
    for (let a = -Math.PI; a < Math.PI; a += 0.09) {
      const [x, y] = rim(c, a)
      expect(Math.abs(sd(c, x, y))).toBeLessThan(0.02)
    }
    const d = disc(120, 20, 34, 0.7)
    const hit = contact(c, d, 8)!
    expect(hit.depth).toBeGreaterThan(0)
    const moved = disc(d.x + hit.nx * hit.depth, d.y + hit.ny * hit.depth, 34, 0.7)
    expect(clearance(c, moved)).toBeGreaterThan(8 - 1)
  })
})

describe('bodies globbing into each other', () => {
  it('does not reach across the room', () => {
    expect(pull(disc(0, 0, 40), disc(400, 0, 40))).toBe(0)
    expect(oilPath(disc(0, 0, 40), disc(400, 0, 40))).toBeNull()
  })
  it('comes on as they close, and is strongest when they touch', () => {
    const far = pull(disc(0, 0, 40), disc(100, 0, 40))
    const near = pull(disc(0, 0, 40), disc(86, 0, 40))
    expect(near).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(0)
    expect(pull(disc(0, 0, 40), disc(80, 0, 40))).toBe(1)
  })
  it('reaches about as far for a big drop as for a small one', () => {
    // a bridge is about as long as a bridge can be. When reach scaled with the
    // body, big drops threw long faint necks at each other across open sky
    // while small ones packed in a ring barely joined at all.
    const gapAt = (r: number) => {
      let g = 0
      while (g < 400 && pull(disc(0, 0, r), disc(r * 2 + g, 0, r)) > 0) g++
      return g
    }
    const small = gapAt(20)
    const big = gapAt(120)
    expect(small).toBeGreaterThan(14)
    expect(big).toBeLessThan(small * 2.6)
    // and a big pair 60 apart is not joined, which is what looked wrong
    expect(pull(disc(0, 0, 120), disc(300, 0, 120))).toBe(0)
  })
  it('draws a closed neck with no bad numbers, at any separation', () => {
    for (let gap = -6; gap < 40; gap += 1.5) {
      const d = oilPath(disc(0, 0, 40), disc(80 + gap, 12, 34))
      if (!d) continue
      expect(d.fill).toMatch(/^M /)
      expect(d.fill.endsWith('Z')).toBe(true)
      expect(d.fill).not.toMatch(/NaN|Infinity|undefined/)
    }
  })
  it('rims only its own two edges — a drop is glass, and a chord across its face would show', () => {
    const d = oilPath(disc(0, 0, 40), disc(92, 0, 36))!
    // two open curves, no close, no chords
    expect(d.rim.match(/M /g)).toHaveLength(2)
    expect(d.rim.match(/C /g)).toHaveLength(2)
    expect(d.rim).not.toContain('L')
    expect(d.rim).not.toContain('Z')
    // and the fill is the same two curves, closed up through the bodies
    expect(d.fill).toContain('L')
    expect(d.fill.endsWith('Z')).toBe(true)
  })
  it('grows off the flat of a card, not off a circle around it', () => {
    const c = card(0, 0, 150, 40, 20)
    const d = oilPath(c, disc(0, 86, 34))
    expect(d).toBeTruthy()
    // the two ends on the card sit on its bottom edge, well inside the corners
    const [, x1, y1] = /^M (-?[\d.]+) (-?[\d.]+)/.exec(d!.fill)!.map(Number) as unknown as number[]
    expect(y1).toBeCloseTo(40, 0)
    expect(Math.abs(x1)).toBeLessThan(150)
  })
  it('is the same neck every time, so it never flickers', () => {
    const a = disc(0, 0, 40)
    const b = disc(92, 0, 36)
    expect(oilPath(a, b)!.fill).toBe(oilPath(a, b)!.fill)
  })
  it('stays finite as a card and a drop pass right through each other', () => {
    const c = card(0, 0, 150, 40, 20)
    for (let y = 140; y > -140; y -= 4) {
      const d = oilPath(c, disc(20, y, 34))
      if (d) expect(d.fill + d.rim).not.toMatch(/NaN|Infinity|undefined/)
    }
  })
})
