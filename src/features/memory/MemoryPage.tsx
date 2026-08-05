// Memory — what the water keeps: what the app has picked up about how you
// work, what it has changed its mind about, and the ocean of finished work.
//
// The heading here read "Known about you", which is a passive with nobody in
// it — the grammar of a file somebody keeps on you rather than of a thing that
// has been working alongside you and formed some impressions. Nothing was
// doing the knowing and nothing was admitting it might be wrong. It read as
// surveillance because that is the sentence surveillance uses.
//
// "What it has picked up" says who, says it is partial, and says it came out
// of use rather than observation — and it sits with the two sections under it,
// which have always been "what it changed its mind about" and "what it has
// never needed". Three admissions in a row, which is the honest shape for a
// screen whose only job is letting you check what a machine believes.
//
// The two halves stopped pronouncing on the person, too. "Always true of you"
// is a claim the app is in no position to make; when a thing gets used is a
// claim it can stand behind, and it is the more useful of the two anyway.
//
// It used to also hold the app's controls: a notification card above the
// memories, then autonomy, export, import, the account and Sign out below. All
// of those are things you go looking for on purpose, once — and every one of
// them was in the way of the thing you actually come here to read. They live
// behind the ⚙ now; see features/settings.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { TypeBadge } from '@/components/TypeBadge'
import { humanDate } from '@/domain/human-date'
import { todayISO } from '@/domain/prioritize-prepass'
import { learn, type Learned } from '@/ai/memoryFlow'
import { leanedWords, neverNeeded, workingSet } from '@/domain/leaned'
import { ridesAlong } from '@/domain/recall'
import { Find } from './Find'
import type { Memory, MemoryEvent } from '@/domain/types'


