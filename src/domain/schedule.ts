// Time, which is the one thing this app has never had an opinion about.
//
// The graph already knows what the work is, what each piece costs, and what has
// to come before what. `plan.ts` turns that into an order. What no part of the
// app could answer is the only question anybody actually asks on a Tuesday
// morning: what am I doing today. An order is not an answer to that — the tenth
// thing on a correct list is still a thing you will never reach this week, and a
// list that does not know that will cheerfully tell you to do all ten.
//
// So: a week has a size, and the size is measured rather than declared. Nothing
// in here talks to the store, the network or the clock — `today` is passed in —
// so all of it is testable against a graph somebody wrote by hand.
import { planOrder, waitingOn } from './plan'
import { addDays } from './prioritize-prepass'
import type { Relationship, Thought } from './types'

/**
 * What a step costs when nobody sized it.
 *
 * `rain` sizes every step it writes 1–5. A step you typed yourself has no
 * effort at all, and counting it as nothing would make a week of hand-written
 * work look like a week off. Two rather than the midpoint of three: the things
 * people type between other things are, measurably, the small ones.
 */
export const UNSIZED = 2

/** How much a week holds before it has watched you work. */
export const DEFAULT_WEEK = 8

/** How many weeks back it looks. Longer remembers a season you are no longer in. */
const WINDOW = 6

/** Before this many finished weeks, it is guessing, and says so. */
const TRUST_AFTER = 2

/**
 * The days a week's work is spread over.
 *
 * Five, and Saturday and Sunday left empty. Not a claim about anybody's life —
 * a default that can be moved off, once a step can be dragged. What it buys is
 * that "a week" and "the days in it" agree: spread over seven, every week looks
 * survivable and none of them are.
 */
const RESTS_ON = new Set([0, 6])

export const effortOf = (t: Thought): number =>
  typeof t.effort === 'number' ? Math.max(1, Math.min(5, Math.round(t.effort))) : UNSIZED

/** The Monday on or before a date. */
/**
 * Which day of the week a date is, without falling into a timezone.
 *
 * Anchored at noon, exactly as `addDays` is: parsing `2026-03-02T00:00:00` gives
 * local midnight, and an hour of that either way — a daylight-saving boundary,
 * or reading it back out through UTC — lands on the day before. Noon has twelve
 * hours of clearance in both directions.
 */
export function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getDay()
}

export function weekOf(iso: string): string {
  // getDay is Sunday-first; a week that starts on Sunday puts Monday's work in
  // last week and makes every measurement off by one for two sevenths of it
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7))
}

const isRestDay = (iso: string) => RESTS_ON.has(dayOfWeek(iso))

/** The next day anything is done on, today included. */
function workDayOnOrAfter(iso: string): string {
  let d = iso
  for (let i = 0; i < 7 && isRestDay(d); i++) d = addDays(d, 1)
  return d
}

export interface Capacity {
  /** how much a week holds */
  effort: number
  /** how many finished weeks that was read off — 0 means it is the default */
  weeksSeen: number
  /** …so the screen can say "about 8 a week" or "8 to start with, until it has watched you" */
  learned: boolean
}

/**
 * How much you actually get through in a week.
 *
 * Read off `completed_at`, which every tick writes, rather than asked for in a
 * setting. A number you typed into a box a month ago is a number about the
 * person you were a month ago, and the one thing everybody gets wrong about
 * their own week is how much of it there is.
 *
 * The median, not the mean: one heroic week and one week of flu are both real
 * and neither is what next week will be like. The week in progress is left out
 * — it is half over by definition, and counting it would drag the estimate down
 * every Monday and up every Friday.
 */
export function weeklyCapacity(thoughts: Thought[], today: string): Capacity {
  const thisWeek = weekOf(today)
  const per = new Map<string, number>()
  let earliest: string | null = null
  for (const t of thoughts) {
    if (t.status !== 'done' || !t.completed_at) continue
    const day = t.completed_at.slice(0, 10)
    const w = weekOf(day)
    // the week in progress is not evidence about a whole week
    if (w >= thisWeek) continue
    per.set(w, (per.get(w) ?? 0) + effortOf(t))
    if (!earliest || w < earliest) earliest = w
  }
  if (!earliest) return { effort: DEFAULT_WEEK, weeksSeen: 0, learned: false }

  // every week from the first one you finished anything in, so a week off counts
  // as the week off it was rather than vanishing from the record
  const weeks: number[] = []
  for (let w = addDays(thisWeek, -7 * WINDOW); w < thisWeek; w = addDays(w, 7)) {
    if (w < earliest) continue
    weeks.push(per.get(w) ?? 0)
  }
  if (weeks.length < TRUST_AFTER) return { effort: DEFAULT_WEEK, weeksSeen: weeks.length, learned: false }

  const sorted = [...weeks].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  // a run of genuinely empty weeks must not produce a week that holds nothing,
  // because then nothing is ever placed and the screen is blank for ever
  return { effort: Math.max(1, median), weeksSeen: weeks.length, learned: true }
}

