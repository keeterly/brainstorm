// Finding a thought by the words in it.
//
// The sky is a place, and places are searched by walking. Three playtesters
// walked: one hunted a drifting bubble across an infinite pan "by luck", one
// asked outright for "a list view of all thoughts and search", one filed a week
// of work into the wrong group and could not find it again afterwards. The
// graph has held every word the whole time; nothing let you ask for one.
//
// It lives here rather than beside either screen that uses it, for the reason
// `waitingOn` lives in plan.ts: the sky and the memory page both answer "does
// this match", and two copies of that rule is two screens eventually giving
// different answers to the same question.
import type { Thought, ThoughtStatus } from './types'

// open things first — the ones you can still act on are almost always the ones
// being hunted — then resting, then put away, then finished
const ORDER: Record<ThoughtStatus, number> = { open: 0, snoozed: 1, archived: 2, done: 3 }

/** Substring over title, body and summary; two letters before it answers. */
export function findThoughts(all: Thought[], q: string): Thought[] {
  const needle = q.trim().toLowerCase()
  if (needle.length < 2) return []
  const hay = (t: Thought) => `${t.title ?? ''}\n${t.raw_content}\n${t.summary ?? ''}`.toLowerCase()
  return all
    .filter((t) => hay(t).includes(needle))
    .sort(
      (a, b) =>
        ORDER[a.status] - ORDER[b.status] ||
        // 0 on the tie, or the sort loses its stability and equal-aged results
        // shuffle between keystrokes
        (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0),
    )
}
