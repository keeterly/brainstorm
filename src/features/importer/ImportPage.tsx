import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useGraph } from '@/store/graph'
import { isLegacyBlob, mapLegacy, type MappedImport } from './mapLegacy'

// One-time import from the old VENIA OS Brainstorm. Primary path: paste or
// upload the venia_workspace.data JSON blob. Dry-run preview → chunked insert.
type Step = 'input' | 'preview' | 'running' | 'done' | 'error'

export default function ImportPage() {
  const navigate = useNavigate()
  const userId = useGraph((s) => s.userId)
  const hydrate = useGraph((s) => s.hydrate)

  const [raw, setRaw] = useState('')
  const [step, setStep] = useState<Step>('input')
  const [mapped, setMapped] = useState<MappedImport | null>(null)
  const [blob, setBlob] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [alreadyImported, setAlreadyImported] = useState(false)
  const [confirmRepeat, setConfirmRepeat] = useState(false)

  async function preview() {
    setError(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      setError('That is not valid JSON. Copy the whole value of venia_workspace.data (or an exported backup).')
      return
    }
    // Accept either the blob itself or the full row { id, data }.
    const candidate =
      isLegacyBlob(parsed) ? parsed
      : parsed && typeof parsed === 'object' && isLegacyBlob((parsed as { data?: unknown }).data)
        ? (parsed as { data: unknown }).data
        : null
    if (!candidate || !isLegacyBlob(candidate)) {
      setError('This JSON does not look like a VENIA workspace blob (no "dump" or "eniMemory" keys found).')
      return
    }
    const { count } = await supabase
      .from('import_archives')
      .select('id', { count: 'exact', head: true })
    setAlreadyImported((count ?? 0) > 0)
    setBlob(candidate)
    setMapped(mapLegacy(candidate, userId ?? ''))
    setStep('preview')
  }

  async function run() {
    if (!mapped || !userId) return
    setStep('running')
    try {
      const chunk = async (table: string, rows: unknown[], size = 400) => {
        for (let i = 0; i < rows.length; i += size) {
          setProgress(`${table}: ${Math.min(i + size, rows.length)}/${rows.length}`)
          const { error } = await supabase
            .from(table)
            .insert(rows.slice(i, i + size) as Record<string, unknown>[])
          if (error) throw new Error(`${table}: ${error.message}`)
        }
      }
      await chunk('thoughts', mapped.thoughts)
      await chunk('relationships', mapped.relationships)
      if (mapped.memories.length) await chunk('memories', mapped.memories)
      if (mapped.artifacts.length) await chunk('research_artifacts', mapped.artifacts)
      for (const l of mapped.layouts) {
        await supabase
          .from('layouts')
          .upsert({ user_id: userId, scope: l.scope, positions: l.positions, updated_at: new Date().toISOString() })
      }
      setProgress('archiving original blob')
      const { error: archErr } = await supabase
        .from('import_archives')
        .insert({ user_id: userId, blob: blob as Record<string, unknown> })
      if (archErr) throw new Error(`archive: ${archErr.message}`)
      await hydrate(userId)
      setStep('done')
    } catch (e) {
      setError(String((e as Error).message || e))
      setStep('error')
    }
  }

  const c = mapped?.counts

  return (
    <div className="page">
      <h1 className="page-title">Import from VENIA</h1>

      {step === 'input' && (
        <>
          <p className="muted" style={{ marginBottom: 16 }}>
            Bring your existing Brainstorm data over. Paste the JSON from your VENIA workspace
            (Supabase table <span className="mono">venia_workspace</span>, column{' '}
            <span className="mono">data</span>) or upload a backup file. Your old app is not
            touched.
          </p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            placeholder='{"dump":[...], "eniMemory":[...], ...}'
            className="mono"
            style={{ width: '100%', padding: 12, border: '1px solid var(--line-mid)', borderRadius: 'var(--r-md)', resize: 'vertical', fontSize: 'var(--fs-label)' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <label className="btn btn--ghost">
              Upload file
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  void f.text().then(setRaw)
                }}
              />
            </label>
            <button className="btn btn--primary" disabled={!raw.trim()} onClick={preview}>
              Preview import
            </button>
          </div>
          {error && <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>}
        </>
      )}

      {step === 'preview' && c && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 10 }}>Dry run — nothing written yet</h2>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
              <li>{c.goals} goals with {c.actions} steps</li>
              <li>{c.notes} notes</li>
              <li>{c.concepts} map themes, {c.ideas} map ideas</li>
              <li>{c.edges} connections</li>
              <li>{c.memories} memory facts</li>
              <li>{c.artifacts} research briefs</li>
              <li className="muted">Plans, schedules, board and settings are preserved in a raw archive.</li>
            </ul>
          </div>
          {alreadyImported && !confirmRepeat ? (
            <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: 16 }}>
              <p style={{ marginBottom: 10 }}>
                <strong>You've imported before.</strong> Importing again will duplicate thoughts.
              </p>
              <button className="btn btn--ghost" onClick={() => setConfirmRepeat(true)}>
                I understand — import anyway
              </button>
            </div>
          ) : (
            <button className="btn btn--primary" onClick={run}>
              Import {c.goals + c.notes + c.actions + c.concepts + c.ideas} thoughts
            </button>
          )}
          <button className="btn btn--ghost" style={{ marginLeft: 8 }} onClick={() => setStep('input')}>
            Back
          </button>
        </>
      )}

      {step === 'running' && (
        <div className="card ai-working" aria-busy="true">
          <p>Importing… {progress}</p>
        </div>
      )}

      {step === 'done' && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <p style={{ marginBottom: 12 }}>
            <strong>Done.</strong> Your brain is loaded — the original VENIA data was untouched, and
            a raw archive copy is stored for safekeeping.
          </p>
          <button className="btn btn--primary" onClick={() => navigate('/brain')}>
            Open the Visual Brain
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <p style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</p>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
            The import stopped partway. It is safe to fix the issue and run it again — already-imported
            rows may need cleanup first.
          </p>
          <button className="btn btn--ghost" onClick={() => setStep('preview')}>Back</button>
        </div>
      )}
    </div>
  )
}
