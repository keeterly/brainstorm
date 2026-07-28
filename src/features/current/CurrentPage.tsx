// The Current — today's flow, not a task list. One recommended action pinned;
// only Now and Next are visible. Everything else stays in the world.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { prioritizePrepass, todayISO } from '@/domain/prioritize-prepass'
import { useAction } from '@/ai/useAction'
import type { PrioritizeOutput } from '@shared/ai/actions/prioritize'
import { evaporateAt } from '@/world/Atmosphere'
import { FocusOverlay } from './FocusOverlay'
import type { Bucket, Thought } from '@/domain/types'

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

  const today = todayISO()
  const prepass = useMemo(
    () => prioritizePrepass(thoughts, relationships, today),
    [thoughts, relationships, today],
  )

  const lanes = useMemo(() => {
    const m = new Map<Bucket, Thought[]>([
      ['now', []],
      ['next', []],
      ['later', []],
      ['waiting', []],
    ])
    for (const t of prepass.visible) m.get(prepass.buckets.get(t.id) ?? 'later')!.push(t)
    return m
  }, [prepass])

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

  const rec = profile?.settings.recommended_action
  const recThought = rec ? thoughts.find((t) => t.id === rec.id && t.status === 'open') : null
  const focusThought = focusId ? thoughts.find((t) => t.id === focusId) : null
  const now = lanes.get('now')!
  const next = lanes.get('next')!
  const restCount = lanes.get('later')!.length + lanes.get('waiting')!.length

  const complete = (t: Thought) => {
    toggleDone(t.id)
    evaporateAt()
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Current
          </div>
          <h1 className="page-title">Today’s flow</h1>
        </div>
        <button
          className="btn btn--sm btn--ghost"
          onClick={decideFirst}
          disabled={ai.status === 'running' || offline || prepass.visible.length === 0}
        >
          {ai.status === 'running' ? 'Thinking…' : '✦ Decide'}
        </button>
      </div>

      {ai.status === 'error' && (
        <div className="card" style={{ borderColor: 'rgba(255,105,97,0.4)', marginBottom: 'var(--sp-4)' }}>
          <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)' }}>{ai.error}</p>
          <button className="btn btn--sm btn--ghost" onClick={ai.retry} style={{ marginTop: 8 }}>
            Retry
          </button>
        </div>
      )}

      {suggestion && (
        <div className="card" style={{ borderColor: 'rgba(122,215,255,0.4)', marginBottom: 'var(--sp-4)' }}>
          <div className="eyebrow" style={{ color: 'var(--water)', marginBottom: 6 }}>
            Suggested order
          </div>
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

      {recThought && rec && !suggestion && (
        <div className="card" style={{ borderColor: 'rgba(122,215,255,0.4)', marginBottom: 'var(--sp-5)' }}>
          <div className="eyebrow" style={{ color: 'var(--water)', marginBottom: 4 }}>
            This first
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{recThought.title || recThought.raw_content}</div>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>{rec.why}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--primary btn--sm" onClick={() => setFocusId(recThought.id)}>
              ▸ Focus
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => complete(recThought)}>
              ✓ Done
            </button>
          </div>
        </div>
      )}

      {prepass.visible.length === 0 && (
        <p className="faint">
          The current is still. Capture thoughts, let them condense, and rain will fill it.
        </p>
      )}

      {[
        { key: 'now' as const, label: 'Now', items: now },
        { key: 'next' as const, label: 'Next', items: next },
      ].map(
        (lane) =>
          lane.items.length > 0 && (
            <section key={lane.key} style={{ marginBottom: 'var(--sp-5)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
                <h2 style={{ fontSize: 'var(--fs-md)' }}>{lane.label}</h2>
                <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>
                  {lane.items.length}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {lane.items.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
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
                        width: 22,
                        height: 22,
                        marginTop: 1,
                        borderRadius: '50%',
                        border: '1.5px solid rgba(255,255,255,0.3)',
                        flexShrink: 0,
                      }}
                    />
                    <button onClick={() => setFocusId(t.id)} style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{t.title || t.raw_content.slice(0, 120)}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                        {goalTitle(t) && (
                          <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>
                            {goalTitle(t)}
                          </span>
                        )}
                        {t.due_date && (
                          <span
                            className="mono"
                            style={{
                              fontSize: 'var(--fs-caption)',
                              color: t.due_date <= today ? 'var(--danger)' : 'var(--ink-faint)',
                            }}
                          >
                            due {t.due_date}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      aria-label="Snooze one week"
                      className="faint"
                      onClick={() => {
                        const d = new Date()
                        d.setDate(d.getDate() + 7)
                        updateThought(t.id, { snooze_until: d.toISOString().slice(0, 10) })
                      }}
                      style={{ padding: '0 4px', fontSize: 'var(--fs-label)' }}
                    >
                      ⏾
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ),
      )}

      {restCount > 0 && (
        <p className="faint" style={{ fontSize: 'var(--fs-label)' }}>
          {restCount} more wait{restCount === 1 ? 's' : ''} in the world —{' '}
          <button style={{ textDecoration: 'underline', color: 'inherit' }} onClick={() => navigate('/think')}>
            open Think
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
