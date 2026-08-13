// Deterministic prioritization pre-pass — runs before, and without, any AI.
//
// What survives of it: what is open, actionable and not snoozed away, and what
// of that is waiting on something else. `nextAction` reads both.
//
// It used to also sort everything into now/next/later/waiting buckets. Those
// were the Current's — the screen that laid them out in four columns — and when
// that screen went, nothing read them. A map computed every call and thrown
// away is cheap enough to ignore, which is exactly why it would have sat here
// for years still describing the app as a thing with four columns of work in
// it, ready for the next person to write words about "flowing". The one live
// thing it did — hiding what is blocked — was already `waitingOn` in plan.ts.
//
// The `bucket` column stays on the row and `Bucket` stays in the types: dropping
// a column is a migration, and this is not one.
import type { Relationship, Thought } from './types'
import { waitingOn } from './plan'

export interface PrepassResult {
  visible: Thought[]
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

  // Snoozed into the future stays out of sight entirely.
  const visible = openActionable.filter((t) => !(t.snooze_until && t.snooze_until > today))

  // Stable order: due date first, then age (oldest first).
  visible.sort((a, b) => {
    const ad = a.due_date ?? '9999-12-31'
    const bd = b.due_date ?? '9999-12-31'
    if (ad !== bd) return ad < bd ? -1 : 1
    return a.created_at < b.created_at ? -1 : 1
  })

  return { visible, blocked }
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
