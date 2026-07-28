import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { useAction } from '@/ai/useAction'
import { TypeBadge } from '@/components/TypeBadge'
import { Sheet } from '@/components/Sheet'
import { THOUGHT_TYPES, REL_TYPES, type RelType, type Thought, type ThoughtType } from '@/domain/types'
import type { FindRelatedOutput } from '@shared/ai/actions/find-related'
import type { ToGoalOutput } from '@shared/ai/actions/to-goal'
import type { ClarifyOutput } from '@shared/ai/actions/clarify-question'
import { RoadmapSection } from '@/features/roadmap/RoadmapSection'

export default function ThoughtPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const artifacts = useGraph((s) => s.artifacts)
  const offline = useGraph((s) => s.offline)
  const updateThought = useGraph((s) => s.updateThought)
  const deleteThought = useGraph((s) => s.deleteThought)
  const toggleDone = useGraph((s) => s.toggleDone)
  const addThought = useGraph((s) => s.addThought)
  const addRelationship = useGraph((s) => s.addRelationship)
  const updateRelationship = useGraph((s) => s.updateRelationship)
  const deleteRelationship = useGraph((s) => s.deleteRelationship)

  const t = thoughts.find((x) => x.id === id)

  const [panel, setPanel] = useState(false)
  const [typePick, setTypePick] = useState(false)
  const [linkPick, setLinkPick] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const related = useAction<FindRelatedOutput>('find_related')
  const toGoal = useAction<ToGoalOutput>('to_goal')
  const clarify = useAction<ClarifyOutput>('clarify_question')

  const edges = useMemo(() => {
    if (!t) return []
    return relationships
      .filter((r) => r.from_id === t.id || r.to_id === t.id)
      .map((r) => {
        const otherId = r.from_id === t.id ? r.to_id : r.from_id
        const other = thoughts.find((x) => x.id === otherId)
        return other ? { r, other, outgoing: r.from_id === t.id } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
  }, [relationships, thoughts, t])

  const children = useMemo(
    () =>
      edges
        .filter((e) => !e.outgoing && e.r.type === 'part_of')
        .map((e) => e.other)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [edges],
  )

  const myArtifacts = useMemo(() => artifacts.filter((a) => a.thought_id === t?.id), [artifacts, t])

  if (!t) {
    return (
      <div className="page">
        <p className="muted">Thought not found.</p>
        <Link to="/">Back to capture</Link>
      </div>
    )
  }

  async function runFindRelated() {
    const candidates = thoughts
      .filter((x) => x.id !== t!.id && x.status !== 'archived')
      .slice(0, 200)
      .map((x) => ({ id: x.id, title: x.title || x.raw_content.slice(0, 100), type: x.type, summary: x.summary }))
    if (!candidates.length) return
    await related.run({
      subject: { id: t!.id, title: t!.title || t!.raw_content.slice(0, 100), type: t!.type, summary: t!.summary },
      candidates,
    })
  }

  async function runToGoal() {
    const out = await toGoal.run({ raw_content: t!.raw_content, title: t!.title ?? undefined })
    if (!out) return
    updateThought(t!.id, {
      type: 'goal',
      title: out.title,
      extra: { ...t!.extra, successCriteria: out.successCriteria },
    })
    for (const a of out.firstActions) {
      const child = addThought({ raw_content: a.title, title: a.title, type: 'action', effort: a.effort, source: 'ai' })
      addRelationship(child.id, t!.id, 'part_of', 'ai')
    }
    setPanel(false)
  }

  const successCriteria = (t.extra?.successCriteria as string[] | undefined) ?? []

  return (
    <div className="page">
      <button className="faint" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
        ← Back
      </button>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <button onClick={() => setTypePick(true)}>
          <TypeBadge type={t.type} ai={t.confidence != null} />
        </button>
        <select
          aria-label="Status"
          value={t.status}
          onChange={(e) => updateThought(t.id, { status: e.target.value as Thought['status'] })}
          style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '2px 6px', fontSize: 'var(--fs-label)', background: 'var(--bg-raised)' }}
        >
          <option value="open">open</option>
          <option value="done">done</option>
          <option value="snoozed">snoozed</option>
          <option value="archived">archived</option>
        </select>
        <input
          type="date"
          aria-label="Due date"
          value={t.due_date ?? ''}
          onChange={(e) => updateThought(t.id, { due_date: e.target.value || null })}
          style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '2px 6px', fontSize: 'var(--fs-label)', background: 'var(--bg-raised)' }}
        />
      </div>

      <h1 style={{ fontSize: 'var(--fs-lg)', marginBottom: 8 }}>{t.title || t.raw_content.slice(0, 100)}</h1>
      {t.summary && t.summary !== t.title && <p className="muted" style={{ marginBottom: 12 }}>{t.summary}</p>}

      {editing ? (
        <div style={{ marginBottom: 16 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            style={{ width: '100%', padding: 12, border: '1px solid var(--line-mid)', borderRadius: 'var(--r-md)', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => {
                updateThought(t.id, { raw_content: draft })
                setEditing(false)
              }}
            >
              Save
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setDraft(t.raw_content)
            setEditing(true)
          }}
          style={{ textAlign: 'left', width: '100%', marginBottom: 16 }}
        >
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-soft)' }}>{t.raw_content}</p>
          <span className="faint" style={{ fontSize: 'var(--fs-caption)' }}>tap to edit</span>
        </button>
      )}

      {successCriteria.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="mono faint" style={{ marginBottom: 6 }}>SUCCESS LOOKS LIKE</div>
          {successCriteria.map((s, i) => (
            <div key={i} style={{ fontSize: 'var(--fs-label)', marginBottom: 4 }}>· {s}</div>
          ))}
        </div>
      )}

      {t.type === 'goal' && children.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Steps</h2>
          <div style={{ display: 'grid', gap: 6 }}>
            {children.map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-raised)' }}>
                <button
                  aria-label={c.status === 'done' ? 'Mark open' : 'Complete'}
                  onClick={() => toggleDone(c.id)}
                  style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid var(--line-mid)', background: c.status === 'done' ? 'var(--ink)' : 'transparent', flexShrink: 0 }}
                />
                <Link to={`/thought/${c.id}`} style={{ textDecoration: c.status === 'done' ? 'line-through' : 'none', flex: 1, color: c.status === 'done' ? 'var(--ink-faint)' : 'var(--ink)' }}>
                  {c.title || c.raw_content.slice(0, 100)}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {t.type === 'goal' && <RoadmapSection goal={t} />}

      <section style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <h2 style={{ fontSize: 'var(--fs-md)' }}>Connections</h2>
          <button className="btn btn--sm btn--ghost" onClick={() => setLinkPick(true)}>+ Link</button>
        </div>
        {edges.length === 0 && <p className="faint" style={{ fontSize: 'var(--fs-label)' }}>No connections yet.</p>}
        <div style={{ display: 'grid', gap: 6 }}>
          {edges.map(({ r, other, outgoing }) => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-raised)' }}>
              <select
                aria-label="Relationship type"
                value={r.type}
                onChange={(e) => updateRelationship(r.id, e.target.value as RelType)}
                className="mono"
                style={{ fontSize: 'var(--fs-caption)', border: 'none', background: 'transparent', color: r.created_by === 'ai' ? 'var(--accent-ink)' : 'var(--ink-faint)' }}
              >
                {REL_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {outgoing ? rt : `← ${rt}`}
                  </option>
                ))}
              </select>
              <Link to={`/thought/${other.id}`} style={{ flex: 1, fontSize: 'var(--fs-label)' }}>
                {other.title || other.raw_content.slice(0, 80)}
              </Link>
              <button aria-label="Remove connection" className="faint" onClick={() => deleteRelationship(r.id)}>×</button>
            </div>
          ))}
        </div>
        {related.output && related.output.related.length > 0 && (
          <div className="card" style={{ marginTop: 8, borderColor: 'var(--accent)' }}>
            <div className="mono" style={{ color: 'var(--accent-ink)', marginBottom: 6 }}>SUGGESTED CONNECTIONS</div>
            {related.output.related.map((s) => {
              const other = thoughts.find((x) => x.id === s.id)
              if (!other) return null
              return (
                <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: 'var(--fs-label)' }}>
                    <span className="mono faint">{s.relType}</span> {other.title || other.raw_content.slice(0, 60)}
                    <div className="faint" style={{ fontSize: 'var(--fs-caption)' }}>{s.reason}</div>
                  </div>
                  <button
                    className="btn btn--sm btn--ghost"
                    onClick={() => addRelationship(t.id, s.id, s.relType, 'ai')}
                  >
                    Add
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {myArtifacts.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Research</h2>
          {myArtifacts.map((a) => (
            <details key={a.id} className="card" style={{ marginBottom: 8 }}>
              <summary style={{ fontWeight: 600, cursor: 'pointer' }}>{a.title}</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'var(--fs-label)', marginTop: 8 }}>{a.content_md}</pre>
            </details>
          ))}
        </section>
      )}

      {clarify.output && (
        <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 16 }}>
          <div className="mono" style={{ color: 'var(--accent-ink)', marginBottom: 4 }}>ONE QUESTION</div>
          <p style={{ fontWeight: 600 }}>{clarify.output.question}</p>
          <p className="faint" style={{ fontSize: 'var(--fs-caption)', marginTop: 4 }}>{clarify.output.why}</p>
        </div>
      )}

      {(related.status === 'error' || toGoal.status === 'error' || clarify.status === 'error') && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 16 }}>
          <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)' }}>
            {related.error || toGoal.error || clarify.error}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn--accent" onClick={() => setPanel(true)} disabled={offline}>
          ✦ AI actions
        </button>
        <button className="btn btn--ghost" onClick={() => toggleDone(t.id)}>
          {t.status === 'done' ? 'Reopen' : '✓ Done'}
        </button>
        <button
          className="btn btn--danger"
          onClick={() => {
            if (confirm('Delete this thought and its connections?')) {
              deleteThought(t.id)
              navigate('/')
            }
          }}
        >
          Delete
        </button>
      </div>

      <Sheet open={panel} onClose={() => setPanel(false)} title="What should happen with this?">
        <div style={{ display: 'grid', gap: 8 }}>
          <button
            className="btn"
            disabled={related.status === 'running'}
            onClick={() => {
              void runFindRelated()
              setPanel(false)
            }}
          >
            {related.status === 'running' ? 'Finding…' : '🕸 Find connections'}
          </button>
          {t.type !== 'goal' && (
            <button className="btn" disabled={toGoal.status === 'running'} onClick={runToGoal}>
              {toGoal.status === 'running' ? 'Working…' : '◎ Turn into a goal'}
            </button>
          )}
          <button
            className="btn"
            disabled={clarify.status === 'running'}
            onClick={() => {
              void clarify.run({ raw_content: t.raw_content })
              setPanel(false)
            }}
          >
            ? Ask me one question
          </button>
          <p className="faint" style={{ fontSize: 'var(--fs-caption)' }}>
            Results become structured objects on this thought — nothing is lost in a chat.
          </p>
        </div>
      </Sheet>

      <Sheet open={typePick} onClose={() => setTypePick(false)} title="Change type">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {THOUGHT_TYPES.map((ty) => (
            <button
              key={ty}
              onClick={() => {
                updateThought(t.id, { type: ty as ThoughtType, confidence: null })
                setTypePick(false)
              }}
            >
              <TypeBadge type={ty as ThoughtType} />
            </button>
          ))}
        </div>
      </Sheet>

      <LinkPicker
        open={linkPick}
        onClose={() => setLinkPick(false)}
        exclude={t.id}
        onPick={(otherId, type) => {
          addRelationship(t.id, otherId, type)
          setLinkPick(false)
        }}
      />
    </div>
  )
}

