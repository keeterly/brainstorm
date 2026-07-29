// What the app has come to understand about you, across everything at once.
//
// It sits under the one action rather than above it — the thing to do now still
// comes first. It only speaks when it has something, and it says how long ago
// it looked, because a read on you that is a day old should admit it.
import { useEffect, useState } from 'react'
import { useGraph } from '@/store/graph'
import { humanDate } from '@/domain/human-date'
import { todayISO } from '@/domain/prioritize-prepass'
import { lookAgain, noticedIsStale, readNoticed, type Noticed } from './noticeFlow'

export function NoticedPanel({ openCount }: { openCount: number }) {
  const offline = useGraph((s) => s.offline)
  const thoughts = useGraph((s) => s.thoughts)
  const settings = useGraph((s) => s.profile?.settings)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const noticed = (settings?.noticed as Noticed | undefined) ?? readNoticed()
  const stale = noticedIsStale(noticed ?? null, openCount)

  // the first real read happens on its own, once there is enough to read
  useEffect(() => {
    if (offline || busy || openCount < 4 || !stale || noticed) return
    setBusy(true)
    void lookAgain().finally(() => setBusy(false))
    // deliberately only on mount: this is expensive and should not chase edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    if (busy || offline) return
    setBusy(true)
    await lookAgain()
    setBusy(false)
    setOpen(true)
  }

  if (!noticed && !busy) {
    if (openCount < 4 || offline) return null
    return (
      <div style={{ textAlign: 'center', marginTop: 'var(--sp-6)' }}>
        <button className="faint" style={{ fontSize: 'var(--fs-label)' }} onClick={refresh}>
          ▾ what do you notice?
        </button>
      </div>
    )
  }

  const title = (id?: string) => (id ? thoughts.find((t) => t.id === id)?.title : undefined)

  return (
    <div style={{ marginTop: 'var(--sp-6)' }}>
      <div style={{ textAlign: 'center' }}>
        <button
          className="faint"
          style={{ fontSize: 'var(--fs-label)' }}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {busy ? 'looking…' : open ? '▴ what I notice' : '▾ what I notice'}
        </button>
      </div>

      {open && noticed && (
        <div className="card" style={{ marginTop: 12 }}>
          {noticed.read && <p style={{ marginBottom: noticed.pressing.length ? 14 : 0 }}>{noticed.read}</p>}

          {noticed.pressing.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                About to bite
              </div>
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {noticed.pressing.map((p) => (
                  <div key={p.id} style={{ fontSize: 'var(--fs-label)' }}>
                    <strong>{title(p.id) ?? '—'}</strong>
                    <span className="muted"> — {p.why}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {noticed.suggestions.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Worth doing
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {noticed.suggestions.map((g, i) => (
                  <div key={i} style={{ fontSize: 'var(--fs-label)' }}>
                    <strong>{g.title}</strong>
                    <span className="muted"> — {g.why}</span>
                    {g.from && title(g.from) && (
                      <div className="faint" style={{ fontSize: 'var(--fs-caption)', marginTop: 2 }}>
                        from “{title(g.from)}”
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 16,
            }}
          >
            <span className="faint" style={{ fontSize: 'var(--fs-caption)' }}>
              {stale ? 'this has gone stale' : `looked ${humanDate(noticed.atISO.slice(0, 10), todayISO())}`}
            </span>
            <button className="btn btn--ghost btn--sm" onClick={refresh} disabled={busy || offline}>
              {busy ? 'looking…' : 'look again'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
