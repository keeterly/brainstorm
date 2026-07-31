// Closing a goal, and what rises off it.
//
// The seventh stage of the cycle the whole app is shaped around —
// `Ocean Memory → Evaporation → New Thought` — has until now been a `div.vapor`
// that fades out after 2.7 seconds. The ocean only ever filled. Every new
// thought in this app has had to come from you, which is a fine thing for an
// app to require and a strange thing for it to *diagram* and then not do.
//
// Two small pieces, in order:
//
//   1. A goal can finish. Ticking the last action under a cloud used to leave
//      the goal open with nothing in it, which stops being a pool and is
//      redrawn as an orphan drop — a thing you completed, sitting in the sky
//      looking exactly like a thought nobody has touched.
//   2. Something may rise off it. At most one droplet, usually none, and only
//      ever offered.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import type { EvaporateOutput } from '@shared/ai/actions/evaporate'
import { markApplied } from '@/ai/pending'
import type { Thought } from '@/domain/types'

const name = (t: { title: string | null; raw_content: string }) => t.title || t.raw_content.slice(0, 200)

export interface Closed {
  /** what to say about it */
  note: string
  /** put it back exactly as it was */
  undo: () => void
}

/**
 * Say a goal is finished.
 *
 * Never automatic. "That whole thing is done" is a claim about your work, and
 * the agent does not get to make it — it can only notice that nothing is left
 * inside and ask.
 */
export function closeGoal(id: string): Closed | null {
  const s = useGraph.getState()
  const t = s.thoughts.find((x) => x.id === id)
  if (!t || t.status !== 'open') return null
  s.updateThought(id, { status: 'done', completed_at: new Date().toISOString() })
  return {
    note: `“${name(t)}” is finished`,
    undo: () => useGraph.getState().updateThought(id, { status: 'open', completed_at: null }),
  }
}

export type RiseResult =
  /** something did come up, and it is now in the sky */
  | { kind: 'rose'; thought: Thought; why: string; note: string }
  /** it read the whole thing and nothing follows — the commonest answer */
  | { kind: 'settled'; note: string }
  | { kind: 'failed' }

/**
 * What finishing that made possible.
 *
 * Runs after a goal closes and nowhere else. It is deliberately allowed —
 * expected — to come back with nothing: a thing that hands you a fresh task
 * every time you tick one off is a treadmill, not a cycle.
 */
export async function evaporateGoal(id: string): Promise<RiseResult> {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === id)
  if (!subject) return { kind: 'failed' }

  const byId = new Map(s.thoughts.map((t) => [t.id, t]))
  const inside = s.relationships
    .filter((r) => r.type === 'part_of' && r.to_id === id)
    .map((r) => byId.get(r.from_id))
    .filter((t): t is Thought => !!t)
    .map(name)
    .slice(0, 40)

  const lately = s.thoughts
    .filter((t) => t.status === 'done' && t.completed_at && t.id !== id)
    .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)))
    .slice(0, 15)
    .map(name)

  // Everything still open, so it cannot hand back something already on the map
  // in different words — which is the failure mode that would make this feel
  // like the app not paying attention.
  const open = s.thoughts.filter((t) => t.status === 'open').map(name).slice(0, 60)

  try {
    const { output, runId } = await runAction<EvaporateOutput>('evaporate', {
      finished: name(subject),
      inside,
      lately,
      open,
    })
    return applyEvaporate(id, output, runId)
  } catch {
    return { kind: 'failed' }
  }
}

/** Put what rose into the sky, as a thought like any other. */
export function applyEvaporate(
  fromId: string,
  output: EvaporateOutput,
  runId: string | null,
): RiseResult {
  if (runId) void markApplied(runId)
  const note = output.note.trim()
  if (!output.rises) return { kind: 'settled', note }
  const s = useGraph.getState()
  const r = output.rises
  const t = s.addThought({
    raw_content: r.title,
    title: r.title,
    summary: r.why || null,
    type: r.kind,
    // where it came from, so a droplet that turns up in the morning can say
    // which finished thing put it there
    extra: { rose_from: fromId, rose_at: new Date().toISOString() },
  })
  return { kind: 'rose', thought: t, why: r.why, note }
}
