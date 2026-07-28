import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { prioritizePrepass, todayISO } from '@/domain/prioritize-prepass'
import { useAction } from '@/ai/useAction'
import type { PrioritizeOutput } from '@shared/ai/actions/prioritize'
import type { Bucket, Thought } from '@/domain/types'

const LANES: { key: Bucket; label: string; hint: string }[] = [
  { key: 'now', label: 'Now', hint: 'Today' },
  { key: 'next', label: 'Next', hint: 'This week' },
  { key: 'later', label: 'Later', hint: 'Someday soon' },
  { key: 'waiting', label: 'Waiting', hint: 'Blocked / external' },
]

export default function FocusPage() {
  const navigate = useNavigate()
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const profile = useGraph((s) => s.profile)
  const offline = useGraph((s) => s.offline)
  const toggleDone = useGraph((s) => s.toggleDone)
  const setBucket = useGraph((s) => s.setBucket)
  const updateThought = useGraph((s) => s.updateThought)
  const updateProfileSettings = useGraph((s) => s.updateProfileSettings)

  const ai = useAction<PrioritizeOutput>('prioritize')
  const [suggestion, setSuggestion] = useState<PrioritizeOutput | null>(null)

  const today = todayISO()
  const prepass = useMemo(
    () => prioritizePrepass(thoughts, relationships, today),
    [thoughts, relationships, today],
  )

  const byLane = useMemo(() => {
    const m = new Map<Bucket, Thought[]>(LANES.map((l) => [l.key, []]))
    for (const t of prepass.visible) {
      const b = prepass.buckets.get(t.id) ?? 'later'
      m.get(b)!.push(t)
    }
    return m
  }, [prepass])

  const goalTitle = useMemo(() => {
    const partOf = new Map(
      relationships.filter((r) => r.type === 'part_of').map((r) => [r.from_id, r.to_id]),
    )
    const byId = new Map(thoughts.map((t) => [t.id, t]))
    return (t: Thought) => {
      const gid = partOf.get(t.id)
      const g = gid ? byId.get(gid) : null
      return g?.title ?? null
    }
  }, [relationships, thoughts])

  async function decideFirst() {
    const candidates = prepass.visible.slice(0, 80).map((t) => ({
      id: t.id,
      title: t.title || t.raw_content.slice(0, 120),
      effort: t.effort,
      due: t.due_date,
      ageDays: Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000),
      blocked: prepass.blocked.has(t.id),
      goalTitle: goalTitle(t),
    }))
    if (!candidates.length) return
    const out = await ai.run({ actions: candidates })
    if (!out) return
    const autonomy = profile?.settings.autonomy ?? 'suggest'
    if (autonomy === 'organize') applyPrioritization(out)
    else setSuggestion(out)
  }

  function applyPrioritization(out: PrioritizeOutput) {
    const ids = new Set(prepass.visible.map((t) => t.id))
    for (const b of out.buckets) {
      if (ids.has(b.id)) setBucket(b.id, b.bucket)
    }
    if (ids.has(out.recommended.id)) {
      updateProfileSettings({
        recommended_action: { id: out.recommended.id, why: out.recommended.why, at: new Date().toISOString() },
      })
    }
    setSuggestion(null)
  }

  const rec = profile?.settings.recommended_action
  const recThought = rec ? thoughts.find((t) => t.id === rec.id && t.status === 'open') : null

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 className="page-title">Focus</h1>
        <button
          className="btn btn--sm btn--ghost"
          onClick={decideFirst}
          disabled={ai.status === 'running' || offline || prepass.visible.length === 0}
        >
          {ai.status === 'running' ? 'Thinking…' : '✦ Decide what’s first'}
        </button>
      </div>

      {ai.status === 'error' && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 'var(--sp-4)' }}>
          <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)' }}>{ai.error}</p>
          <button className="btn btn--sm btn--ghost" onClick={ai.retry} style={{ marginTop: 8 }}>
            Retry
          </button>
        </div>
      )}

      {suggestion && (
        <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 'var(--sp-4)' }}>
          <div className="mono" style={{ color: 'var(--accent-ink)', marginBottom: 6 }}>
            SUGGESTED ORDER
          </div>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
            Recommended first: <strong>{thoughts.find((t) => t.id === suggestion.recommended.id)?.title ?? '—'}</strong>{' '}
            — {suggestion.recommended.why}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--accent btn--sm" onClick={() => applyPrioritization(suggestion)}>
              Apply
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setSuggestion(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {recThought && rec && !suggestion && (
        <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 'var(--sp-4)' }}>
          <div className="mono" style={{ color: 'var(--accent-ink)', marginBottom: 4 }}>
            DO THIS FIRST
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{recThought.title || recThought.raw_content}</div>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>{rec.why}</p>
          <button className="btn btn--primary btn--sm" onClick={() => toggleDone(recThought.id)}>
            ✓ Done
          </button>
        </div>
      )}

      {prepass.visible.length === 0 && (
        <p className="faint">
          No open actions yet. Capture thoughts, turn one into a goal, and its steps land here.
        </p>
      )}

      {LANES.map((lane) => {
        const items = byLane.get(lane.key) ?? []
        if (!items.length) return null
        return (
          <section key={lane.key} style={{ marginBottom: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
              <h2 style={{ fontSize: 'var(--fs-md)' }}>{lane.label}</h2>
              <span className="faint" style={{ fontSize: 'var(--fs-caption)' }}>{lane.hint}</span>
              <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>{items.length}</span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {items.map((t) => (
                <FocusRow
                  key={t.id}
                  t={t}
                  lane={lane.key}
                  blocked={prepass.blocked.has(t.id)}
                  onOpen={() => navigate(`/thought/${t.id}`)}
                  onDone={() => toggleDone(t.id)}
                  onMove={(b) => setBucket(t.id, b)}
                  onSnooze={() => {
                    const d = new Date()
                    d.setDate(d.getDate() + 7)
                    updateThought(t.id, { snooze_until: d.toISOString().slice(0, 10) })
                  }}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function FocusRow({
  t,
  lane,
  blocked,
  onOpen,
  onDone,
  onMove,
  onSnooze,
}: {
  t: Thought
  lane: Bucket
  blocked: boolean
  onOpen: () => void
  onDone: () => void
  onMove: (b: Bucket) => void
  onSnooze: () => void
}) {
  const [menu, setMenu] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)',
        background: 'var(--bg-raised)',
      }}
    >
      <button
        aria-label="Complete"
        onClick={onDone}
        style={{
          width: 22,
          height: 22,
          marginTop: 1,
          borderRadius: '50%',
          border: '1.5px solid var(--line-mid)',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <button onClick={onOpen} style={{ textAlign: 'left', width: '100%' }}>
          <div style={{ fontWeight: 500 }}>{t.title || t.raw_content.slice(0, 120)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            {t.due_date && (
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-caption)',
                  color: t.due_date <= todayISO() ? 'var(--danger)' : 'var(--ink-faint)',
                }}
              >
                due {t.due_date}
              </span>
            )}
            {t.effort != null && (
              <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>
                effort {t.effort}/5
              </span>
            )}
            {blocked && (
              <span className="mono" style={{ fontSize: 'var(--fs-caption)', color: 'var(--warn)' }}>
                blocked
              </span>
            )}
          </div>
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <button aria-label="More" className="faint" onClick={() => setMenu((m) => !m)} style={{ padding: '0 6px' }}>
          ⋯
        </button>
        {menu && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 24,
              zIndex: 50,
              background: 'var(--bg-raised)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-pop)',
              display: 'grid',
              minWidth: 140,
            }}
          >
            {(['now', 'next', 'later', 'waiting'] as Bucket[])
              .filter((b) => b !== lane)
              .map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    onMove(b)
                    setMenu(false)
                  }}
                  style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--fs-label)' }}
                >
                  Move to {b}
                </button>
              ))}
            <button
              onClick={() => {
                onSnooze()
                setMenu(false)
              }}
              style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--fs-label)', borderTop: '1px solid var(--line)' }}
            >
              Snooze 1 week
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
