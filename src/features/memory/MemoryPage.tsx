// Memory — everything the water keeps: the ocean of finished work, the
// editable facts the AI knows about you, and the app's few quiet controls.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useGraph } from '@/store/graph'
import { useAction } from '@/ai/useAction'
import type { DistillOutput } from '@shared/ai/actions/distill-memory'
import { exportMarkdown } from '@/domain/export-markdown'
import { clearSnapshot } from '@/lib/idb'
import { TypeBadge } from '@/components/TypeBadge'

export default function MemoryPage() {
  const profile = useGraph((s) => s.profile)
  const memories = useGraph((s) => s.memories)
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const roadmaps = useGraph((s) => s.roadmaps)
  const offline = useGraph((s) => s.offline)
  const addMemory = useGraph((s) => s.addMemory)
  const updateMemory = useGraph((s) => s.updateMemory)
  const deleteMemory = useGraph((s) => s.deleteMemory)
  const updateProfileSettings = useGraph((s) => s.updateProfileSettings)
  const toggleDone = useGraph((s) => s.toggleDone)

  const [newMem, setNewMem] = useState('')
  const [distillText, setDistillText] = useState('')
  const [spend, setSpend] = useState<number | null>(null)
  const distill = useAction<DistillOutput>('distill_memory')

  const autonomy = profile?.settings.autonomy ?? 'suggest'
  const ocean = thoughts
    .filter((t) => t.status === 'done')
    .sort((a, b) => ((a.completed_at ?? '') < (b.completed_at ?? '') ? 1 : -1))
    .slice(0, 30)

  useEffect(() => {
    const since = new Date()
    since.setDate(1)
    since.setHours(0, 0, 0, 0)
    void supabase
      .from('agent_runs')
      .select('cost_usd')
      .gte('created_at', since.toISOString())
      .then(({ data }) => {
        if (data) setSpend(data.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0))
      })
  }, [])

  async function runDistill() {
    const out = await distill.run({
      text: distillText,
      existing: memories.map((m) => m.content).slice(0, 100),
    })
    if (!out) return
    for (const f of out.facts) addMemory(f, 'distilled')
    setDistillText('')
  }

  function download() {
    const md = exportMarkdown({ thoughts, relationships, roadmaps, memories })
    const blob = new Blob([md], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `brainstorm-export-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="page">
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        Memory
      </div>
      <h1 className="page-title">What the water keeps</h1>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Known about you</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
          Fully yours — edit or delete anything. It shapes every AI suggestion.
        </p>
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {memories.map((m) => (
            <MemoryRow
              key={m.id}
              content={m.content}
              source={m.source}
              onSave={(v) => updateMemory(m.id, v)}
              onDelete={() => deleteMemory(m.id)}
            />
          ))}
          {memories.length === 0 && (
            <p className="faint" style={{ fontSize: 'var(--fs-label)' }}>
              Nothing remembered yet.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            placeholder="Add a fact, preference, or constraint…"
            value={newMem}
            onChange={(e) => setNewMem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newMem.trim()) {
                addMemory(newMem.trim())
                setNewMem('')
              }
            }}
            style={inputStyle}
          />
          <button
            className="btn btn--sm"
            disabled={!newMem.trim()}
            onClick={() => {
              addMemory(newMem.trim())
              setNewMem('')
            }}
          >
            Add
          </button>
        </div>
        <details>
          <summary className="muted" style={{ fontSize: 'var(--fs-label)', cursor: 'pointer' }}>
            Paste anything → distill into memory
          </summary>
          <textarea
            value={distillText}
            onChange={(e) => setDistillText(e.target.value)}
            rows={4}
            placeholder="Paste notes, an email, a bio — durable facts are extracted for your review."
            style={{ ...inputStyle, width: '100%', marginTop: 8, padding: 12, resize: 'vertical', minHeight: 90 }}
          />
          <button
            className="btn btn--sm btn--accent"
            style={{ marginTop: 8 }}
            disabled={!distillText.trim() || distill.status === 'running' || offline}
            onClick={runDistill}
          >
            {distill.status === 'running' ? 'Distilling…' : '✦ Distill'}
          </button>
          {distill.status === 'error' && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)', marginTop: 8 }}>{distill.error}</p>
          )}
        </details>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>The ocean</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
          Finished work settles here. Tap to reopen.
        </p>
        {ocean.length === 0 && (
          <p className="faint" style={{ fontSize: 'var(--fs-label)' }}>
            Still empty — completed thoughts will collect below.
          </p>
        )}
        <div style={{ display: 'grid', gap: 6 }}>
          {ocean.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                aria-label="Reopen"
                onClick={() => toggleDone(t.id)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'var(--ok)',
                  flexShrink: 0,
                  opacity: 0.7,
                }}
              />
              <Link
                to={`/thought/${t.id}`}
                style={{
                  flex: 1,
                  fontSize: 'var(--fs-label)',
                  color: 'var(--ink-soft)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.title || t.raw_content.slice(0, 80)}
              </Link>
              <TypeBadge type={t.type} />
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>How much the AI does</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`chip ${autonomy === 'suggest' ? 'chip--on' : ''}`}
            onClick={() => updateProfileSettings({ autonomy: 'suggest' })}
          >
            Suggest only
          </button>
          <button
            className={`chip ${autonomy === 'organize' ? 'chip--on' : ''}`}
            onClick={() => updateProfileSettings({ autonomy: 'organize' })}
          >
            Organize automatically
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Data</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn btn--ghost" onClick={download}>
            ⬇ Export everything as Markdown
          </button>
          <Link to="/import" className="btn btn--ghost" style={{ textDecoration: 'none' }}>
            ⇪ Import from VENIA Brainstorm
          </Link>
          <Link to="/runs" className="btn btn--ghost" style={{ textDecoration: 'none' }}>
            ⚙ AI activity{' '}
            {spend != null && <span className="mono faint">(${spend.toFixed(2)} this month)</span>}
          </Link>
        </div>
      </section>

      <button
        className="btn btn--danger"
        onClick={async () => {
          await clearSnapshot()
          await supabase.auth.signOut()
        }}
      >
        Sign out
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 40,
  padding: '0 12px',
  border: '0.5px solid rgba(255,255,255,0.22)',
  borderRadius: 'var(--r-md)',
  background: 'rgba(255,255,255,0.05)',
  color: 'var(--ink)',
}

function MemoryRow({
  content,
  source,
  onSave,
  onDelete,
}: {
  content: string
  source: string
  onSave: (v: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(content)
  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={v} onChange={(e) => setV(e.target.value)} style={inputStyle} />
        <button
          className="btn btn--sm"
          onClick={() => {
            onSave(v)
            setEditing(false)
          }}
        >
          Save
        </button>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button onClick={() => setEditing(true)} style={{ flex: 1, textAlign: 'left', fontSize: 'var(--fs-label)' }}>
        {content}
      </button>
      <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>
        {source}
      </span>
      <button aria-label="Delete memory" className="faint" onClick={onDelete}>
        ×
      </button>
    </div>
  )
}
