import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DAILY_USD_CAP } from '@shared/ai/pricing'
import type { AgentRun } from '@/domain/types'

/**
 * What today has cost, out of what today is allowed to cost.
 *
 * The server meters in dollars and refuses at the cap; this is the same
 * arithmetic over rows already on the page, so it costs no extra query. A
 * limit you can only meet by being refused is not one anybody can plan
 * around — and unlike a count of runs, this is a number that means something
 * on its own.
 *
 * Every run carries a figure from the moment it opens: an estimate at first,
 * replaced by the real cost when it lands. So a run still in flight is
 * counted, which is the point, and the total drifts *down* as things finish.
 */
export function spentToday(runs: AgentRun[], now = new Date()): number {
  const since = new Date(now)
  since.setUTCHours(0, 0, 0, 0)
  let usd = 0
  for (const r of runs) {
    if (new Date(r.created_at) < since) continue
    // numeric(10,6) arrives from PostgREST as a string
    const n = Number(r.cost_usd ?? 0)
    if (Number.isFinite(n)) usd += n
  }
  return usd
}

const STATUS_COLOR: Record<AgentRun['status'], string> = {
  running: 'var(--warn)',
  succeeded: 'var(--ok)',
  failed: 'var(--danger)',
  invalid_output: 'var(--danger)',
}

export default function RunsPage() {
  const [runs, setRuns] = useState<AgentRun[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // an error with no way past it is a dead end; every other AI surface in the
  // app offers the retry, and this one printed the message in the faintest
  // class it has and left you there
  const [tries, setTries] = useState(0)

  useEffect(() => {
    let live = true
    setError(null)
    setRuns(null)
    // Somewhere to stop. A query that never answers — no signal, no account,
    // a deployment without a database behind it — used to leave a placeholder
    // shimmering on the screen for as long as you cared to look at it.
    const giveUp = setTimeout(() => {
      if (live) setError('Could not reach your activity just now.')
    }, 12000)
    void supabase
      .from('agent_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!live) return
        clearTimeout(giveUp)
        if (error) setError(error.message)
        else setRuns((data ?? []) as AgentRun[])
      })
    return () => {
      live = false
      clearTimeout(giveUp)
    }
  }, [tries])

  const today = useMemo(() => (runs ? spentToday(runs) : null), [runs])
  // Only the last hundred runs are on the page, so a very heavy day would be
  // read short. Said as "at least" rather than quietly under-reported.
  const partial = (runs?.length ?? 0) >= 100

  return (
    <div className="page">
      <h1 className="page-title">AI activity</h1>
      {today !== null && (
        <p className="faint" style={{ fontSize: 'var(--fs-label)', marginBottom: 'var(--sp-3)' }}>
          {partial ? 'At least ' : ''}
          <strong className="mono">${today.toFixed(2)}</strong> of ${DAILY_USD_CAP.toFixed(2)} today
          {today > 0 && ' · resets at midnight UTC'}
        </p>
      )}
      {error && (
        <p className="muted" style={{ fontSize: 'var(--fs-label)' }} role="status">
          {error}{' '}
          <button className="btn btn--ghost btn--sm" onClick={() => setTries((n) => n + 1)}>
            try again
          </button>
        </p>
      )}
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
