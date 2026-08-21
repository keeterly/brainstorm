import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { humanDate } from '@/domain/human-date'
import { addDays, todayISO } from '@/domain/prioritize-prepass'
import { nameOf, planRows } from '@/domain/row'
import { dayOfWeek, effortOf, placeWork, weeklyCapacity, type Placed } from '@/domain/schedule'
import { goalOf, pursued } from './gather'
import { pins, pinTo } from './pursue'
import { doThemAll, offerLine, shortlist, type BatchEvent } from './doAllFlow'
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
 * declared. Every number on it comes from somewhere you can go and look at.
 *
 * It is not a second model of the work — that is the thing that went wrong the
 * last time this app had a roadmap, and why `generate_roadmap` was deleted. The
 * three things it does write are marks on the thoughts themselves: that you are
 * pursuing a group, that you moved a step to a day, and whatever the agent
 * drafted. Every one of them shows up in the sky and on the group page too,
 * because there is only ever one copy of anything here.
 */
export default function RoadmapPage() {
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const today = todayISO()
  // which step has its day-picker open — one at a time, held here rather than
  // in each row, so opening a second closes the first
  const [moving, setMoving] = useState<string | null>(null)
  // what the agent is doing, if anything. One line, because a batch that
  // reports five things at once is a batch you cannot read while it runs.
  const [batch, setBatch] = useState<{ busy: boolean; line: string }>({ busy: false, line: '' })

  const view = useMemo(() => {
    const groups = pursued(thoughts, relationships)
    const steps = groups.flatMap((g) => g.steps)
    const capacity = weeklyCapacity(thoughts, today)
    // …and the days you moved things to. A pin is a preference, not an
    // instruction: `placeWork` honours it only where it does not put a step in
    // front of something it waits on.
    const placement = placeWork({ steps, rels: relationships, capacity, today, pinned: pins(thoughts) })
    const byId = new Map(thoughts.map((t) => [t.id, t] as const))
    const rows = planRows(steps, relationships, true)
    return { groups, placement, byId, rows }
  }, [thoughts, relationships, today])

  const { placement, byId, rows, groups } = view
  // Whether this is what you chose or everything you could choose. Until you
  // have marked anything, `pursued` shows every group with a plan in it —
  // narrowing to nothing would look like work disappearing rather than like a
  // question being asked.
  const chosen = groups.some((g) => g.chosen)
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

      {!chosen && (
        <p className="muted rm-all">
          Everything you have planned. Open one in the sky and say you are working on
          it, and this narrows to the ones you chose.
        </p>
      )}

      {/* The week's size, said out loud and sourced. A number the app made up
          about how much you can do is worth nothing unless you can see where
          it came from and how sure of it the app is. */}
      <p className="muted rm-cap">
        {capacity.learned
          ? `about ${capacity.effort} a week — read off the last ${capacity.weeksSeen} weeks of what you finished`
          : `about ${capacity.effort} a week to start with, until it has watched you finish a couple`}
      </p>

      {/* …over everything with a day on it, not only this week.
          The agent writing a draft does not spend your time, it spends the
          budget — and a first version waiting for you when you get to Thursday
          is the whole point of it going first. Scoped to placed work rather than
          to everything, so it does not go off and write the tail of a plan you
          have not decided to start. */}
      <Doing
        steps={placement.days.flatMap((d) => d.items.map((i) => i.t))}
        batch={batch}
        setBatch={setBatch}
      />

      <Week
        title="This week"
        days={thisWeek}
        today={today}
        rows={rows}
        byId={byId}
        rels={relationships}
        empty="Nothing this week."
        moving={moving}
        setMoving={setMoving}
      />
      {after.length > 0 && (
        <Week
          title="After that"
          days={after}
          today={today}
          rows={rows}
          byId={byId}
          rels={relationships}
          moving={moving}
          setMoving={setMoving}
        />
      )}

      {placement.later.length > 0 && (
        <section className="card rm-later">
          <h2 className="rm-h">Not yet</h2>
          <p className="muted rm-sub">
            Real work, and there is no week in reach with room for it. It moves up as the
            things above it come off.
          </p>
          {placement.later.map((p) => (
            <Step
              key={p.t.id}
              p={p}
              rows={rows}
              byId={byId}
              rels={relationships}
              today={today}
              moving={moving}
              setMoving={setMoving}
            />
          ))}
        </section>
      )}
    </div>
  )
}

/*
 * The agent offering to do a piece of the week.
 *
 * The whole of the third principle in one card: everything else in this app
 * arranges your thinking, and this is the moment it hands back something that
 * did not exist before.
 *
 * Two halves, and the second is the one that earns the first. It says what it
 * can write — and it says what it is leaving to you, because an app that offers
 * to shoot a roll of film for you is an app you stop believing. The split is
 * `canDraft`, the model's own judgement, made when it wrote the step.
 */
