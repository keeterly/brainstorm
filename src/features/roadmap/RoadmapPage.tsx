import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { humanDate } from '@/domain/human-date'
import { addDays, todayISO } from '@/domain/prioritize-prepass'
import { nameOf, planRows } from '@/domain/row'
import { dayOfWeek, effortOf, placeWork, weeklyCapacity, type Placed } from '@/domain/schedule'
import { goalOf, pursued } from './gather'
import './roadmap.css'

/*
 * The other half of the app.
 *
 * The sky is where thinking lives and the group page is where one thing's plan
 * lives. Neither of them can answer the question you actually arrive with on a
 * Tuesday morning — what am I doing today — because the answer is spread across
 * every group you have, and a correct list of forty steps is not an answer to
 * it either.
 *
 * So this is the same graph, read against a week: the order `plan.ts` already
 * works out, laid on days against a week whose size was measured rather than
 * declared. It writes nothing. Every number on it comes from somewhere you can
 * go and look at.
 */
export default function RoadmapPage() {
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const today = todayISO()

  const view = useMemo(() => {
    const groups = pursued(thoughts, relationships)
    const steps = groups.flatMap((g) => g.steps)
    const capacity = weeklyCapacity(thoughts, today)
    const placement = placeWork({ steps, rels: relationships, capacity, today })
    const byId = new Map(thoughts.map((t) => [t.id, t] as const))
    const rows = planRows(steps, relationships, true)
    return { groups, placement, byId, rows }
  }, [thoughts, relationships, today])

  const { placement, byId, rows, groups } = view
  const { capacity } = placement
  const weekEnd = weekEndFrom(today)
  const thisWeek = placement.days.filter((d) => d.date <= weekEnd)
  const after = placement.days.filter((d) => d.date > weekEnd)

  if (!groups.length) {
    return (
      <div className="page roadmap">
        <h1 className="page-title">What you are doing</h1>
        <section className="card">
          <p className="muted">
            Nothing here yet. A group gets a roadmap once it has steps — open one in the
            sky and ask it to make them, and what it writes lands here with the rest of
            your week.
          </p>
          <Link className="btn btn--ghost" to="/" style={{ textDecoration: 'none', marginTop: 12 }}>
            Go to your ideas
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="page roadmap">
      <h1 className="page-title">What you are doing</h1>

      {/* The week's size, said out loud and sourced. A number the app made up
          about how much you can do is worth nothing unless you can see where
          it came from and how sure of it the app is. */}
      <p className="muted rm-cap">
        {capacity.learned
          ? `about ${capacity.effort} a week — read off the last ${capacity.weeksSeen} weeks of what you finished`
          : `about ${capacity.effort} a week to start with, until it has watched you finish a couple`}
      </p>

      <Week title="This week" days={thisWeek} today={today} rows={rows} byId={byId} rels={relationships} empty="Nothing this week." />
      {after.length > 0 && (
        <Week title="After that" days={after} today={today} rows={rows} byId={byId} rels={relationships} />
      )}

      {placement.later.length > 0 && (
        <section className="card rm-later">
          <h2 className="rm-h">Not yet</h2>
          <p className="muted rm-sub">
            Real work, and there is no week in reach with room for it. It moves up as the
            things above it come off.
          </p>
          {placement.later.map((p) => (
            <Step key={p.t.id} p={p} rows={rows} byId={byId} rels={relationships} today={today} />
          ))}
        </section>
      )}
    </div>
  )
}

function Week({
  title,
  days,
  today,
  rows,
  byId,
  rels,
  empty,
}: {
  title: string
  days: { date: string; items: Placed[] }[]
  today: string
  rows: ReturnType<typeof planRows>
  byId: Map<string, import('@/domain/types').Thought>
  rels: import('@/domain/types').Relationship[]
  empty?: string
}) {
  return (
    <section className="card rm-week">
      <h2 className="rm-h">{title}</h2>
      {!days.length && empty && <p className="muted rm-sub">{empty}</p>}
      {days.map((d) => (
        <div className="rm-day" key={d.date}>
          <div className="rm-date">
            {humanDate(d.date, today)}
            <span className="rm-load">{d.items.reduce((n, i) => n + effortOf(i.t), 0)}</span>
          </div>
          {d.items.map((p) => (
            <Step key={p.t.id} p={p} rows={rows} byId={byId} rels={rels} today={today} />
          ))}
        </div>
      ))}
    </section>
  )
}

/*
 * One step, reading exactly as it reads on the group page.
 *
 * Same three lines from the same two fields, through `planRows` — which is why
 * that helper exists. Two surfaces formatting the same values independently is
 * how an app ends up saying "after Shoot one roll" in one place and "waiting"
 * in another and being unable to say which is right.
 */
function Step({
  p,
  rows,
  byId,
  rels,
  today,
}: {
  p: Placed
  rows: ReturnType<typeof planRows>
  byId: Map<string, import('@/domain/types').Thought>
  rels: import('@/domain/types').Relationship[]
  today: string
}) {
  const r = rows.get(p.t.id)
  const goal = goalOf(p.t.id, rels, byId)
  return (
    // …and it is a way back to the thing itself. A plan you cannot open is a
    // list of sentences about work rather than the work.
    <Link className={`rm-step${p.blockers.length ? ' waiting' : ''}`} to={`/?open=${p.t.id}`}>
      <div className="rm-line">
        <span className="rm-title">{nameOf(p.t)}</span>
        {r?.dots && (
          <span className="rm-effort" aria-label={`${r.dots.length} of 5 for size`}>
            {r.dots}
          </span>
        )}
      </div>
      {goal && <div className="rm-goal">{nameOf(goal)}</div>}
      {r?.why && <div className="rm-why">{r.why}</div>}
      {r?.waits && <div className="rm-waits">{r.waits}</div>}
      {p.late && p.t.due_date && <div className="rm-late">was due {humanDate(p.t.due_date, today)}</div>}
      {!p.late && p.t.due_date && <div className="rm-due">due {humanDate(p.t.due_date, today)}</div>}
    </Link>
  )
}

/** The Sunday that ends the week a day is in. */
function weekEndFrom(iso: string): string {
  return addDays(iso, (7 - dayOfWeek(iso)) % 7)
}