export interface Placed {
  t: Thought
  /** the day it lands on, or null when it did not fit inside the horizon */
  day: string | null
  /** you put it there, not the app */
  pinned: boolean
  /** what it is waiting on, if anything — the thoughts themselves, for naming */
  blockers: Thought[]
  /** its own deadline has passed */
  late: boolean
}

export interface Placement {
  days: { date: string; items: Placed[] }[]
  /** did not fit in the horizon — real work, honestly deferred */
  later: Placed[]
  capacity: Capacity
}

export interface PlaceInput {
  steps: Thought[]
  rels: Relationship[]
  capacity: Capacity
  today: string
  /** thought id → the day you dragged it to */
  pinned?: Map<string, string>
  /** how many days ahead to place at all */
  horizon?: number
}

/**
 * Put the work on days.
 *
 * The rules, in the order they win:
 *
 *  1. **Nothing before the thing it waits on.** A step whose blocker lands on
 *     Thursday cannot land on Tuesday, however much room Tuesday has. This is
 *     the one rule that makes it a plan rather than a pile with dates.
 *  2. **A deadline beats capacity.** Something due Wednesday goes on Wednesday
 *     even if Wednesday is full, and something already late goes today. An
 *     overfull day you can see is a decision; a deadline quietly pushed past is
 *     the app losing your work for you.
 *  3. **Otherwise, in plan order, until the day is full.** A day holds a fifth
 *     of the week. One thing bigger than a whole day still gets a day — it does
 *     not get cut in half and it does not get postponed for ever.
 *
 * Everything past the horizon comes back as `later` rather than being dropped.
 */
export function placeWork(input: PlaceInput): Placement {
  const { steps, rels, capacity, today } = input
  const pinned = input.pinned ?? new Map<string, string>()
  const horizon = input.horizon ?? 28

  const open = steps.filter((s) => s.status === 'open')
  const byId = new Map(open.map((s) => [s.id, s] as const))
  const blocking = waitingOn(byId, rels)
  const ordered = planOrder(open, rels)

  // a day holds a fifth of the week, because the week is spread over five of them
  const perDay = Math.max(1, Math.ceil(capacity.effort / 5))
  const start = workDayOnOrAfter(today)
  const days: string[] = []
  for (let d = start, i = 0; i < horizon; d = addDays(d, 1), i++) if (!isRestDay(d)) days.push(d)

  const load = new Map<string, number>()
  const on = new Map<string, Placed[]>()
  const landed = new Map<string, string>()
  const later: Placed[] = []
  const put = (p: Placed, day: string) => {
    const list = on.get(day)
    if (list) list.push(p)
    else on.set(day, [p])
    load.set(day, (load.get(day) ?? 0) + effortOf(p.t))
    landed.set(p.t.id, day)
  }

  for (const t of ordered) {
    const blockers = (blocking.get(t.id) ?? []).map((id) => byId.get(id)).filter((b): b is Thought => !!b)
    // rule 1 — never before what it follows. Blockers come first in plan order,
    // so by here they are already placed; one that never landed holds this back
    // to the end of the horizon rather than letting it jump the queue.
    let floor = start
    let strandedBy = false
    for (const b of blockers) {
      const bd = landed.get(b.id)
      if (!bd) strandedBy = true
      else if (addDays(bd, 1) > floor) floor = workDayOnOrAfter(addDays(bd, 1))
    }
    const late = !!t.due_date && t.due_date < today
    const p: Placed = { t, day: null, pinned: pinned.has(t.id), blockers, late }

    if (strandedBy) {
      later.push(p)
      continue
    }
    // you moved it, so it goes where you put it — as long as that is not before
    // something it waits on, which would be the app honouring a drag by breaking
    // the plan
    const wish = pinned.get(t.id)
    if (wish && wish >= floor) {
      p.day = wish
      put(p, wish)
      continue
    }
    // rule 2 — a deadline, or a deadline already missed
    if (t.due_date && t.due_date <= addDays(today, horizon)) {
      const want = t.due_date < floor ? floor : t.due_date
      p.day = want
      put(p, want)
      continue
    }
    // rule 3 — the first day with room, at or after the floor
    const day = days.find((d) => d >= floor && (load.get(d) ?? 0) < perDay)
    if (!day) {
      later.push(p)
      continue
    }
    p.day = day
    put(p, day)
  }

  return {
    days: days.filter((d) => on.has(d)).map((date) => ({ date, items: on.get(date) as Placed[] })),
    later,
    capacity,
  }
}