function Doing({
  steps,
  batch,
  setBatch,
}: {
  steps: import('@/domain/types').Thought[]
  batch: { busy: boolean; line: string }
  setBatch: (b: { busy: boolean; line: string }) => void
}) {
  const list = useMemo(() => shortlist(steps), [steps])
  const offer = offerLine(list, steps.length)
  if (!offer && !batch.line) return null

  const say = (e: BatchEvent) => {
    if (e.kind === 'starting') setBatch({ busy: true, line: `writing ${e.at} of ${e.of} — ${nameOf(e.t)}` })
    else if (e.kind === 'failed') setBatch({ busy: true, line: `could not write “${nameOf(e.t)}”${e.why ? ` — ${e.why}` : ''}` })
    // …and a refusal names itself. A batch that half-happens in silence is
    // worse than one that never started: you would come back to four of six
    // done with no idea why the other two are missing.
    else if (e.kind === 'stopped')
      setBatch({ busy: false, line: `stopped after ${e.done} — ${e.why}. ${e.left} left to do.` })
    else if (e.kind === 'finished')
      setBatch({
        busy: false,
        line: e.done
          ? `wrote ${e.done}${e.failed ? `, and could not write ${e.failed}` : ''} — open a step to read it`
          : 'nothing came back',
      })
  }

  return (
    <section className="card rm-doing">
      {batch.line ? (
        <p className={`rm-doing-line${batch.busy ? ' busy' : ''}`} role="status">
          {batch.line}
        </p>
      ) : (
        <>
          <p className="rm-doing-line">{offer}</p>
          {list.yours.length > 0 && (
            <p className="muted rm-sub">
              The other {list.yours.length} need you — shoots, calls, the things that have to be
              gone and done.
            </p>
          )}
          <button
            className="btn btn--ghost rm-go"
            onClick={() => {
              setBatch({ busy: true, line: 'starting' })
              // it survives the page: every draft is a background run, and the
              // sky picks up whatever has not landed the next time you open it
              void doThemAll(steps, say)
            }}
          >
            {list.mine.length === 1 ? 'Write it' : `Write all ${list.mine.length}`}
          </button>
          <p className="muted rm-fine">
            You can put the phone down — they finish without you, and each one is yours to
            read before it counts as done.
          </p>
        </>
      )}
    </section>
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
  moving,
  setMoving,
}: {
  title: string
  days: { date: string; items: Placed[] }[]
  today: string
  rows: ReturnType<typeof planRows>
  byId: Map<string, import('@/domain/types').Thought>
  rels: import('@/domain/types').Relationship[]
  empty?: string
  moving: string | null
  setMoving: (id: string | null) => void
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
            <Step
              key={p.t.id}
              p={p}
              rows={rows}
              byId={byId}
              rels={rels}
              today={today}
              moving={moving}
              setMoving={setMoving}
            />
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
  moving,
  setMoving,
}: {
  p: Placed
  rows: ReturnType<typeof planRows>
  byId: Map<string, import('@/domain/types').Thought>
  rels: import('@/domain/types').Relationship[]
  today: string
  moving: string | null
  setMoving: (id: string | null) => void
}) {
  const r = rows.get(p.t.id)
  const goal = goalOf(p.t.id, rels, byId)
  const open = moving === p.t.id
  return (
    <div className={`rm-step${p.blockers.length ? ' waiting' : ''}${p.pinned ? ' pinned' : ''}`}>
      {/* …and it is a way back to the thing itself. A plan you cannot open is a
          list of sentences about work rather than the work. */}
      <Link className="rm-body" to={`/?open=${p.t.id}`}>
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
      {/* Moving it.
          Not a drag. The step is already a way into the thing, a drag between
          day headings on a phone is a fiddle, and a drag library is a
          dependency — where a row of dates you can hit with a thumb is none of
          those things and says what the options are. */}
      <button
        className="rm-move"
        aria-label={open ? 'Keep the day it has' : 'Move this to another day'}
        aria-expanded={open}
        onClick={() => setMoving(open ? null : p.t.id)}
      >
        {p.pinned ? '◆' : '◇'}
      </button>
      {open && <Days id={p.t.id} today={today} on={p.day} pinned={p.pinned} done={() => setMoving(null)} />}
    </div>
  )
}

/**
 * The days you could move it to.
 *
 * Ten working days, which is a fortnight of real ones — far enough to push
 * something properly out of the way, near enough that the row is still a row
 * rather than a calendar. Weekends are left out for the same reason `placeWork`
 * does not fill them.
 */
function Days({
  id,
  today,
  on,
  pinned,
  done,
}: {
  id: string
  today: string
  on: string | null
  pinned: boolean
  done: () => void
}) {
  const days: string[] = []
  for (let d = today, i = 0; days.length < 10 && i < 30; d = addDays(d, 1), i++) {
    if (![0, 6].includes(dayOfWeek(d))) days.push(d)
  }
  return (
    <div className="rm-days" role="group" aria-label="Move this to">
      {days.map((d) => (
        <button
          key={d}
          className={`rm-chip${d === on ? ' on' : ''}`}
          onClick={() => {
            pinTo(id, d)
            done()
          }}
        >
          {humanDate(d, today)}
        </button>
      ))}
      {/* …and out again. A pin you cannot remove is a plan you have to keep
          correcting by hand for ever. */}
      {pinned && (
        <button
          className="rm-chip loose"
          onClick={() => {
            pinTo(id, null)
            done()
          }}
        >
          let it flow
        </button>
      )}
    </div>
  )
}

/** The Sunday that ends the week a day is in. */
function weekEndFrom(iso: string): string {
  return addDays(iso, (7 - dayOfWeek(iso)) % 7)
}
