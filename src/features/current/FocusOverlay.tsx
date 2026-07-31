// Focus — one drop at a time. A near-empty screen: the action, its origin,
// done. Nothing else exists while this is open.
import { useEffect } from 'react'
import type { Thought } from '@/domain/types'

export function FocusOverlay({
  thought,
  from,
  onDone,
  onClose,
}: {
  thought: Thought
  from: string | null
  onDone: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Belt and braces on the bottom strip. This overlay now runs past the
    // bottom of the glass like every other full-screen surface; the hem is the
    // fallback for whatever an installed phone turns out to let a fixed layer
    // paint down there, and it should be wearing this screen's colour while
    // this screen is the only thing on.
    document.body.classList.add('on-cover')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('on-cover')
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-label="Focus on one action"
      style={{
        position: 'fixed',
        // Plain inset: 0 — it covers the screen because the document is as
        // tall as the screen (see the hem in global.css). Reaching past that
        // as well pushed the one sentence on this screen off centre.
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        /* 36 on every side made a 320px measure on a 393px phone before the
           headline had said anything; the sides only need enough to keep the
           words off the glass */
        padding: '36px 20px',
        textAlign: 'center',
        background:
          'radial-gradient(ellipse 120% 60% at 50% -10%, var(--ground-high) 0%, transparent 60%), var(--ground)',
      }}
    >
      <div className="eyebrow" style={{ color: 'var(--water)' }}>
        Focus
      </div>
      {/* the same reasoning as the Current's own headline: this is the only
          thing on the screen, so it gets the screen */}
      <div
        style={{
          fontSize: 'clamp(25px, 7.2vw, 34px)',
          fontWeight: 300,
          lineHeight: 1.32,
          letterSpacing: '-0.016em',
          textWrap: 'pretty',
        }}
      >
        {thought.title || thought.raw_content}
      </div>
      {from && (
        <div className="eyebrow" style={{ letterSpacing: '0.14em' }}>
          from “{from}”
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          onClick={onDone}
          style={{
            minHeight: 46,
            padding: '0 26px',
            borderRadius: 'var(--r-full)',
            background: 'var(--ink)',
            color: '#0a0c12',
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          ✓ Done
        </button>
        <button
          onClick={onClose}
          style={{
            minHeight: 46,
            padding: '0 26px',
            borderRadius: 'var(--r-full)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            color: 'var(--ink-soft)',
            fontWeight: 500,
            fontSize: 15,
          }}
        >
          Back
        </button>
      </div>
    </div>
  )
}
