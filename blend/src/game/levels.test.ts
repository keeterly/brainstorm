import { describe, expect, it } from 'vitest'
import { LEVELS } from './levels'
import { hue, initial, apply, won, totalMass, type Level } from './rules'
import { blend, delta } from './color'
import { par, solve } from './solve'

/** The colour the sky would be if every drop in it were tipped into one pot. */
const wholeSky = (l: Level) =>
  blend(l.drops.map((d) => ({ color: hue(d.color), mass: d.mass ?? 1 })))

describe('every level', () => {
  it.each(LEVELS.map((l) => [l.id, l.name, l] as const))(
    '%i %s balances, can be finished, and its par is a real line',
    (_id, _name, level) => {
      // it adds up: everything reaches the core as the core's colour, so the
      // whole sky averages to the core's colour or it can never be emptied
      expect(delta(wholeSky(level), hue(level.target))).toBeLessThan(1e-9)

      const found = solve(initial(level), level)
      expect(found).not.toBeNull()

      // and the line the solver found really does finish it
      let s = initial(level)
      for (const m of found!.line) s = apply(s, level, m)
      expect(won(s)).toBe(true)
      expect(s.core).toBeCloseTo(totalMass(level), 6)
      expect(s.moves).toBe(found!.line.length)
      expect(par(level)).toBe(found!.line.length)
    },
  )

  it('has ten of them, and they get longer', () => {
    expect(LEVELS).toHaveLength(10)
    expect(par(LEVELS[0])).toBeLessThan(par(LEVELS[9]))
  })

  it('needs every drop — none of them can be finished with one to spare', () => {
    for (const level of LEVELS) {
      const short = { ...level, drops: level.drops.slice(1) }
      expect(solve(initial(short), short)).toBeNull()
    }
  })
})
