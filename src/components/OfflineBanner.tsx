import { useEffect, useState } from 'react'
import { useGraph } from '@/store/graph'
import { onOutboxChange } from '@/lib/outbox'

export function OfflineBanner() {
  const offline = useGraph((s) => s.offline)
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const off = onOutboxChange(setPending)
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

  if (online && !offline && pending === 0) return null
  const msg = !online
    ? `Offline — changes saved locally${pending ? ` (${pending} pending)` : ''} · AI paused`
    : pending
      ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…`
      : 'Working from local copy — reconnecting…'
  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 90,
        padding: '6px 16px',
        textAlign: 'center',
        fontSize: 'var(--fs-label)',
        background: 'var(--warn-soft)',
        color: 'var(--warn)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {msg}
    </div>
  )
}
