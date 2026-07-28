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
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-label="Focus on one action"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 36,
        textAlign: 'center',
        background:
          'radial-gradient(ellipse 120% 60% at 50% -10%, var(--ground-high) 0%, transparent 60%), var(--ground)',
      }}
    >
      <div className="eyebrow" style={{ color: 'var(--water)' }}>
        Focus
      </div>
      <div
        style={{
          fontSize: 25,
          fontWeight: 300,
          lineHeight: 1.45,
          letterSpacing: '-0.01em',
          maxWidth: 330,
          textWrap: 'balance',
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
