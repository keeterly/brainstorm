// The few things this app has to be told, rather than the things it knows.
//
// These lived on Memory, stacked above and below the one thing that page is
// for. A notification card sat at the very top — a piece of one-time setup in
// the most valuable position on the screen, permanently, saying "not set up
// yet" on a deployment where it cannot be. Below the memories came the AI's
// autonomy, then export and import, then the account, then Sign out. Five
// unrelated rooms with no door between them and no way to tell, on arriving,
// which one you were in.
//
// So Memory is what the water keeps, and this is everything you would go
// looking for on purpose. One ⚙ in Memory's header leads here; nothing has
// been lost, it is one tap further away, and the page you read every day is
// shorter by four sections.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { Screen } from '@/features/memory/Screen'

// kept only for the few places that need it as an object; the look lives in
// .field so every page types into the same water
const inputStyle: React.CSSProperties = { flex: 1 }

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


export default function SettingsPage() {
  const nav = useNavigate()
  const profile = useGraph((s) => s.profile)
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const roadmaps = useGraph((s) => s.roadmaps)
  const memories = useGraph((s) => s.memories)
  const updateProfileSettings = useGraph((s) => s.updateProfileSettings)
  const [spend, setSpend] = useState<number | null>(null)
  const autonomy = profile?.settings.autonomy ?? 'suggest'

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
      <button
        className="btn btn--ghost"
        style={{ marginBottom: 10, paddingLeft: 0 }}
        onClick={() => nav('/memory')}
      >
        ← Memory
      </button>
      <h1 className="page-title">Settings</h1>

      <TellMe />

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

      <WhatItDid />

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
