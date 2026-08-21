// Saying you are actually going to do something, and saying when.
//
// Two marks, both on `extra`, following the pattern every other mark in this app
// already uses — `canDraft`, `drafted_at`, `looked_at`, `kept`, `rank`. No
// migration, and nothing new in the schema for a fact this small.
//
// They are deliberately separate from the plan itself. A plan is what a thing
// takes; pursuing is whether you have decided to do it; a pinned day is where
// you want it. Storing any of those in the others would mean unticking one
// quietly changing another.
import { useGraph } from '@/store/graph'
import type { Thought } from '@/domain/types'

const S = () => useGraph.getState()
const ex = (t: Thought) => (t.extra ?? {}) as Record<string, unknown>

/** Have you said you are doing this one? */
export const isPursuing = (t: Thought): boolean => typeof ex(t).pursuing_since === 'string'

/** The day you moved this step to, if you moved it. */
export const pinnedDay = (t: Thought): string | null => {
  const d = ex(t).day
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/** Every step you have moved by hand, for the scheduler. */
export function pins(thoughts: Thought[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const t of thoughts) {
    const d = pinnedDay(t)
    if (d) out.set(t.id, d)
  }
  return out
}

export interface Undone {
  note: string
  undo: () => void
}

/**
 * Take something up, or put it down.
 *
 * A timestamp rather than a boolean, because when you decided to do a thing is
 * worth knowing and costs nothing to keep — and because `undefined` and `false`
 * are the same thing to read but not the same thing to write.
 */
export function setPursuing(id: string, on: boolean): Undone | null {
  const t = S().thoughts.find((x) => x.id === id)
  if (!t) return null
  const was = ex(t).pursuing_since
  const next = { ...ex(t) }
  if (on) next.pursuing_since = new Date().toISOString()
  else delete next.pursuing_since
  S().updateThought(id, { extra: next })
  return {
    note: on ? 'on your roadmap' : 'off your roadmap',
    undo: () => {
      const back = { ...ex(S().thoughts.find((x) => x.id === id) ?? t) }
      if (typeof was === 'string') back.pursuing_since = was
      else delete back.pursuing_since
      S().updateThought(id, { extra: back })
    },
  }
}

/**
 * Move a step to a day, or let it flow again.
 *
 * A pin is a preference, not an instruction the plan has to obey: `placeWork`
 * honours it only where it does not put the step in front of something it waits
 * on. Dragging a step ahead of its own blocker is not a scheduling choice, it is
 * a contradiction, and the plan wins.
 */
export function pinTo(id: string, day: string | null): Undone | null {
  const t = S().thoughts.find((x) => x.id === id)
  if (!t) return null
  const was = pinnedDay(t)
  const next = { ...ex(t) }
  if (day) next.day = day
  else delete next.day
  S().updateThought(id, { extra: next })
  return {
    note: day ? 'moved' : 'back where it belongs',
    undo: () => {
      const back = { ...ex(S().thoughts.find((x) => x.id === id) ?? t) }
      if (was) back.day = was
      else delete back.day
      S().updateThought(id, { extra: back })
    },
  }
}
