import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AgentRun } from '@/domain/types'

const STATUS_COLOR: Record<AgentRun['status'], string> = {
  running: 'var(--warn)',
  succeeded: 'var(--ok)',
  failed: 'var(--danger)',
  invalid_output: 'var(--danger)',
}

export default function RunsPage() {
  const [runs, setRuns] = useState<AgentRun[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('agent_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRuns((data ?? []) as AgentRun[])
      })
  }, [])

  return (
    <div className="page">
      <h1 className="page-title">AI activity</h1>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!runs && !error && <div className="skeleton" style={{ height: 200 }} />}
      {runs && runs.length === 0 && <p className="faint">No AI runs yet.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {runs?.map((r) => (
          <details key={r.id} className="card">
            <summary style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong className="mono" style={{ fontSize: 'var(--fs-label)' }}>{r.action}</strong>
              <span className="mono" style={{ fontSize: 'var(--fs-caption)', color: STATUS_COLOR[r.status] }}>
                {r.status}
              </span>
              <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>
                {new Date(r.created_at).toLocaleString()}
              </span>
              {r.cost_usd != null && (
                <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>
                  ${Number(r.cost_usd).toFixed(4)}
                </span>
              )}
              {r.latency_ms != null && (
                <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>{(r.latency_ms / 1000).toFixed(1)}s</span>
              )}
            </summary>
            {r.error && <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)', marginTop: 8 }}>{r.error}</p>}
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-caption)', marginTop: 8, overflow: 'auto', maxHeight: 240 }}>
              {JSON.stringify({ input: r.input, output: r.output }, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </div>
  )
}
