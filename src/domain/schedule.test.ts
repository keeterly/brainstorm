import { describe, expect, it } from 'vitest'
import { DEFAULT_WEEK, dayOfWeek, effortOf, placeWork, weekOf, weeklyCapacity, type Capacity } from './schedule'
import type { Relationship, Thought } from './types'

let n = 0
function step(p: Partial<Thought> & { id: string }): Thought {
  return {
    user_id: 'u',
    raw_content: p.id,
    title: p.id,
    type: 'action',
    status: 'open',
    effort: null,
    due_date: null,
    completed_at: null,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, n++)).toISOString(),
    ...p,
  } as Thought
}
const dep = (from: string, to: string): Relationship =>
  ({ id: `r${n++}`, user_id: 'u', from_id: from, to_id: to, type: 'depends_on' }) as Relationship

/** done on a given day, having cost a given effort */
const finished = (id: string, day: string, effort: number | null = 2) =>
  step({ id, status: 'done', effort, completed_at: `${day}T12:00:00.000Z` })

const cap = (effort: number): Capacity => ({ effort, weeksSeen: 4, learned: true })

// 2026-03-02 is a Monday; every date in here is chosen against that.
const MON = '2026-03-02'

describe('which week a day belongs to', () => {
  it('starts weeks on Monday, so Monday is not last week', () => {
    expect(weekOf(MON)).toBe(MON)
    expect(weekOf('2026-03-08')).toBe(MON) // the Sunday
    expect(weekOf('2026-03-09')).toBe('2026-03-09') // the next Monday
  })
})

describe('how much a week holds', () => {
  it('says it is guessing until it has watched two whole weeks', () => {
    const c = weeklyCapacity([finished('a', '2026-02-24', 3)], MON)
    expect(c.effort).toBe(DEFAULT_WEEK)
    expect(c.learned).toBe(false)
  })

  it('reads the number off what was actually ticked', () => {
    // three weeks of eight, and it should say eight rather than the default
    const done: Thought[] = []
    for (const w of ['2026-02-09', '2026-02-16', '2026-02-23']) {
      done.push(finished(`${w}-a`, w, 5), finished(`${w}-b`, w, 3))
    }
    const c = weeklyCapacity(done, MON)
    expect(c.learned).toBe(true)
    expect(c.effort).toBe(8)
  })

  it('is not carried away by one heroic week, or one week of flu', () => {
    /*
     * The median, not the mean. Both of those weeks really happened and neither
     * is what next week is going to be like.
     */
    const done = [
      finished('a', '2026-02-02', 5),
      finished('b', '2026-02-09', 5),
      finished('c', '2026-02-09', 5),
      finished('d', '2026-02-16', 5),
      ...Array.from({ length: 8 }, (_, i) => finished(`heroic${i}`, '2026-02-23', 5)),
    ]
    const c = weeklyCapacity(done, MON)
    expect(c.effort).toBeLessThan(15)
    expect(c.effort).toBeGreaterThanOrEqual(5)
  })

  it('leaves the week in progress out of it', () => {
    // half a week is not evidence about a whole one — counting it would drag
    // the number down every Monday and up every Friday
    const done = [
      finished('old1', '2026-02-16', 4),
      finished('old2', '2026-02-23', 4),
      finished('today', MON, 5),
    ]
    expect(weeklyCapacity(done, MON).effort).toBe(4)
  })

  it('counts a week you took off as the week off it was', () => {
    const done = [finished('a', '2026-02-09', 6), finished('b', '2026-02-23', 6)]
    // 2026-02-16 is empty and sits between two working weeks
    expect(weeklyCapacity(done, MON).effort).toBeLessThan(6)
  })

  it('gives a hand-typed step a size rather than counting it as nothing', () => {
    expect(effortOf(step({ id: 'x' }))).toBeGreaterThan(0)
    expect(effortOf(step({ id: 'y', effort: 4 }))).toBe(4)
    // and nothing outside 1–5, whatever the graph says
    expect(effortOf(step({ id: 'z', effort: 99 }))).toBe(5)
  })

  it('never says a week holds nothing, however quiet the record', () => {
    // a week that holds nothing places nothing, and the screen is blank for ever
    const done = [finished('a', '2026-01-26', 1), finished('b', '2026-02-23', 0 as unknown as number)]
    expect(weeklyCapacity(done, MON).effort).toBeGreaterThanOrEqual(1)
  })
})

