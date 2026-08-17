import { describe, expect, it } from 'vitest'
import { LEVELS } from './levels'
import { apply, hue, initial, moves, totalMass, won, type Level } from './rules'
import { blend, within } from './color'
import { par, solve } from './solve'

/** The colour the sky would be if every drop in it were tipped into one pot. */
const wholeSky = (l: Level) => blend(...l.drops.map((d) => hue(d.color)))

describe('every level', () => {
  it.each(LEVELS.map((l) => [l.id, l.name, l] as const))(
    '%i %s adds up, can be finished, and its par is a real line',
    (_id, _name, level) => {
      const target = hue(level.target)

      // between them the drops carry every primary the core is made of…
      expect(wholeSky(level)).toBe(target)
      // …and no drop carries one it is not, which nothing could ever undo
      for (const d of level.drops) expect(within(hue(d.color), target)).toBe(true)
      // …and none starts over the cap
      for (const d of level.drops) expect(d.mass ?? 1).toBeLessThanOrEqual(level.cap)

      const found = solve(initial(level), level)
      expect(found).not.toBeNull()

      // the line the solver found really does finish it
      let s = initial(level)
      for (const m of found!.line) s = apply(s, level, m)
      expect(won(s)).toBe(true)
      expect(s.core).toBeCloseTo(totalMass(level), 6)
      expect(s.moves).toBe(found!.line.length)
      expect(par(level)).toBe(found!.line.length)
    },
  )

  it('sets the takes exactly: enough to empty the sky, and not one spare', () => {
    for (const level of LEVELS) {
      const total = totalMass(level)
      expect(total).toBeLessThanOrEqual(level.cap * level.takes)
      // one fewer opening could not have done it, so the number is a rule
      // rather than a suggestion, and the sky arrives in exactly that many
      expect(total).toBeGreaterThan(level.cap * (level.takes - 1))
    }
  })

  it('can be lost inside two moves — a sky with no wrong answer is not a puzzle', () => {
    // Level 1 is the tutorial: it has exactly one line through it, on purpose.
    for (const level of LEVELS.filter((l) => l.id > 1)) {
      const start = initial(level)
      const ruinous = moves(start, level).some((a) => {
        const one = apply(start, level, a)
        if (solve(one, level) === null) return true
        return moves(one, level).some((b) => solve(apply(one, level, b), level) === null)
      })
      expect(`${level.name}: ${ruinous}`).toBe(`${level.name}: true`)
    }
  })

  it('has ten of them, and they get longer', () => {
    expect(LEVELS).toHaveLength(10)
    expect(par(LEVELS[0])).toBeLessThan(par(LEVELS[9]))
  })
})