export default function MemoryPage() {
  const memories = useGraph((s) => s.memories)
  const thoughts = useGraph((s) => s.thoughts)
  const offline = useGraph((s) => s.offline)
  const addMemory = useGraph((s) => s.addMemory)
  const updateMemory = useGraph((s) => s.updateMemory)
  const deleteMemory = useGraph((s) => s.deleteMemory)
  const toggleDone = useGraph((s) => s.toggleDone)

  const memoryEvents = useGraph((s) => s.memoryEvents)
  const [filter, setFilter] = useState('')
  const [newMem, setNewMem] = useState('')
  const [distillText, setDistillText] = useState('')
  const [learning, setLearning] = useState(false)
  const [learnt, setLearnt] = useState<Learned | null>(null)

  // Believed and set aside. The second list is short and usually empty, and it
  // is the whole reason the agent is allowed to change its mind at all: a thing
  // that can quietly stop believing something, with no way to see that it did,
  // is not something you would let near what it knows about you.
  const live = memories.filter((m) => !m.archived_at)
  const shelved = memories.filter((m) => m.archived_at)

  // What is actually doing any work. The line above this list has always
  // claimed the app picks from it for whatever you are working on; that claim
  // was unverifiable from the only screen it appears on, and an unverifiable
  // claim about what a thing knows about you is worth less than no claim.
  const nowMs = Date.now()
  const working = workingSet(live, nowMs)
  const unread = neverNeeded(live, nowMs)

  // …and, once there is enough of it, a way through it
  const q = filter.trim().toLowerCase()
  const shown = q ? live.filter((m) => m.content.toLowerCase().includes(q)) : live
  const always = shown.filter((m) => ridesAlong(m.kind))
  const situational = shown.filter((m) => !ridesAlong(m.kind))

  const finished = thoughts
    .filter((t) => t.status === 'done')
    .sort((a, b) => ((a.completed_at ?? '') < (b.completed_at ?? '') ? 1 : -1))
  const oceanCount = finished.length
  const ocean = finished.slice(0, 40)
  // by the day it settled: a flat list of forty finished things is a wall, and
  // the same title finished twice on different days is not a duplicate
  const oceanDays = Object.entries(
    ocean.reduce<Record<string, typeof ocean>>((acc, t) => {
      const day = t.completed_at ? humanDate(t.completed_at.slice(0, 10), todayISO()) : 'some time ago'
      ;(acc[day] ??= []).push(t)
      return acc
    }, {}),
  )


  async function runDistill() {
    setLearning(true)
    setLearnt(null)
    // The same door everything else goes through, so pasting a bio cannot
    // re-add six things it already knows in slightly different words.
    const res = await learn(distillText, { from: 'something you pasted in' })
    setLearning(false)
    setLearnt(res)
    if (res.added || res.updated || res.archived) setDistillText('')
  }


  return (
    <div className="page">
      {/* No eyebrow saying "Memory" above it: the tab you pressed to get here
          already says Memory, and labelling a room with its own name is the
          kind of thing a page does when it is not sure of itself. */}
      {/* What the water keeps, and nothing else.
          Four sections used to bracket this one: a notification card above it,
          then autonomy, data and the account below. All of them are things you
          go looking for on purpose, once; this is the page you read. They are
          behind the ⚙ now — see SettingsPage. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="page-title">What the water keeps</h1>
        <Link
          to="/settings"
          aria-label="Settings"
          className="btn btn--ghost"
          /* minWidth because it holds a gear and nothing else, so it came out
             33 points wide — the one control on this page under the floor */
          style={{ textDecoration: 'none', flexShrink: 0, padding: '4px 10px', minWidth: 44 }}
        >
          ⚙
        </Link>
      </div>

      {/* Finding comes first: it is the errand people arrive with. Everything
          below is reading; this is the one part of the page that answers. */}
      <Find />

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>What it has picked up</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 6 }}>
          Picked up from working with you, and yours to correct — change or remove
          anything here. It brings a few of these to whatever you are doing rather than
          all of them, every time.
        </p>
        {/* …and here is that sentence being kept. Twelve get carried on every
            run and whatever gets carried is marked, so this is a measurement
            rather than a promise. */}
        {live.length > 0 && (
          <p className="faint" style={{ fontSize: 'var(--fs-caption)', marginBottom: 10 }}>
            {/* The leaning is worth a line only when it is telling you
                something you could act on. "17 things kept · 17 leaned on this
                week" is a true sentence that says nothing: the ranker carries
                twelve a run, so on a small memory everything gets carried and
                the number is just the total again, wearing a hat. */}
            {working === 0 && `${live.length} things kept. None of them has been needed this week.`}
            {working > 0 && working < live.length && `${live.length} things kept · ${working} leaned on this week.`}
            {working > 0 && working === live.length && `${live.length} things kept, all of them in use.`}
          </p>
        )}
        {/* A way through it, once there is enough of it to need one. Below that
            a filter is a control asking to be used on four things, and the top
            of this page already has a search — for what you have written,
            which is a different question and must not be confused with this
            one. Hence the placement, inside the card it filters. */}
        {live.length >= FILTER_FROM && (
          <input
            className="field"
            aria-label="Filter what it has picked up"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inputStyle, marginBottom: 12 }}
          />
        )}
        {/*
         * Two halves, because the ranker treats them as two halves.
         *
         * A constraint, a preference and how you work ride along on every
         * single request — see recall.ts, where standing decides it. The rest
         * have to be about the question to travel at all. Shown as eight equal
         * buckets in a row, a rule that governs every piece of work the app
         * does looked exactly like a fact about one supplier; and with a
         * hundred memories in here the situational half — facts accumulate
         * fastest and matter least — would bury the governing half entirely.
         */}
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {always.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 2 }}>Whatever you are working on</div>
              <p className="faint" style={{ fontSize: 'var(--fs-caption)', marginBottom: 8 }}>
                These come along every time, whatever you have asked for.
              </p>
              <Kinds items={always} onSave={updateMemory} onDelete={deleteMemory} />
            </>
          )}
          {situational.length > 0 &&
            (situational.length > FOLD_FROM ? (
              <details style={{ marginTop: always.length ? 10 : 0 }}>
                <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                  <span className="eyebrow">When it comes up</span>
                  <span className="faint" style={{ fontSize: 'var(--fs-caption)', marginLeft: 8 }}>
                    {situational.length}
                  </span>
                </summary>
                <p className="faint" style={{ fontSize: 'var(--fs-caption)', margin: '8px 0' }}>
                  These come along when what you are doing is about them.
                </p>
                <Kinds items={situational} onSave={updateMemory} onDelete={deleteMemory} />
              </details>
            ) : (
              <div style={{ marginTop: always.length ? 10 : 0 }}>
                <div className="eyebrow" style={{ marginBottom: 2 }}>When it comes up</div>
                <p className="faint" style={{ fontSize: 'var(--fs-caption)', marginBottom: 8 }}>
                  These come along when what you are doing is about them.
                </p>
                <Kinds items={situational} onSave={updateMemory} onDelete={deleteMemory} />
              </div>
            ))}
          {filter.trim() && !always.length && !situational.length && (
            <p className="faint" style={{ fontSize: 'var(--fs-label)' }}>Nothing here matches that.</p>
          )}
          {live.length === 0 && (
            <p className="faint" style={{ fontSize: 'var(--fs-label)' }}>
              Nothing yet. It picks things up as you use it — anything ⚡ or the daily
              read works out about how you work turns up here, and you can change or
              remove any of it.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            aria-label="Tell it something about how you work"
            placeholder="Tell it something about how you work…"
            value={newMem}
            onChange={(e) => setNewMem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newMem.trim()) {
                addMemory(newMem.trim())
                setNewMem('')
              }
            }}
            className="field"
            style={inputStyle}
          />
          <button
            className="btn btn--sm"
            disabled={!newMem.trim()}
            onClick={() => {
              addMemory(newMem.trim())
              setNewMem('')
            }}
          >
            Add
          </button>
        </div>
        <details>
          <summary className="muted" style={{ fontSize: 'var(--fs-label)', cursor: 'pointer' }}>
            Paste anything → let it take what is worth keeping
          </summary>
          <textarea
            value={distillText}
            onChange={(e) => setDistillText(e.target.value)}
            rows={4}
            aria-label="Paste something for it to learn from"
            placeholder="Paste notes, an email, a bio. It keeps what is durable about you, corrects what it already believed, and ignores the rest."
            className="field"
            style={{ marginTop: 8, resize: 'vertical', minHeight: 90 }}
          />
          <button
            className="btn btn--sm btn--accent"
            style={{ marginTop: 8 }}
            disabled={!distillText.trim() || learning || offline}
            onClick={runDistill}
          >
            {learning ? 'Reading it…' : '✦ Take it in'}
          </button>
          {/* Says what actually happened, including — usually — nothing. A
              memory feature that reports success after changing nothing is one
              you stop believing. */}
          {learnt && !learning && (
            <p className="muted" style={{ fontSize: 'var(--fs-label)', marginTop: 8 }} role="status">
              {tookIn(learnt)}
            </p>
          )}
        </details>
      </section>

      <ChangedItsMind shelved={shelved} events={memoryEvents} />

      <NeverNeeded memories={unread} onDelete={deleteMemory} />

      <section className="card" style={{ marginBottom: 16 }}>
        <details>
          <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
            <h2 style={{ fontSize: 'var(--fs-md)', display: 'inline' }}>What you finished</h2>
            <span className="faint" style={{ fontSize: 'var(--fs-label)', marginLeft: 8 }}>
              {oceanCount === 0 ? 'still empty' : `${oceanCount} finished`}
            </span>
          </summary>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', margin: '10px 0' }}>
            {/* The sea is where you let things go now — see the two edges in
                the sky — so this list can no longer call itself the ocean.
                What it holds has not changed: everything you finished. */}
            Everything you have finished. Tap the mark to bring one back.
          </p>
          {oceanDays.map(([day, items]) => (
            <div key={day} style={{ marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {day}
              </div>
              <div style={{ display: 'grid', gap: 7 }}>
                {items.map((t) => (
                  <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                    <button
                      aria-label={`Bring back ${t.title || 'this'}`}
                      className="hit"
                      onClick={() => toggleDone(t.id)}
                      style={{
                        flex: '0 0 auto',
                        width: 13,
                        height: 13,
                        borderRadius: '50%',
                        border: '1px solid rgba(var(--accent-rgb), 0.5)',
                        background: 'rgba(var(--accent-rgb), 0.16)',
                        flexShrink: 0,
                      }}
                    />
                    {/* text, not a link. This is a record of what is
                        finished; the mark beside it is the way back in, which
                        is what the line above this list says. It used to open
                        a detail screen that no longer exists — the only place
                        in the whole app that reached it. */}
                    <span
                      style={{
                        // flex items refuse to shrink below their content
                        // without this, which is what pushed long titles off
                        // the right edge of the screen instead of clipping them
                        flex: '1 1 auto',
                        minWidth: 0,
                        fontSize: 'var(--fs-label)',
                        color: 'var(--ink-soft)',
                        textDecoration: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.title || t.raw_content.slice(0, 80)}
                    </span>
                    <TypeBadge type={t.type} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {oceanCount > ocean.length && (
            <p className="faint" style={{ fontSize: 'var(--fs-caption)' }}>
              and {oceanCount - ocean.length} older
            </p>
          )}
        </details>
      </section>

    </div>
  )
}

// kept only for the few places that need it as an object; the look lives in
// .field so every page types into the same water
const inputStyle: React.CSSProperties = { flex: 1 }

/**
 * Headings for the kinds, in the order they are worth reading.
 *
 * "Constraint" and "preference" are the model's words, not this person's. What
 * belongs above a list of your own rules is a sentence, not a taxonomy label.
 */
const KIND_WORDS: Record<string, string> = {
  constraint: 'What you will not do',
  preference: 'What you always want',
  pattern: 'How you work',
  goal: 'What you are aiming at',
  person: 'Who you work with',
  tool: 'What you work in',
  fact: 'Where things stand',
  '': 'Everything else',
}

const KIND_ORDER = ['constraint', 'preference', 'pattern', 'goal', 'person', 'tool', 'fact', '']

/** The kinds inside one half of the page, each under its own word. */
function Kinds({
  items,
  onSave,
  onDelete,
}: {
  items: Memory[]
  onSave: (id: string, v: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <>
      {byKind(items).map(([kind, group]) => (
        <div key={kind} style={{ marginBottom: 6 }}>
          <div className="faint" style={{ fontSize: 'var(--fs-caption)', marginBottom: 4 }}>
            {KIND_WORDS[kind] ?? kind}
          </div>
          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {group.map((m) => (
              <MemoryRow key={m.id} memory={m} onSave={(v) => onSave(m.id, v)} onDelete={() => onDelete(m.id)} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

/** Enough of it to want a way through. */
const FILTER_FROM = 12
/** …and enough of the situational half to be worth putting away. */
const FOLD_FROM = 10

function byKind(memories: Memory[]): [string, Memory[]][] {
  const groups = new Map<string, Memory[]>()
  for (const m of memories) {
    const k = m.kind && KIND_ORDER.includes(m.kind) ? m.kind : ''
    const list = groups.get(k)
    if (list) list.push(m)
    else groups.set(k, [m])
  }
  // strongest first inside each group: what has repeatedly proved worth having
  for (const list of groups.values()) list.sort((a, b) => (b.strength ?? 1) - (a.strength ?? 1))
  return KIND_ORDER.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!])
}

/** What the reconciler did, said plainly — including when it did nothing. */
function tookIn(l: Learned): string {
  const bits = [
    l.added ? `${l.added} new` : '',
    l.updated ? `${l.updated} corrected` : '',
    l.archived ? `${l.archived} no longer true` : '',
  ].filter(Boolean)
  if (!bits.length) return l.knew ? 'Nothing new — it already knew all of that.' : 'Nothing in there worth keeping.'
  return bits.join(' · ') + (l.knew ? ` · ${l.knew} it already knew` : '')
}

/**
 * One thing it believes: a line you can scan, and everything else on request.
 *
 * This used to render whole. Every memory at body weight, full width, with its
 * reason and its recency underneath — which on real data is four lines each,
 * seventeen times, and what you get is not a list of what an app knows about
 * you but a wall of text you scroll past. The one thing this page exists to do
 * is let you check what it believes, and you cannot check what you will not
 * read.
 *
 * So: the claim, clamped to one line. Tap to see the whole of it with where it
 * came from and when it was last needed; tap again for the field. Read first,
 * edit second — the same rule a thing in the sky follows when you tap it.
 */
function MemoryRow({
  memory,
  onSave,
  onDelete,
}: {
  memory: Memory
  onSave: (v: string) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(memory.content)
  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="field"
          aria-label="What it remembers"
          value={v}
          onChange={(e) => setV(e.target.value)}
          style={inputStyle}
        />
        <button
          className="btn btn--sm"
          onClick={() => {
            onSave(v)
            setEditing(false)
          }}
        >
          Save
        </button>
      </div>
    )
  }
  // How often it has been leaned on. Three dots rather than a number, because
  // "17" invites you to wonder what 17 means and the only thing worth knowing
  // here is whether this is load-bearing or something it noticed once.
  const strength = Math.min(3, Math.ceil((memory.strength ?? 1) / 4))
  const why = (memory.origin as { why?: string } | null)?.why
  // The dots say whether this is load-bearing. This says whether it still is —
  // which is the whole difference between something true about how you work
  // and something that was true in March.
  const used = leanedWords(memory, todayISO())
  return (
    /*
     * `minWidth: 0` twice, and neither is optional.
     *
     * A grid item and a flex item both default to `min-width: auto`, which
     * means "at least as wide as my content" — so a row holding one unwrapped
     * line does not ellipsise, it widens its track, and the card, and the page.
     * The first build of this shipped a sky-wide horizontal scroll and a title
     * hanging off the left edge.
     */
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            fontSize: 'var(--fs-label)',
            minHeight: 40,
            lineHeight: 1.4,
            // one line until asked. `minWidth: 0` above is what lets it
            // actually shrink — a flex child will not ellipsise without it,
            // it just pushes the dots and the × off the edge instead.
            ...(open ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
          }}
        >
          {memory.content}
        </button>
        <span
          className="faint"
          aria-label={`leaned on ${memory.strength ?? 1} times`}
          title={`Leaned on ${memory.strength ?? 1} time${(memory.strength ?? 1) === 1 ? '' : 's'}`}
          style={{ fontSize: 'var(--fs-caption)', flex: '0 0 auto', letterSpacing: '0.1em' }}
        >
          {'•'.repeat(strength)}
        </span>
        <button aria-label="Delete memory" className="faint hit" onClick={onDelete} style={{ flex: '0 0 auto' }}>
          ×
        </button>
      </div>
      {open && (
        <div style={{ paddingBottom: 8 }}>
          <div className="faint" style={{ fontSize: 'var(--fs-caption)', lineHeight: 1.45 }}>
            {why ? `${why} · ${used}` : used}
          </div>
          <button
            className="btn btn--sm btn--ghost"
            style={{ marginTop: 6 }}
            onClick={() => {
              setV(memory.content)
              setEditing(true)
            }}
          >
            Edit
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * What has ridden along unread since the day it was written.
 *
 * This app's argument is that thinking should cycle rather than accumulate,
 * and what it knows about you was the one place that argument had not reached:
 * memory only ever went in. Everything here has been offered to the ranker on
 * every run since it was written and never once been worth carrying — which is
 * the closest thing to evidence that it is not true of you any more, or never
 * was.
 *
 * Listed, never swept. One tap deletes one of them, and the app deletes none:
 * a thing that quietly bins what it knows about you on a heuristic is a thing
 * you cannot leave running. Folded, and absent until there is something in it.
 */
function NeverNeeded({ memories, onDelete }: { memories: Memory[]; onDelete: (id: string) => void }) {
  if (!memories.length) return null
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <details>
        <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
          <h2 style={{ fontSize: 'var(--fs-md)', display: 'inline' }}>What it has never needed</h2>
          <span className="faint" style={{ fontSize: 'var(--fs-label)', marginLeft: 8 }}>
            {memories.length}
          </span>
        </summary>
        <p className="muted" style={{ fontSize: 'var(--fs-label)', margin: '10px 0' }}>
          Offered on every run since you wrote it, and never once carried. Worth a read —
          some of it will be wrong now, and some of it is worded in a way nothing ever matches.
        </p>
        <div style={{ display: 'grid', gap: 2 }}>
          {memories.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: '9px 0',
                borderTop: i ? '0.5px solid var(--line)' : 'none',
              }}
            >
              <span style={{ flex: 1, fontSize: 'var(--fs-label)', lineHeight: 1.4 }}>{m.content}</span>
              <button
                aria-label={`Forget: ${m.content}`}
                className="faint hit"
                onClick={() => onDelete(m.id)}
                style={{ flex: '0 0 auto' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}

/**
 * What it used to believe, and why it stopped.
 *
 * The agent archives rather than deletes, and this is the reason that
 * distinction is worth the column. Something that can quietly revise what it
 * knows about you, with no way to see that it did, is not something you would
 * let anywhere near what it knows about you. Folded shut, and absent entirely
 * until it has changed its mind at least once.
 */
function ChangedItsMind({ shelved, events }: { shelved: Memory[]; events: MemoryEvent[] }) {
  const changes = events.filter((e) => e.op === 'update' || e.op === 'archive')
  if (!shelved.length && !changes.length) return null
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <details>
        <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
          <h2 style={{ fontSize: 'var(--fs-md)', display: 'inline' }}>What it changed its mind about</h2>
          <span className="faint" style={{ fontSize: 'var(--fs-label)', marginLeft: 8 }}>
            {changes.length || shelved.length}
          </span>
        </summary>
        <p className="muted" style={{ fontSize: 'var(--fs-label)', margin: '10px 0' }}>
          It corrects what it knows rather than piling more on top. Nothing here is gone — this is what it
          stopped believing, and what it says made it stop.
        </p>
        <div style={{ display: 'grid', gap: 2 }}>
          {changes.slice(0, 30).map((e, i) => (
            <div key={e.id} style={{ padding: '9px 0', borderTop: i ? '0.5px solid var(--line)' : 'none' }}>
              <div
                className="muted"
                style={{ fontSize: 'var(--fs-label)', textDecoration: 'line-through', lineHeight: 1.4 }}
              >
                {e.before}
              </div>
              {e.after && (
                <div style={{ fontSize: 'var(--fs-label)', lineHeight: 1.4, marginTop: 3 }}>{e.after}</div>
              )}
              {e.why && (
                <div className="faint" style={{ fontSize: 'var(--fs-caption)', marginTop: 3 }}>
                  {e.why}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}

/**
 * What the app has done to your thinking lately.
 *
 * Everything in the sky announces itself once and vanishes: a pool formed, six
 * things gathered, the map moved, the agent came back. An app that reorganises
 * your thinking on your behalf owes you a record of having done so — otherwise
 * you come back to a sky that has changed and there is nobody to ask.
 *
 * Local to this device, because it is a record of what you were shown rather
 * than data about you, and it goes when you clear it.
 */

/**
 * Being told when the agent finishes.
 *
 * The work already runs somewhere your phone is not; this is only about
 * whether it can reach you. Off by default and never asked for in passing —
 * a permission prompt you did not go looking for is one you say no to.
 */