describe('putting the work on days', () => {
  it('never puts a step before the thing it waits on', () => {
    /*
     * The one rule that makes this a plan rather than a pile with dates on it.
     */
    const steps = [step({ id: 'after', effort: 1 }), step({ id: 'first', effort: 5 })]
    const out = placeWork({ steps, rels: [dep('after', 'first')], capacity: cap(2), today: MON })
    const day = (id: string) => out.days.find((d) => d.items.some((i) => i.t.id === id))?.date
    expect(day('first')).toBeTruthy()
    expect(day('after') as string > (day('first') as string)).toBe(true)
  })

  it('names what a step is waiting on rather than only holding it back', () => {
    const steps = [step({ id: 'after' }), step({ id: 'first' })]
    const out = placeWork({ steps, rels: [dep('after', 'first')], capacity: cap(8), today: MON })
    const placed = out.days.flatMap((d) => d.items).find((i) => i.t.id === 'after')
    expect(placed?.blockers.map((b) => b.id)).toEqual(['first'])
  })

  it('honours a deadline even when the day is already full', () => {
    // an overfull day you can see is a decision; a deadline quietly pushed past
    // is the app losing your work for you
    const steps = [
      step({ id: 'filler1', effort: 5 }),
      step({ id: 'filler2', effort: 5 }),
      step({ id: 'due', effort: 5, due_date: MON }),
    ]
    const out = placeWork({ steps, rels: [], capacity: cap(2), today: MON })
    expect(out.days.find((d) => d.date === MON)?.items.some((i) => i.t.id === 'due')).toBe(true)
  })

  it('brings something already late to today, and says that it is', () => {
    const steps = [step({ id: 'late', due_date: '2026-02-20' })]
    const out = placeWork({ steps, rels: [], capacity: cap(8), today: MON })
    const p = out.days.flatMap((d) => d.items).find((i) => i.t.id === 'late')
    expect(p?.day).toBe(MON)
    expect(p?.late).toBe(true)
  })

  it('fills a day to about a fifth of the week and then moves on', () => {
    const steps = Array.from({ length: 6 }, (_, i) => step({ id: `s${i}`, effort: 2 }))
    const out = placeWork({ steps, rels: [], capacity: cap(10), today: MON })
    // 10 a week is 2 a day, so six twos cannot all be Monday
    expect(out.days[0].items.length).toBeLessThan(6)
    expect(out.days.length).toBeGreaterThan(1)
  })

  it('gives one thing bigger than a whole day a day of its own', () => {
    // it does not get cut in half, and it does not get postponed for ever
    const steps = [step({ id: 'huge', effort: 5 })]
    const out = placeWork({ steps, rels: [], capacity: cap(2), today: MON })
    expect(out.days.flatMap((d) => d.items).map((i) => i.t.id)).toEqual(['huge'])
  })

  it('rests at the weekend', () => {
    const steps = Array.from({ length: 12 }, (_, i) => step({ id: `s${i}`, effort: 5 }))
    const out = placeWork({ steps, rels: [], capacity: cap(5), today: MON })
    const weekend = out.days.filter((d) => [0, 6].includes(dayOfWeek(d.date)))
    expect(weekend, weekend.map((d) => d.date).join(', ')).toHaveLength(0)
  })

  it('starts on Monday when you ask it on a Sunday', () => {
    const out = placeWork({ steps: [step({ id: 'a' })], rels: [], capacity: cap(8), today: '2026-03-01' })
    expect(out.days[0].date).toBe(MON)
  })

  it('puts what you moved where you moved it', () => {
    const steps = [step({ id: 'a' }), step({ id: 'b' })]
    const out = placeWork({
      steps,
      rels: [],
      capacity: cap(8),
      today: MON,
      pinned: new Map([['b', '2026-03-05']]),
    })
    const p = out.days.flatMap((d) => d.items).find((i) => i.t.id === 'b')
    expect(p?.day).toBe('2026-03-05')
    expect(p?.pinned).toBe(true)
  })

  it('will not honour a drag that would break the plan', () => {
    // dragging a step in front of the thing it waits on is not a scheduling
    // preference, it is a contradiction — the plan wins and it stays put
    const steps = [step({ id: 'after' }), step({ id: 'first' })]
    const out = placeWork({
      steps,
      rels: [dep('after', 'first')],
      capacity: cap(8),
      today: MON,
      pinned: new Map([['after', MON]]),
    })
    const a = out.days.flatMap((d) => d.items).find((i) => i.t.id === 'after')
    const f = out.days.flatMap((d) => d.items).find((i) => i.t.id === 'first')
    expect((a?.day as string) > (f?.day as string)).toBe(true)
  })

  it('defers what does not fit rather than dropping it', () => {
    const steps = Array.from({ length: 40 }, (_, i) => step({ id: `s${i}`, effort: 5 }))
    const out = placeWork({ steps, rels: [], capacity: cap(5), today: MON, horizon: 7 })
    const placed = out.days.flatMap((d) => d.items).length
    expect(placed + out.later.length).toBe(40)
    expect(out.later.length).toBeGreaterThan(0)
  })

  it('leaves finished work out of the week entirely', () => {
    const steps = [step({ id: 'done', status: 'done' }), step({ id: 'open' })]
    const out = placeWork({ steps, rels: [], capacity: cap(8), today: MON })
    expect(out.days.flatMap((d) => d.items).map((i) => i.t.id)).toEqual(['open'])
  })

  it('does not hang or lose a step on a plan that disagrees with itself', () => {
    const steps = [step({ id: 'a' }), step({ id: 'b' })]
    const out = placeWork({ steps, rels: [dep('a', 'b'), dep('b', 'a')], capacity: cap(8), today: MON })
    expect(out.days.flatMap((d) => d.items).length + out.later.length).toBe(2)
  })
})
