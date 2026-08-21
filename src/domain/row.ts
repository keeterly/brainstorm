// What one step of a plan says about itself, in words.
//
// The values were always in the graph — the reason in `summary`, the size in
// `effort`, the waiting in the `depends_on` edges `rain` writes between steps —
// and `plan.ts` already turns the edges into blockers. What was missing was the
// last inch: the three short strings a person actually reads, which lived
// inlined in the group page and nowhere else.
//
// That was fine while the group page was the only place a plan was drawn. It is
// not any more. Two surfaces formatting the same three values from the same two
// fields is exactly how an app ends up saying "after Shoot one roll" on one
// screen and "waiting" on another, and being unable to say which is right.
import { effortDots, waitingOn } from './plan'
import type { Relationship, Thought } from './types'

/**
 * What to call a thought.
 *
 * The title if it has earned one, else what you actually typed. Defined here
 * because three files had already written their own — `SkyPage.tsx:909`,
 * `groupFlow.ts:41`, `letGoFlow.ts:35` — and two of them clip to different
 * lengths, which is a disagreement waiting to be noticed on a screen.
 */
export const nameOf = (t: Thought): string => t.title || t.raw_content

export interface PlanRow {
  /** why this step is here — empty when there is nothing to add */
  why: string
  /** how big a piece of work it is, as dots — empty when nobody sized it */
  dots: string
  /** what it is waiting on, named — empty when it is free to start */
  waits: string
  /** …which is the same fact, for anything that would rather have a boolean */
  blocked: boolean
}

/**
 * The line that names what a step is waiting on.
 *
 * Named, not merely marked. "Waiting" tells you to skip it; the name tells you
 * what to go and do instead, which is the difference between a label and a plan.
 */
export function waitsLine(blockers: Thought[]): string {
  return blockers.length ? `after ${blockers.map(nameOf).join(' · ')}` : ''
}

/**
 * The reason a step is on the list.
 *
 * Dropped when it merely repeats the title: `rain` writes the reason into
 * `summary`, but a step you typed yourself has no reason at all, and a reason
 * that says the same thing twice is noise wearing a second line.
 */
export function whyLine(t: Thought): string {
  const why = (t.summary ?? '').trim()
  return why && why !== nameOf(t).trim() ? why : ''
}

/**
 * All three, for every member of a plan at once.
 *
 * Batched because the waiting cannot be worked out one row at a time — a
 * blocker being done is a fact about another row — and because both callers
 * want the whole set anyway.
 *
 * `planned` comes from `hasPlan`: a wall of references has no reasons and no
 * efforts, and drawing empty affordances on one would be the app implying a
 * plan it does not have.
 */
export function planRows(
  members: Thought[],
  rels: Relationship[],
  planned: boolean,
): Map<string, PlanRow> {
  const byId = new Map(members.map((m) => [m.id, m] as const))
  const blocking = waitingOn(byId, rels)
  const out = new Map<string, PlanRow>()
  for (const m of members) {
    const blockers = (blocking.get(m.id) ?? []).map((id) => byId.get(id)).filter((t): t is Thought => !!t)
    out.set(m.id, {
      why: planned ? whyLine(m) : '',
      dots: planned ? effortDots(m.effort) : '',
      waits: waitsLine(blockers),
      blocked: blockers.length > 0,
    })
  }
  return out
}
