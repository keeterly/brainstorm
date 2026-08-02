// Find — every thought you have ever written, findable by the words in it.
//
// The sky is a place, and places are searched by walking. Three playtesters
// walked: one hunted a drifting bubble across an infinite pan "by luck", one
// asked outright for "a list view of all thoughts and search", one filed a
// week of work into the wrong group and could not find it again afterwards.
// The graph has held every word the whole time; nothing let you ask for one.
//
// This asks the water. Everything is searchable whatever state it is in, and
// each result carries the one act that state calls for: an open thing flies
// you to it in the sky, a resting thing can be woken, a put-away or finished
// thing can be brought back. No detail screen, no second model of a thought —
// the result is a doorway, and every door opens onto the world that already
// exists.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { TypeBadge } from '@/components/TypeBadge'
import { humanDate } from '@/domain/human-date'
import { todayISO } from '@/domain/prioritize-prepass'
import type { Thought, ThoughtStatus } from '@/domain/types'

// open things first — the ones you can still act on are almost always the
// ones being hunted — then resting, then put away, then finished
const ORDER: Record<ThoughtStatus, number> = { open: 0, snoozed: 1, archived: 2, done: 3 }

/** Substring over title, body and summary; two letters before it answers. */
export function findThoughts(all: Thought[], q: string): Thought[] {
  const needle = q.trim().toLowerCase()
  if (needle.length < 2) return []
  const hay = (t: Thought) =>
    `${t.title ?? ''}\n${t.raw_content}\n${t.summary ?? ''}`.toLowerCase()
  return all
    .filter((t) => hay(t).includes(needle))
    .sort(
      (a, b) =>
        ORDER[a.status] - ORDER[b.status] ||
        // 0 on the tie, or the sort loses its stability and equal-aged
        // results shuffle between keystrokes
        (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0),
    )
}

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

  // waking clears both marks of rest: the sky's snooze sets a status, the
  // Current's sets only a date, and a wake that misses one leaves the thing
  // still asleep somewhere
  const wake = (t: Thought) => updateThought(t.id, { status: 'open', snooze_until: null })
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
