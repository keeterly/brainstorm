import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'magic' | 'password' | 'signup'>('magic')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        setNotice('Check your email for a sign-in link.')
      } else if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setNotice('Account created — check your email to confirm.')
      }
    } catch (err) {
      setError(String((err as Error).message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page" style={{ paddingTop: '18vh', maxWidth: '24rem' }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>
        Brainstorm
      </h1>
      <p className="muted" style={{ margin: '8px 0 28px' }}>
        Get ideas out of your head — and into motion.
      </p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        {mode !== 'magic' && (
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password"
            value={password}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        )}
        <button className="btn btn--primary" disabled={busy || !email} type="submit">
          {busy
            ? 'Working…'
            : mode === 'magic'
              ? 'Email me a sign-in link'
              : mode === 'password'
                ? 'Sign in'
                : 'Create account'}
        </button>
      </form>
      {notice && (
        <p style={{ marginTop: 16, color: 'var(--accent-ink)' }} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p style={{ marginTop: 16, color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      )}
      <div style={{ marginTop: 24, display: 'flex', gap: 16 }}>
        {mode !== 'magic' && (
          <button className="muted" style={linkStyle} onClick={() => setMode('magic')}>
            Use a magic link
          </button>
        )}
        {mode !== 'password' && (
          <button className="muted" style={linkStyle} onClick={() => setMode('password')}>
            Sign in with password
          </button>
        )}
        {mode !== 'signup' && (
          <button className="muted" style={linkStyle} onClick={() => setMode('signup')}>
            Create account
          </button>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  minHeight: 48,
  padding: '0 14px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--line-mid)',
  background: 'var(--bg-raised)',
  fontSize: 'var(--fs-body)',
}

const linkStyle: React.CSSProperties = {
  fontSize: 'var(--fs-label)',
  textDecoration: 'underline',
}
