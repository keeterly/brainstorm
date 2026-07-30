// Memory — everything the water keeps: what the app has done to your thinking,
// the ocean of finished work, the editable facts the AI knows about you, and
// the app's few quiet controls.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useGraph } from '@/store/graph'
import { exportMarkdown } from '@/domain/export-markdown'
import { clearSnapshot } from '@/lib/idb'
import { clearTrail, readTrail, trailWhen } from '@/lib/trail'
import { disable as pushOff, enable as pushOn, explain as pushWhy, readiness, subscribed } from '@/lib/push'
import {
  available as passkeyAvailable,
  enroll as enrollPasskey,
  forget as forgetPasskey,
  isEnrolled as isPasskeyEnrolled,
} from '@/lib/passkey'
import { TypeBadge } from '@/components/TypeBadge'
import { humanDate } from '@/domain/human-date'
import { todayISO } from '@/domain/prioritize-prepass'
import { learn, type Learned } from '@/ai/memoryFlow'
import { Screen } from './Screen'
import type { Memory, MemoryEvent } from '@/domain/types'

// Account — set a password (this is where a reset finishes), and choose
// whether this device opens with Face ID.
function AccountSection() {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [face, setFace] = useState(isPasskeyEnrolled())
  const [canFace, setCanFace] = useState(false)
  useEffect(() => {
    void passkeyAvailable().then(setCanFace)
  }, [])
  return (
    <section style={{ marginBottom: 'var(--sp-6)' }}>
      <h2 className="eyebrow" style={{ marginBottom: 10 }}>Account</h2>
      <form
        style={{ display: 'flex', gap: 8, marginBottom: 10 }}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setMsg(null)
          const { error } = await supabase.auth.updateUser({ password: pw })
          setBusy(false)
          setMsg(error ? error.message : 'Password set.')
          if (!error) setPw('')
        }}
      >
        <input
          type="password"
          minLength={8}
          required
          placeholder="New password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="field"
          style={inputStyle}
        />
        <button className="btn btn--ghost" type="submit" disabled={busy || pw.length < 8}>
          {busy ? 'Saving…' : 'Set'}
        </button>
      </form>
      {canFace && (
        <button
          className="btn btn--ghost"
          onClick={async () => {
            if (face) {
              forgetPasskey()
              setFace(false)
              setMsg('Face ID turned off on this device.')
            } else {
              const ok = await enrollPasskey('Brainstorm')
              setFace(ok)
              setMsg(ok ? 'Face ID will open Brainstorm on this device.' : 'Face ID setup was cancelled.')
            }
          }}
        >
          {face ? 'Turn off Face ID on this device' : 'Open with Face ID on this device'}
        </button>
      )}
      {msg && (
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginTop: 10 }} role="status">
          {msg}
        </p>
      )}
    </section>
  )
}

