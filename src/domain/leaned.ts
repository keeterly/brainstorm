// Which of the things it knows about you are actually doing any work.
//
// The Memory page says "it picks from this for whatever you are working on".
// That is true — `recall` ranks the live memories on every run and the twelve
// it carries get reinforced — and until now there was no way for the person
// reading that sentence to check it. A list of things an app claims to know
// about you, with no evidence any of it is ever used, is a list you stop
// believing and then stop maintaining.
//
// `last_used_at` has been written all along. This is the little bit of
// arithmetic that turns it into something you can read.
import { humanDate } from './human-date'
import type { Memory } from './types'

const DAY = 86_400_000

/** Live, in the sense that matters here: not archived by the reconciler. */
const live = (m: Memory) => !m.archived_at

/**
 * How many of them have been leaned on lately.
 *
 * The honest headline for this page. A hundred remembered facts of which four
 * get used is not a memory, it is a drawer — and knowing that is what makes
 * you go and prune it.
 */
export function workingSet(memories: Memory[], nowMs: number, days = 7): number {
  const cutoff = nowMs - days * DAY
  return memories.filter((m) => live(m) && m.last_used_at && Date.parse(m.last_used_at) >= cutoff).length
}

/**
 * What it has never once needed.
 *
 * Only after it has had a fair chance: something written this morning has not
 * been used yet because nothing has happened yet, and putting it on a list of
 * dead weight the same day would be the app telling you off for using it.
 */
export function neverNeeded(memories: Memory[], nowMs: number, graceDays = 7): Memory[] {
  const cutoff = nowMs - graceDays * DAY
  return memories.filter((m) => live(m) && !m.last_used_at && Date.parse(m.created_at) < cutoff)
}

/**
 * When it was last actually carried into a prompt, in words.
 *
 * Deliberately not a count. The number of times a fact has ridden along tells
 * you very little — the dots beside it already say load-bearing or not — but
 * *when* it was last needed is the whole difference between something true
 * about how you work and something that was true in March.
 */
export function leanedWords(m: Memory, todayIso: string): string {
  if (!m.last_used_at) return 'never needed yet'
  return `last used ${humanDate(m.last_used_at.slice(0, 10), todayIso)}`
}
