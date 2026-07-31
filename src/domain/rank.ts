// Where a thing sits among the things beside it.
//
// The graph has never had an order. A group's contents came back in whatever
// order the relationships happened to be in — which is creation order, near
// enough, until something is taken out and put back. That is fine for a ring
// in the sky, where there is no first and no last, and useless the moment you
// open the list and want the thing you are doing next at the top of it.
//
// So members carry a rank. It lives in `extra`, which is a free-form blob on
// every thought, so this needs no migration and no new table — and because a
// thing is `part_of` exactly one group at a time, a rank on the thing is the
// same as a rank on the membership.
//
// Ranks are spaced rather than consecutive. Dropping something between two
// neighbours takes the number halfway between them and writes one row, instead
// of renumbering everything below it; a list of forty things costs one write to
// rearrange, not forty. Halving runs out of floating-point room eventually —
// about fifty times into the same gap — and `between` says so by returning
// null rather than silently returning a rank equal to its neighbour, which is
// the bug this shape is prone to.
import type { Thought } from './types'

/** The gap left between neighbours, so there is room to drop between them. */
export const RANK_STEP = 1024

export function rankOf(t: Thought): number | null {
  const r = (t.extra as Record<string, unknown> | null)?.rank
  return typeof r === 'number' && Number.isFinite(r) ? r : null
}

/**
 * Ranked things in their order; anything unplaced keeps the order it came in.
 *
 * Unranked is the normal state — nothing carries a rank until the first time
 * you rearrange the group it is in — so the untouched case has to come out
 * exactly as it went in. It is tempting to fall back to `created_at`, and it is
 * wrong: a group's contents are very often written within the same
 * millisecond, so that tiebreaks on the id, which is random, which means an
 * order nobody chose and that reads as shuffled.
 *
 * The sort is stable, so unranked things hold their relative places. Anything
 * without a rank sorts to the end, which is where something added to a list you
 * have already arranged belongs.
 */
export function ordered<T extends Thought>(ts: readonly T[]): T[] {
  if (!ts.some((t) => rankOf(t) !== null)) return [...ts]
  return [...ts].sort((a, b) => (rankOf(a) ?? Infinity) - (rankOf(b) ?? Infinity))
}

/**
 * A rank between two neighbours, or null when there is no room left between
 * them and the list has to be spread out again.
 */
export function between(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return 0
  if (before === null) return (after as number) - RANK_STEP
  if (after === null) return before + RANK_STEP
  if (!(before < after)) return null
  const mid = before + (after - before) / 2
  // the only honest test that there is still room: a midpoint that is equal to
  // either end is not between them
  return mid > before && mid < after ? mid : null
}

/** Evenly spaced ranks for a whole list, for when the gaps have run out. */
export function spread(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i * RANK_STEP)
}
