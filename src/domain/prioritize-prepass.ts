// Deterministic prioritization pre-pass — runs before (and without) AI.
// Rules: unmet depends_on/blocks ⇒ waiting; snoozed-in-future hidden;
// overdue or due today ⇒ now; due this week ⇒ next; manual buckets respected.
import type { Relationship, Thought, Bucket } from './types'
import { waitingOn } from './plan'

export interface PrepassResult {
  visible: Thought[]
  buckets: Map<string, Bucket>
  blocked: Set<string>
}

export function prioritizePrepass(
  thoughts: Thought[],
  relationships: Relationship[],
  today: string, // YYYY-MM-DD
): PrepassResult {
  const byId = new Map(thoughts.map((t) => [t.id, t]))
  const openActionable = thoughts.filter(
    (t) => t.status === 'open' && (t.type === 'action' || t.type === 'task'),
  )

  // An action is blocked when it depends on (or is blocked by) an open thought.
  //
  // The rule itself lives in `plan.ts`, because a plan marks what is blocked and
  // this hides it, and two copies of one rule is two screens eventually saying
  // different things about the same step.
  const blocked = new Set(waitingOn(byId, relationships).keys())

  const buckets = new Map<string, Bucket>()
  const visible: Thought[] = []

  for (const t of openActionable) {
    // Snoozed into the future stays out of sight entirely.
    if (t.snooze_until && t.snooze_until > today) continue
    visible.push(t)

    if (blocked.has(t.id)) {
      buckets.set(t.id, 'waiting')
      continue
    }
    if (t.bucket) {
      // Manual assignment wins (except blocked, handled above).
      buckets.set(t.id, t.bucket === 'waiting' ? 'waiting' : t.bucket)
      continue
    }
    if (t.due_date && t.due_date <= today) {
      buckets.set(t.id, 'now')
    } else {
      // Everything else that is open and unblocked is flowing.
      //
      // This used to be `later` for anything without a due date, and almost no
      // real work has a due date — so the current was empty on a map with two
      // dozen live actions on it, and every one of them was counted off to a
      // fourth place called "the world". You could rain a cloud, watch four
      // things fall out of it, open the Current and be told nothing was
      // flowing. That is the opposite of what the word means.
      //
      // `later` is now what it says: something you deferred. A snooze, or a
      // bucket you set by hand. Both are handled above this line, so nothing
      // reaches here except work that is genuinely in the flow.
      buckets.set(t.id, 'next')
    }
  }

  // Stable order: due date first, then age (oldest first).
  visible.sort((a, b) => {
    const ad = a.due_date ?? '9999-12-31'
    const bd = b.due_date ?? '9999-12-31'
    if (ad !== bd) return ad < bd ? -1 : 1
    return a.created_at < b.created_at ? -1 : 1
  })

  return { visible, buckets, blocked }
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12)
  dt.setDate(dt.getDate() + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
