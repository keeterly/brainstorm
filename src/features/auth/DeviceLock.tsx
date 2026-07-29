// The Face ID gate. When this device carries a passkey, an already-signed-in
// session opens behind it. Ported from the VENIA OS pattern: try silently on
// load, offer the button for the gesture iOS requires, and always keep a way
// through that does not depend on biometrics.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { forget, unlock } from '@/lib/passkey'

export function DeviceLock({ onOpen }: { onOpen: () => void }) {
  const [tried, setTried] = useState(false)
  const [failed, setFailed] = useState(false)
  const auto = useRef(false)

  const attempt = useCallback(
    async (manual: boolean) => {
      setFailed(false)
      const ok = await unlock()
      if (ok) onOpen()
      // an automatic attempt iOS refused is not a failure worth reporting
      else if (manual) setFailed(true)
      setTried(true)
    },
    [onOpen],
  )

  useEffect(() => {
    if (auto.current) return
    auto.current = true
    void attempt(false)
  }, [attempt])

  return (
    <div className="page" style={{ paddingTop: '26vh', maxWidth: '22rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>Brainstorm</h1>
      <p className="muted" style={{ margin: '10px 0 30px' }}>Locked on this device.</p>

      <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => void attempt(true)}>
        <span aria-hidden style={{ marginRight: 8 }}>
          <FaceIcon />
        </span>
        Unlock with Face ID
      </button>

      {failed && tried && (
        <p style={{ marginTop: 14, color: 'var(--danger)', fontSize: 'var(--fs-label)' }} role="alert">
          Face ID did not match. Try again, or sign in another way.
        </p>
      )}

      <div style={{ marginTop: 26, display: 'flex', gap: 16, justifyContent: 'center' }}>
        <button
          className="muted"
          style={linkStyle}
          onClick={() => {
            // stop asking on this device, but stay signed in
            forget()
            onOpen()
          }}
        >
          Turn off Face ID
        </button>
        <button
          className="muted"
          style={linkStyle}
          onClick={() => {
            forget()
            void supabase.auth.signOut()
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function FaceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" style={{ verticalAlign: '-3px' }} aria-hidden>
      <path
        d="M4 8.4V6.4A2.4 2.4 0 0 1 6.4 4h2M15.6 4h2A2.4 2.4 0 0 1 20 6.4v2M20 15.6v2a2.4 2.4 0 0 1-2.4 2.4h-2M8.4 20h-2A2.4 2.4 0 0 1 4 17.6v-2M9 9.6v1.6M15 9.6v1.6M12 9.4v3.4h-.9M9.2 15.6a4 4 0 0 0 5.6 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const linkStyle: React.CSSProperties = { fontSize: 'var(--fs-label)', textDecoration: 'underline' }
