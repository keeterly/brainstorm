// Where a password reset actually finishes. The recovery link signs you in on
// its own, so without this the reset silently never happens.
import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'

export function SetPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <div className="page" style={{ paddingTop: '20vh', maxWidth: '24rem' }}>
      <h1 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, letterSpacing: '-0.02em' }}>
        Choose a new password
      </h1>
      <p className="muted" style={{ margin: '8px 0 24px' }}>
        You’re signed in. Set a password so you can get back in from any browser.
      </p>
      <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        <input
          type="password"
          required
          minLength={8}
          autoFocus
          placeholder="New password (8+ characters)"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          style={{
            minHeight: 48,
            padding: '0 14px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--line-mid)',
            background: 'var(--bg-raised)',
            fontSize: 'var(--fs-body)',
          }}
        />
        <button className="btn btn--primary" type="submit" disabled={busy || pw.length < 8}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
      {error && (
        <p style={{ marginTop: 14, color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      )}
      <button className="muted" style={{ marginTop: 22, fontSize: 'var(--fs-label)', textDecoration: 'underline' }} onClick={onDone}>
        Skip for now
      </button>
    </div>
  )
}
