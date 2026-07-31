import { useEffect, useState } from 'react'
import { useGraph } from '@/store/graph'
import { discardFailed, onOutboxChange, retryFailed } from '@/lib/outbox'

/**
 * The one place the app admits something is wrong with saving.
 *
 * It had two honest states — offline, and syncing — and a third that was not:
 * "Working from local copy — reconnecting…" while nothing was reconnecting at
 * all. Now it has a fourth that matters more than the other three: writes the
 * server refused, which the outbox parks rather than deleting. Those need a
 * person, so they get a sentence and a choice, instead of the console warning
 * nobody was ever going to read.
 */
export function OfflineBanner() {
  const offline = useGraph((s) => s.offline)
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const off = onOutboxChange((s) => {
      setPending(s.pending)
      setFailed(s.failed)
    })
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      off()
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (online && !offline && pending === 0 && failed === 0) return null

  const bad = failed > 0
  const msg = bad
    ? `${failed} change${failed === 1 ? '' : 's'} could not be saved`
    : !online
      ? `Offline — changes saved locally${pending ? ` (${pending} pending)` : ''} · AI paused`
      : pending
        ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…`
        : 'Working from a local copy · AI paused'
  const act: React.CSSProperties = {
    background: 'none',
    border: 0,
    padding: 0,
    font: 'inherit',
    color: 'inherit',
    textDecoration: 'underline',
    cursor: 'pointer',
  }
  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 90,
        // The banner is the topmost thing on the screen, and on an installed
        // iOS app the top of the screen is under the clock. It has to keep
        // clear of that itself — nothing above it is going to.
        padding: 'calc(6px + var(--sat, 0px)) 16px 6px',
        textAlign: 'center',
        fontSize: 'var(--fs-label)',
        background: bad ? 'var(--danger-soft)' : 'var(--warn-soft)',
        color: bad ? 'var(--danger)' : 'var(--warn)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {msg}
      {bad && (
        <>
          {' · '}
          <button style={act} onClick={() => void retryFailed()}>
            try again
          </button>
          {' · '}
          <button style={act} onClick={() => void discardFailed()}>
            let them go
          </button>
        </>
      )}
    </div>
  )
}
