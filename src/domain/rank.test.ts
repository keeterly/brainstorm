import { describe, expect, it } from 'vitest'
import { between, ordered, RANK_STEP, rankOf, spread } from './rank'
import type { Thought } from './types'

let n = 0
function thing(extra: Record<string, unknown> = {}, created = '2026-01-01T00:00:00Z'): Thought {
  return {
    id: `t${++n}`,
    user_id: 'u',
    raw_content: '',
    title: null,
    summary: null,
    type: 'idea',
    status: 'open',
    bucket: null,
    source: 'text',
    confidence: null,
    urgency: null,
    importance: null,
    effort: null,
    due_date: null,
    snooze_until: null,
    project_id: null,
    image_path: null,
    extra,
    created_at: created,
    updated_at: created,
    completed_at: null,
  }
}

describe('reading a rank', () => {
  it('is absent until something has been placed', () => {
    expect(rankOf(thing())).toBeNull()
  })
  it('ignores anything that is not a real number', () => {
    // extra is a free-form blob; it can hold whatever an older build wrote
    for (const bad of ['3', null, NaN, Infinity, {}, []]) {
      expect(rankOf(thing({ rank: bad }))).toBeNull()
    }
    expect(rankOf(thing({ rank: 0 }))).toBe(0)
    expect(rankOf(thing({ rank: -4.5 }))).toBe(-4.5)
  })
})

describe('putting a list in order', () => {
  it('follows the ranks', () => {
    const a = thing({ rank: 300 })
    const b = thing({ rank: 100 })
    const c = thing({ rank: 200 })
    expect(ordered([a, b, c]).map((t) => t.id)).toEqual([b.id, c.id, a.id])
  })

  it('leaves a list nobody has arranged exactly as it came', () => {
    // Nothing carries a rank until the first drag, so this is the normal case
    // and it must be a no-op. Falling back to created_at here looks sensible
    // and is wrong: a group's contents are very often written inside the same
    // millisecond, so the tiebreak lands on the id, which is random.
    const a = thing({}, '2026-03-02T00:00:00Z')
    const b = thing({}, '2026-03-01T00:00:00Z')
    expect(ordered([a, b]).map((t) => t.id)).toEqual([a.id, b.id])
    expect(ordered([b, a]).map((t) => t.id)).toEqual([b.id, a.id])
  })

  it('sends anything unplaced to the end of a list that has been arranged', () => {
    // which is where something added to a list you have already put in order
    // belongs — at the bottom, not silently first
    const placed = thing({ rank: 5 })
    const loose = thing({})
    expect(ordered([loose, placed]).map((t) => t.id)).toEqual([placed.id, loose.id])
  })

  it('holds unplaced things in their relative places rather than shuffling them', () => {
    const a = thing({ rank: 0 })
    const b = thing({})
    const c = thing({})
    expect(ordered([a, b, c]).map((t) => t.id)).toEqual([a.id, b.id, c.id])
    expect(ordered([a, c, b]).map((t) => t.id)).toEqual([a.id, c.id, b.id])
  })

  it('leaves the list it was given alone', () => {
    const list = [thing({ rank: 2 }), thing({ rank: 1 })]
    const before = list.map((t) => t.id)
    ordered(list)
    expect(list.map((t) => t.id)).toEqual(before)
  })
})

describe('finding room between two neighbours', () => {
  it('gives a first rank to an empty list', () => {
    expect(between(null, null)).toBe(0)
  })
  it('goes a step above the last and a step below the first', () => {
    expect(between(500, null)).toBe(500 + RANK_STEP)
    expect(between(null, 500)).toBe(500 - RANK_STEP)
  })
  it('lands halfway, touching neither neighbour', () => {
    const r = between(0, RANK_STEP) as number
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(RANK_STEP)
  })
  it('refuses a pair that is not in order', () => {
    expect(between(9, 9)).toBeNull()
    expect(between(9, 2)).toBeNull()
  })

  it('says so when the gap has finally run out, rather than duplicating a rank', () => {
    // this is the failure this shape is prone to: halve a gap enough times and
    // the midpoint IS one of its ends, and two rows silently share a rank.
    // Dropping over and over just above the same neighbour is what gets there —
    // a gap between two ranks of ordinary size runs out of mantissa in about
    // fifty moves, which one determined afternoon can reach.
    const lo = RANK_STEP
    let hi = RANK_STEP * 2
    let steps = 0
    for (;;) {
      const mid = between(lo, hi)
      if (mid === null) break
      expect(mid).toBeGreaterThan(lo)
      expect(mid).toBeLessThan(hi)
      hi = mid
      if (++steps > 200) throw new Error('never ran out, so the guard is unreachable')
    }
    expect(steps).toBeGreaterThan(40)
    expect(steps).toBeLessThan(70)
  })

  it('never lands on a neighbour, however far in it is', () => {
    // the guard exists because a rank equal to its neighbour is not a wrong
    // order, it is *no* order — two rows that swap places on every render
    let lo = RANK_STEP
    let hi = RANK_STEP * 2
    for (let i = 0; i < 60; i++) {
      const mid = between(lo, hi)
      if (mid === null) break
      expect(mid).not.toBe(lo)
      expect(mid).not.toBe(hi)
      if (i % 2) lo = mid
      else hi = mid
    }
  })

  it('has room again once the list has been spread out', () => {
    // which is the whole reason exhaustion is reported rather than swallowed
    const s = spread(3)
    expect(between(s[0], s[1])).not.toBeNull()
    expect(between(s[1], s[2])).not.toBeNull()
  })
})

describe('spreading a list out again', () => {
  it('leaves a full step between every pair', () => {
    const s = spread(4)
    expect(s).toEqual([0, RANK_STEP, RANK_STEP * 2, RANK_STEP * 3])
    for (let i = 1; i < s.length; i++) expect(between(s[i - 1], s[i])).not.toBeNull()
  })
  it('handles the empty and single cases', () => {
    expect(spread(0)).toEqual([])
    expect(spread(1)).toEqual([0])
  })
})
