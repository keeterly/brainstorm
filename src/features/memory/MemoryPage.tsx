// Memory — everything the water keeps: what the app has done to your thinking,
// the ocean of finished work, the editable facts the AI knows about you, and
// the app's few quiet controls.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useGraph } from '@/store/graph'
import { useAction } from '@/ai/useAction'
import type { DistillOutput } from '@shared/ai/actions/distill-memory'
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

  const [newMem, setNewMem] = useState('')
  const [distillText, setDistillText] = useState('')
  const [spend, setSpend] = useState<number | null>(null)
  const distill = useAction<DistillOutput>('distill_memory')

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
    const out = await distill.run({
      text: distillText,
      existing: memories.map((m) => m.content).slice(0, 100),
    })
    if (!out) return
    for (const f of out.facts) addMemory(f, 'distilled')
    setDistillText('')
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
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        Memory
      </div>
      <h1 className="page-title">What the water keeps</h1>

      <TellMe />

      <WhatItDid />

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Known about you</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
          Fully yours — edit or delete anything. It shapes every AI suggestion.
        </p>
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {memories.map((m) => (
            <MemoryRow
              key={m.id}
              content={m.content}
              source={m.source}
              onSave={(v) => updateMemory(m.id, v)}
              onDelete={() => deleteMemory(m.id)}
            />
          ))}
          {memories.length === 0 && (
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
            Paste anything → distill into memory
          </summary>
          <textarea
            value={distillText}
            onChange={(e) => setDistillText(e.target.value)}
            rows={4}
            placeholder="Paste notes, an email, a bio — durable facts are extracted for your review."
            style={{ ...inputStyle, width: '100%', marginTop: 8, padding: 12, resize: 'vertical', minHeight: 90 }}
          />
          <button
            className="btn btn--sm btn--accent"
            style={{ marginTop: 8 }}
            disabled={!distillText.trim() || distill.status === 'running' || offline}
            onClick={runDistill}
          >
            {distill.status === 'running' ? 'Distilling…' : '✦ Distill'}
          </button>
          {distill.status === 'error' && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)', marginTop: 8 }}>{distill.error}</p>
          )}
        </details>
      </section>

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

const inputStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 40,
  padding: '0 12px',
  border: '0.5px solid rgba(255,255,255,0.22)',
  borderRadius: 'var(--r-md)',
  background: 'rgba(255,255,255,0.05)',
  color: 'var(--ink)',
}

function MemoryRow({
  content,
  source,
  onSave,
  onDelete,
}: {
  content: string
  source: string
  onSave: (v: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(content)
  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={v} onChange={(e) => setV(e.target.value)} style={inputStyle} />
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
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        onClick={() => setEditing(true)}
        style={{ flex: 1, textAlign: 'left', fontSize: 'var(--fs-label)', minHeight: 44, lineHeight: 1.4 }}
      >
        {content}
      </button>
      <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>
        {source}
      </span>
      <button aria-label="Delete memory" className="faint hit" onClick={onDelete} style={{ flex: '0 0 auto' }}>
        ×
      </button>
    </div>
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