function LinkPicker({
  open,
  onClose,
  exclude,
  onPick,
}: {
  open: boolean
  onClose: () => void
  exclude: string
  onPick: (id: string, type: RelType) => void
}) {
  const thoughts = useGraph((s) => s.thoughts)
  const [q, setQ] = useState('')
  const [type, setType] = useState<RelType>('relates_to')
  const matches = thoughts
    .filter((t) => t.id !== exclude && t.status !== 'archived')
    .filter((t) => !q || (t.title || t.raw_content).toLowerCase().includes(q.toLowerCase()))
    .slice(0, 20)
  return (
    <Sheet open={open} onClose={onClose} title="Connect to…">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Search thoughts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minHeight: 40, padding: '0 12px', border: '1px solid var(--line-mid)', borderRadius: 'var(--r-md)' }}
        />
        <select
          aria-label="Relationship type"
          value={type}
          onChange={(e) => setType(e.target.value as RelType)}
          className="mono"
          style={{ border: '1px solid var(--line-mid)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-caption)' }}
        >
          {REL_TYPES.map((rt) => (
            <option key={rt} value={rt}>{rt}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {matches.map((m) => (
          <button
            key={m.id}
            className="btn btn--ghost"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => onPick(m.id, type)}
          >
            {m.title || m.raw_content.slice(0, 80)}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