export default function MemoryPage() {
  const profile = useGraph((s) => s.profile)
  const memories = useGraph((s) => s.memories)
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const roadmaps = useGraph((s) => s.roadmaps)
  const offline = useGraph((s) => s.offline)
  const addMemory = useGraph((s) => s.addMemory)
  const updateMemory = useGraph((s) => s.updateMemory)
  const deleteMemory = useGraph((s) => s.deleteMemory)
  const updateProfileSettings = useGraph((s) => s.updateProfileSettings)
  const toggleDone = useGraph((s) => s.toggleDone)

  const memoryEvents = useGraph((s) => s.memoryEvents)
  const [newMem, setNewMem] = useState('')
  const [distillText, setDistillText] = useState('')
  const [spend, setSpend] = useState<number | null>(null)
  const [learning, setLearning] = useState(false)
  const [learnt, setLearnt] = useState<Learned | null>(null)

  // Believed and set aside. The second list is short and usually empty, and it
  // is the whole reason the agent is allowed to change its mind at all: a thing
  // that can quietly stop believing something, with no way to see that it did,
  // is not something you would let near what it knows about you.
  const live = memories.filter((m) => !m.archived_at)
  const shelved = memories.filter((m) => m.archived_at)

  const autonomy = profile?.settings.autonomy ?? 'suggest'
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

  useEffect(() => {
    const since = new Date()
    since.setDate(1)
    since.setHours(0, 0, 0, 0)
    void supabase
      .from('agent_runs')
      .select('cost_usd')
      .gte('created_at', since.toISOString())
      .then(({ data }) => {
        if (data) setSpend(data.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0))
      })
  }, [])

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

  function download() {
    const md = exportMarkdown({ thoughts, relationships, roadmaps, memories })
    const blob = new Blob([md], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `brainstorm-export-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="page">
      {/* No eyebrow saying "Memory" above it: the tab you pressed to get here
          already says Memory, and labelling a room with its own name is the
          kind of thing a page does when it is not sure of itself. */}
      <h1 className="page-title">What the water keeps</h1>

      <TellMe />

      <WhatItDid />

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Known about you</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
          Fully yours — edit or delete anything. It picks from this for whatever you
          are working on, rather than sending all of it every time.
        </p>
        {/* Grouped, because the kinds are not equal. A constraint you gave it is
            worth reading before a fact it happened to notice, and a flat list in
            the order things were written buries the important half. */}
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {byKind(live).map(([kind, items]) => (
            <div key={kind} style={{ marginBottom: 6 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {KIND_WORDS[kind] ?? kind}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {items.map((m) => (
                  <MemoryRow
                    key={m.id}
                    memory={m}
                    onSave={(v) => updateMemory(m.id, v)}
                    onDelete={() => deleteMemory(m.id)}
                  />
                ))}
              </div>
            </div>
          ))}
          {live.length === 0 && (
            <p className="faint" style={{ fontSize: 'var(--fs-label)' }}>
              Nothing yet. This fills itself as you use the app — anything ⚡ or the
              daily read works out about how you work lands here, and you can edit
              or delete any of it.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            placeholder="Add a fact, preference, or constraint…"
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

      <section className="card" style={{ marginBottom: 16 }}>
        <details>
          <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
            <h2 style={{ fontSize: 'var(--fs-md)', display: 'inline' }}>The ocean</h2>
            <span className="faint" style={{ fontSize: 'var(--fs-label)', marginLeft: 8 }}>
              {oceanCount === 0 ? 'still empty' : `${oceanCount} finished`}
            </span>
          </summary>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', margin: '10px 0' }}>
            Finished work settles here. Tap the mark to bring one back.
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
                    <Link
                      to={`/thought/${t.id}`}
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
                    </Link>
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

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>How much the AI does</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`chip ${autonomy === 'suggest' ? 'chip--on' : ''}`}
            onClick={() => updateProfileSettings({ autonomy: 'suggest' })}
          >
            Suggest only
          </button>
          <button
            className={`chip ${autonomy === 'organize' ? 'chip--on' : ''}`}
            onClick={() => updateProfileSettings({ autonomy: 'organize' })}
          >
            Organize automatically
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Data</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn btn--ghost" onClick={download}>
            ⬇ Export everything as Markdown
          </button>
          <Link to="/import" className="btn btn--ghost" style={{ textDecoration: 'none' }}>
            ⇪ Import from VENIA Brainstorm
          </Link>
          <Link to="/runs" className="btn btn--ghost" style={{ textDecoration: 'none' }}>
            ⚙ AI activity{' '}
            {spend != null && <span className="mono faint">(${spend.toFixed(2)} this month)</span>}
          </Link>
        </div>
        <Screen />
      </section>

      <AccountSection />

      <button
        className="btn btn--danger"
        onClick={async () => {
          await clearSnapshot()
          forgetPasskey()
          await supabase.auth.signOut()
        }}
      >
        Sign out
      </button>
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
  fact: 'About your situation',
  '': 'Everything else',
}

const KIND_ORDER = ['constraint', 'preference', 'pattern', 'goal', 'person', 'tool', 'fact', '']

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

function MemoryRow({
  memory,
  onSave,
  onDelete,
}: {
  memory: Memory
  onSave: (v: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(memory.content)
  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="field" value={v} onChange={(e) => setV(e.target.value)} style={inputStyle} />
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
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        onClick={() => setEditing(true)}
        style={{ flex: 1, textAlign: 'left', fontSize: 'var(--fs-label)', minHeight: 44, lineHeight: 1.4 }}
      >
        {memory.content}
        {why && (
          <span className="faint" style={{ display: 'block', fontSize: 'var(--fs-caption)', marginTop: 2 }}>
            {why}
          </span>
        )}
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
function WhatItDid() {
  const [trail, setTrail] = useState(() => readTrail())
  if (!trail.length) return null
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>What it did</h2>
        <button
          className="btn btn--ghost"
          style={{ fontSize: 'var(--fs-label)', padding: '2px 8px' }}
          onClick={() => {
            clearTrail()
            setTrail([])
          }}
        >
          Clear
        </button>
      </div>
      <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
        Changes it made to your sky, on this device.
      </p>
      <div style={{ display: 'grid', gap: 2 }}>
        {trail.map((e, i) => (
          <div
            key={`${e.at}-${i}`}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              padding: '7px 0',
              borderTop: i ? '0.5px solid var(--line)' : 'none',
            }}
          >
            <span style={{ fontSize: 'var(--fs-sm)', minWidth: 0 }}>
              {e.what}
              {e.subject ? <span className="muted"> · {e.subject}</span> : null}
            </span>
            <span className="muted" style={{ fontSize: 'var(--fs-label)', whiteSpace: 'nowrap' }}>
              {trailWhen(e.at)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * Being told when the agent finishes.
 *
 * The work already runs somewhere your phone is not; this is only about
 * whether it can reach you. Off by default and never asked for in passing —
 * a permission prompt you did not go looking for is one you say no to.
 */
function TellMe() {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState('')
  const ready = readiness()

  useEffect(() => {
    void subscribed().then(setOn)
  }, [])

  async function toggle() {
    setBusy(true)
    setWhy('')
    if (on) {
      await pushOff()
      setOn(false)
    } else {
      const res = await pushOn()
      if (res.ok) setOn(true)
      else setWhy(res.why)
    }
    setBusy(false)
  }

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Tell me when it lands</h2>
      <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
        ⚡ already runs on the server, so it keeps going with your phone locked. Turn this on and it
        will say so when it comes back, instead of waiting for you to look.
      </p>
      {ready.can ? (
        <button className="btn" onClick={toggle} disabled={busy}>
          {busy ? '…' : on ? 'Stop telling me' : 'Tell me on this device'}
        </button>
      ) : (
        <p className="muted" style={{ fontSize: 'var(--fs-label)' }}>{pushWhy(ready)}</p>
      )}
      {on && !busy ? (
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginTop: 8 }}>
          On for this device. Each device you want telling you has to be turned on where it is.
        </p>
      ) : null}
      {why ? (
        <p style={{ fontSize: 'var(--fs-label)', marginTop: 8, color: 'var(--warn, #e0a05a)' }}>{why}</p>
      ) : null}
    </section>
  )
}
