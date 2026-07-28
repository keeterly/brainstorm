import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useGraph } from '@/store/graph'
import { useAction } from '@/ai/useAction'
import type { DistillOutput } from '@shared/ai/actions/distill-memory'
import { exportMarkdown } from '@/domain/export-markdown'
import { clearSnapshot } from '@/lib/idb'

export default function SettingsPage() {
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

  const [newMem, setNewMem] = useState('')
  const [distillText, setDistillText] = useState('')
  const [spend, setSpend] = useState<number | null>(null)
  const distill = useAction<DistillOutput>('distill_memory')

  const autonomy = profile?.settings.autonomy ?? 'suggest'

  useEffect(() => {
    // This month's AI spend from agent_runs (best-effort).
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
      <h1 className="page-title">Settings</h1>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>AI autonomy</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
          How much should Brainstorm do on its own?
        </p>
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
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Memory</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
          Everything the AI knows about you long-term. Fully yours — edit or delete anything.
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
          {memories.length === 0 && <p className="faint" style={{ fontSize: 'var(--fs-label)' }}>Nothing remembered yet.</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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
            style={{ flex: 1, minHeight: 40, padding: '0 12px', border: '1px solid var(--line-mid)', borderRadius: 'var(--r-md)' }}
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
            placeholder="Paste notes, an email, a bio — the AI extracts durable facts for your review."
            style={{ width: '100%', marginTop: 8, padding: 12, border: '1px solid var(--line-mid)', borderRadius: 'var(--r-md)', resize: 'vertical' }}
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
        <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Data</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn btn--ghost" onClick={download}>⬇ Export everything as Markdown</button>
          <Link to="/import" className="btn btn--ghost" style={{ textDecoration: 'none' }}>
            ⇪ Import from VENIA Brainstorm
          </Link>
          <Link to="/runs" className="btn btn--ghost" style={{ textDecoration: 'none' }}>
            ⚙ AI activity {spend != null && <span className="mono faint">(${spend.toFixed(2)} this month)</span>}
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
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          style={{ flex: 1, minHeight: 36, padding: '0 10px', border: '1px solid var(--line-mid)', borderRadius: 'var(--r-sm)' }}
        />
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
      <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>{source}</span>
      <button aria-label="Delete memory" className="faint" onClick={onDelete}>×</button>
    </div>
  )
}
