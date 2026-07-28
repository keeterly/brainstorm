// The Current — one meaningful action, large. Everything else stays folded
// until asked for. Never a task list first.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { prioritizePrepass, todayISO } from '@/domain/prioritize-prepass'
import { useAction } from '@/ai/useAction'
import type { PrioritizeOutput } from '@shared/ai/actions/prioritize'
import { evaporateAt } from '@/world/Atmosphere'
import { FocusOverlay } from './FocusOverlay'
import type { Thought } from '@/domain/types'

export default function CurrentPage() {
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
  const [focusId, setFocusId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const today = todayISO()
  const prepass = useMemo(
    () => prioritizePrepass(thoughts, relationships, today),
    [thoughts, relationships, today],
  )

  const goalTitle = useMemo(() => {
    const partOf = new Map(
      relationships.filter((r) => r.type === 'part_of').map((r) => [r.from_id, r.to_id]),
    )
    const byId = new Map(thoughts.map((t) => [t.id, t]))
    return (t: Thought) => {
      const g = partOf.get(t.id)
      return g ? (byId.get(g)?.title ?? null) : null
    }
  }, [relationships, thoughts])

  // Exactly one primary action; the rest wait behind a fold.
  const rec = profile?.settings.recommended_action
  const recThought = rec ? prepass.visible.find((t) => t.id === rec.id) : null
  const flow = prepass.visible.filter((t) => {
    const b = prepass.buckets.get(t.id)
    return b === 'now' || b === 'next'
  })
  const primary = recThought ?? flow[0] ?? prepass.visible[0] ?? null
  const primaryWhy = recThought && rec
    ? rec.why
    : primary?.due_date
      ? `Due ${primary.due_date <= today ? 'now' : primary.due_date} — the water goes here first.`
      : primary
        ? 'The oldest thing waiting — a place to start.'
        : ''
  const rest = flow.filter((t) => t.id !== primary?.id)
  const elsewhere = prepass.visible.length - (primary ? 1 : 0) - rest.length

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
    if ((profile?.settings.autonomy ?? 'suggest') === 'organize') apply(out)
    else setSuggestion(out)
  }
  function apply(out: PrioritizeOutput) {
    const ids = new Set(prepass.visible.map((t) => t.id))
    for (const b of out.buckets) if (ids.has(b.id)) setBucket(b.id, b.bucket)
    if (ids.has(out.recommended.id)) {
      updateProfileSettings({
        recommended_action: { id: out.recommended.id, why: out.recommended.why, at: new Date().toISOString() },
      })
    }
    setSuggestion(null)
  }

  const focusThought = focusId ? thoughts.find((t) => t.id === focusId) : null
  const complete = (t: Thought) => {
    toggleDone(t.id)
    evaporateAt()
    if (rec?.id === t.id) updateProfileSettings({ recommended_action: null })
  }

  return (
    <div className="page" style={{ paddingTop: 'calc(var(--sat) + 12vh)' }}>
      {prepass.visible.length === 0 && (
        <>
          <h1 className="page-title">The current is still</h1>
          <p className="faint">When a cloud rains, its actions flow here — one at a time.</p>
        </>
      )}

      {suggestion && (
        <div className="card" style={{ borderColor: 'rgba(122,215,255,0.4)', marginBottom: 'var(--sp-4)' }}>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
            First: <strong>{thoughts.find((t) => t.id === suggestion.recommended.id)?.title ?? '—'}</strong> —{' '}
            {suggestion.recommended.why}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--accent btn--sm" onClick={() => apply(suggestion)}>
              Let it flow
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setSuggestion(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {primary && !suggestion && (
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-6)' }}>
          <div className="eyebrow" style={{ color: 'var(--water)', marginBottom: 14 }}>
            This first
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 300,
              lineHeight: 1.45,
              letterSpacing: '-0.01em',
              maxWidth: 340,
              margin: '0 auto',
              textWrap: 'balance',
            }}
          >
            {primary.title || primary.raw_content}
          </div>
          <p className="faint" style={{ fontSize: 'var(--fs-label)', marginTop: 10 }}>
            {primaryWhy}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
            <button className="btn btn--primary" onClick={() => setFocusId(primary.id)}>
              ▸ Focus
            </button>
            <button className="btn btn--ghost" onClick={() => complete(primary)}>
              ✓ Done
            </button>
          </div>
        </div>
      )}

      {ai.status === 'error' && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)', textAlign: 'center', marginBottom: 12 }}>
          {ai.error}{' '}
          <button style={{ textDecoration: 'underline', color: 'inherit' }} onClick={ai.retry}>
            retry
          </button>
        </p>
      )}

      {rest.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <button className="faint" style={{ fontSize: 'var(--fs-label)' }} onClick={() => setShowAll((s) => !s)}>
            {showAll ? '▴ fold the current' : `▾ ${rest.length} more in the current`}
          </button>
          {showAll && (
            <div style={{ display: 'grid', gap: 6, marginTop: 14, textAlign: 'left' }}>
              {rest.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    border: '0.5px solid var(--glass-line)',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--glass)',
                  }}
                >
                  <button
                    aria-label="Complete"
                    onClick={() => complete(t)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: '1.5px solid rgba(255,255,255,0.3)',
                      flexShrink: 0,
                    }}
                  />
                  <button onClick={() => setFocusId(t.id)} style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{t.title || t.raw_content.slice(0, 120)}</div>
                    {(goalTitle(t) || t.due_date) && (
                      <div className="mono faint" style={{ fontSize: 'var(--fs-caption)', marginTop: 2 }}>
                        {[goalTitle(t), t.due_date ? `due ${t.due_date}` : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                  <button
                    aria-label="Snooze one week"
                    className="faint"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + 7)
                      updateThought(t.id, { snooze_until: d.toISOString().slice(0, 10) })
                    }}
                    style={{ padding: '0 4px' }}
                  >
                    ⏾
                  </button>
                </div>
              ))}
            </div>
          )}
          {showAll && prepass.visible.length > 2 && !offline && (
            <button
              className="chip chip--ai"
              style={{ marginTop: 14 }}
              onClick={decideFirst}
              disabled={ai.status === 'running'}
            >
              {ai.status === 'running' ? 'deciding…' : '✦ decide what flows first'}
            </button>
          )}
        </div>
      )}

      {elsewhere > 0 && (
        <p className="faint" style={{ fontSize: 'var(--fs-caption)', textAlign: 'center', marginTop: 'var(--sp-5)' }}>
          {elsewhere} more wait{elsewhere === 1 ? 's' : ''} in{' '}
          <button style={{ textDecoration: 'underline', color: 'inherit' }} onClick={() => navigate('/think')}>
            the world
          </button>
        </p>
      )}

      {focusThought && (
        <FocusOverlay
          thought={focusThought}
          from={goalTitle(focusThought)}
          onDone={() => {
            complete(focusThought)
            setFocusId(null)
          }}
          onClose={() => setFocusId(null)}
        />
      )}
    </div>
  )
}
