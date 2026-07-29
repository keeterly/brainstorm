import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'

type Mode = 'magic' | 'password' | 'signup' | 'reset'
// which template sent the code the user is about to type
type Sent = 'email' | 'signup' | 'recovery'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('magic')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // the emailed link opens in whatever browser the mail app prefers; a typed
  // code signs you in HERE, which is the only reliable path on iOS.
  const [sentKind, setSentKind] = useState<Sent | null>(null)
  const [code, setCode] = useState('')

  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
        if (error) throw error
        setNotice('Check your email — tap the link, or type the 6-digit code below.')
        setSentKind('email')
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
        if (error) throw error
        setNotice('Reset sent. Type the 6-digit code from the email to get back in, then set a new password in Memory.')
        setSentKind('recovery')
      } else if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // Supabase will not admit that an email is already registered — it
        // returns success and sends nothing, so attackers cannot enumerate
        // accounts. The giveaway is an empty identities array. We can tell
        // our own user the truth rather than leave them waiting on an email
        // that is never coming.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode('password')
          setNotice('You already have an account. Enter your password — or reset it below.')
          return
        }
        setNotice('Account created — confirm via the email link or the code below.')
        setSentKind('signup')
      }
    } catch (err) {
      setError(friendly(String((err as Error).message || err)))
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    if (!sentKind || !code.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: sentKind })
      if (error) throw error
      // session lands in THIS browser; AuthGate takes it from here
    } catch (err) {
      setError(friendly(String((err as Error).message || err)))
    } finally {
      setBusy(false)
    }
  }

  const label = busy
    ? 'Working…'
    : mode === 'magic'
      ? 'Email me a sign-in link'
      : mode === 'reset'
        ? 'Email me a reset code'
        : mode === 'password'
          ? 'Sign in'
          : 'Create account'

  return (
    <div className="page" style={{ paddingTop: '18vh', maxWidth: '24rem' }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>Brainstorm</h1>
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
        {(mode === 'password' || mode === 'signup') && (
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
          {label}
        </button>
      </form>

      {notice && (
        <p style={{ marginTop: 16, color: 'var(--accent-ink)' }} role="status">
          {notice}
        </p>
      )}
      {sentKind && (
        <form onSubmit={verifyCode} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            style={{ ...inputStyle, flex: 1 }}
            aria-label="Code from the email"
          />
          <button className="btn btn--primary" type="submit" disabled={busy || code.trim().length < 6}>
            Enter
          </button>
        </form>
      )}
      {error && (
        <p style={{ marginTop: 16, color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      )}

      <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
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
        {mode !== 'reset' && (
          <button className="muted" style={linkStyle} onClick={() => setMode('reset')}>
            Forgot password
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

// Supabase speaks in shrugs. Say what actually happened.
function friendly(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials'))
    return 'That email and password do not match. Use “Forgot password” to get back in, or a magic link.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many emails for now — the mail service is rate limited. Wait a few minutes, or use a password.'
  if (m.includes('token has expired') || m.includes('expired'))
    return 'That code has expired. Send a fresh one.'
  if (m.includes('invalid token') || m.includes('otp'))
    return 'That code did not match. Check the newest email — an older code stops working once a new one is sent.'
  return msg
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
