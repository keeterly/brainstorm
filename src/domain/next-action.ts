// The one thing to do next, and why.
//
// This is where the whole loop was supposed to end and did not. The app takes
// a mess and turns it into structure, then into researched plans, then into
// steps — and then hands you back a sky full of steps and lets you pick. The
// picking is the hard part. It is what you opened the app to avoid.
//
// Deliberately not the model's job. A recommendation you cannot argue with is
// worse than none, and the reasons that actually decide this — something is
// late, something is holding up three other things, something is small enough
// to do now — are all things the graph already knows. Asking a model would
// make it slower, cost money, work offline never, and produce a "why" you
// could not check. So: rules, in the order a person would apply them, and the
// rule that fired is the reason shown.
import { prioritizePrepass } from './prioritize-prepass'
import type { Relationship, Thought } from './types'

export interface NextAction {
  thought: Thought
  /** the rule that chose it, in the user's language */
  why: string
}

const days = (from: string, to: string) =>
  Math.round((Date.parse(to + 'T12:00:00') - Date.parse(from + 'T12:00:00')) / 86400000)

/**
 * What to do next out of everything open, or null if there is genuinely
 * nothing — which is a real answer and should be said, not filled.
 */
export function nextAction(thoughts: Thought[], relationships: Relationship[], today: string): NextAction | null {
  const { visible, blocked } = prioritizePrepass(thoughts, relationships, today)
  const ready = visible.filter((t) => !blocked.has(t.id))
  if (!ready.length) return null

  const byId = new Map(thoughts.map((t) => [t.id, t]))
  // how much is standing still until this one is done
  const unblocks = new Map<string, number>()
  const bump = (id: string) => unblocks.set(id, (unblocks.get(id) ?? 0) + 1)
  for (const r of relationships) {
    if (r.type === 'depends_on' && byId.get(r.from_id)?.status === 'open') bump(r.to_id)
    if (r.type === 'blocks' && byId.get(r.to_id)?.status === 'open') bump(r.from_id)
  }

  // 1. Late. Nothing outranks a thing that was already supposed to be done.
  const overdue = ready.filter((t) => t.due_date && t.due_date < today)
  if (overdue.length) {
    const t = overdue[0]
    const late = days(t.due_date as string, today)
    return { thought: t, why: late === 1 ? 'a day late' : `${late} days late` }
  }

  // 2. Today.
  const today_ = ready.filter((t) => t.due_date === today)
  if (today_.length) return { thought: today_[0], why: 'due today' }

  // 3. Holding up the most other work. Doing this frees the most, and it is
  //    the reason a person would never work out for themselves.
  const holding = ready
    .map((t) => ({ t, n: unblocks.get(t.id) ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
  if (holding.length) {
    const { t, n } = holding[0]
    return { thought: t, why: n === 1 ? 'one thing is waiting on it' : `${n} things are waiting on it` }
  }

  // 4. Due soon.
  const soon = ready.filter((t) => t.due_date)
  if (soon.length) {
    const t = soon[0]
    const away = days(today, t.due_date as string)
    return { thought: t, why: away === 1 ? 'due tomorrow' : `due in ${away} days` }
  }

  // 5. Nothing is late and nothing is blocked, so the question is only where to
  //    start. The smallest thing, because starting is the whole difficulty.
  const sized = ready.filter((t) => typeof t.effort === 'number')
  if (sized.length) {
    const t = sized.reduce((a, b) => ((b.effort as number) < (a.effort as number) ? b : a))
    if (sized.length > 1) return { thought: t, why: 'the smallest thing in reach' }
  }

  // 6. Otherwise the one that has been waiting longest, which is usually the
  //    one being avoided.
  // the prepass already hands these back oldest first
  const t = ready[0]
  const age = days(t.created_at.slice(0, 10), today)
  return {
    thought: t,
    why: age >= 2 ? `waiting ${age} days` : 'nothing is pressing — start here',
  }
}
