// Offered once, after you are already inside — never in the way of getting in.
import { useEffect, useState } from 'react'
import { available, decline, enroll, hasDeclined, isEnrolled } from '@/lib/passkey'
import { useGraph } from '@/store/graph'

export function EnrollFaceId() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const name = useGraph((s) => s.profile?.display_name) ?? 'Brainstorm'

  useEffect(() => {
    if (isEnrolled() || hasDeclined()) return
    let alive = true
    // let the world settle before asking for anything
    const t = setTimeout(() => {
      void available().then((ok) => {
        if (ok && alive) setShow(true)
      })
    }, 2600)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [])

  if (!show) return null
  return (
    <div
      role="dialog"
      aria-label="Use Face ID next time"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(var(--tabbar-h) + var(--sab) + 16px)',
        zIndex: 250,
        width: 'min(92vw, 26rem)',
        padding: 'var(--sp-4)',
        borderRadius: 'var(--r-lg)',
        background: 'var(--sheet)',
        border: '0.5px solid var(--glass-line)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: 'var(--shadow-pop)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Open with Face ID next time?</div>
      <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 12 }}>
        Locks Brainstorm on this device — no password to type.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn--primary btn--sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const ok = await enroll(name)
            setBusy(false)
            if (ok) setShow(false)
          }}
        >
          {busy ? 'Setting up…' : 'Use Face ID'}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => {
            decline()
            setShow(false)
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
