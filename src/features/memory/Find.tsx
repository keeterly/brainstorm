// Find — every thought you have ever written, findable by the words in it.
//
// Everything is searchable whatever state it is in, and each result carries the
// one act that state calls for: an open thing flies you to it in the sky, a
// resting thing can be woken, a put-away or finished thing can be brought back.
// No detail screen, no second model of a thought — the result is a doorway, and
// every door opens onto the world that already exists.
//
// The matching itself is `findThoughts` in domain/find.ts, because the sky asks
// the same question of the same graph and two copies of that rule is two
// screens eventually giving different answers to it.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { TypeBadge } from '@/components/TypeBadge'
import { findThoughts } from '@/domain/find'
import { humanDate } from '@/domain/human-date'
import { todayISO } from '@/domain/prioritize-prepass'
import type { Thought } from '@/domain/types'

export { findThoughts }

const SHOW = 12

export function Find() {
  const thoughts = useGraph((s) => s.thoughts)
  const updateThought = useGraph((s) => s.updateThought)
  const [q, setQ] = useState('')
  const hits = useMemo(() => findThoughts(thoughts, q), [thoughts, q])
  const today = todayISO()

  const caption = (t: Thought): string => {
    if (t.status === 'done')
      return t.completed_at ? `finished ${humanDate(t.completed_at.slice(0, 10), today)}` : 'finished'
    if (t.status === 'snoozed')
      return t.snooze_until ? `resting — back ${humanDate(t.snooze_until, today)}` : 'resting'
    if (t.status === 'archived') return 'put away'
    return t.due_date ? `due ${humanDate(t.due_date, today)}` : ''
  }

  // Waking clears both marks of rest: the sky's snooze sets a status, the
  // Current's sets only a date, and a wake that misses one leaves the thing
  // still asleep somewhere. And it wakes the household — a group goes to
  // rest with everything under it, and waking the shell alone would bring
  // back an empty group until tomorrow.
  const wake = (t: Thought) => {
    updateThought(t.id, { status: 'open', snooze_until: null })
    const rels = useGraph.getState().relationships
    const all = useGraph.getState().thoughts
    const walk = (id: string) => {
      for (const r of rels) {
        if (r.type !== 'part_of' || r.to_id !== id) continue
        const kid = all.find((x) => x.id === r.from_id)
        if (kid && kid.status === 'snoozed') {
          updateThought(kid.id, { status: 'open', snooze_until: null })
          walk(kid.id)
        }
      }
    }
    walk(t.id)
  }
  const back = (t: Thought) =>
    updateThought(t.id, { status: 'open', ...(t.status === 'done' ? { completed_at: null } : {}) })

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <input
        type="search"
        aria-label="Find a thought"
        placeholder="Find anything you’ve written…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="field"
        autoComplete="off"
      />
      {q.trim().length >= 2 && hits.length === 0 && (
        <p className="faint" style={{ fontSize: 'var(--fs-label)', marginTop: 10 }} role="status">
          nothing holds those words
        </p>
      )}
      {hits.length > 0 && (
        <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
          {hits.slice(0, SHOW).map((t) => {
            const words = t.title || t.raw_content.slice(0, 80)
            const note = caption(t)
            const body = (
              <>
                <span
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {words}
                  {note && (
                    <span className="faint" style={{ fontSize: 'var(--fs-caption)', marginLeft: 8 }}>
                      {note}
                    </span>
                  )}
                </span>
                <TypeBadge type={t.type} />
              </>
            )
            return t.status === 'open' ? (
              // the thing itself, in the sky, where everything opens
              <Link
                key={t.id}
                to={`/?open=${encodeURIComponent(t.id)}`}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  minWidth: 0,
                  fontSize: 'var(--fs-label)',
                  color: 'var(--ink)',
                  textDecoration: 'none',
                }}
              >
                {body}
              </Link>
            ) : (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  minWidth: 0,
                  fontSize: 'var(--fs-label)',
                  color: 'var(--ink-soft)',
                }}
              >
                {body}
                <button
                  className="faint hit"
                  style={{ flexShrink: 0, color: 'var(--accent)' }}
                  onClick={() => (t.status === 'snoozed' ? wake(t) : back(t))}
                >
                  {t.status === 'snoozed' ? 'wake it' : 'bring it back'}
                </button>
              </div>
            )
          })}
          {hits.length > SHOW && (
            <p className="faint" style={{ fontSize: 'var(--fs-caption)' }}>
              and {hits.length - SHOW} more — say more of the words
            </p>
          )}
        </div>
      )}
    </section>
  )
}
