import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { readAllowance, type Allowance } from '@/ai/allowance'
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
  /*
   * What the *server* says this person is allowed.
   *
   * Not `DAILY_USD_CAP` out of the bundle. That is the app's own default, and
   * a guest's day is set by configuration the client cannot see — so the page
   * told everybody their ceiling was six dollars, which for somebody on a
   * dollar fifty is not a rounding error, it is the wrong number.
   */
  const [mine, setMine] = useState<Allowance | null>(null)
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

  useEffect(() => {
    let live = true
    void readAllowance().then((a) => {
      if (live) setMine(a)
    })
    return () => {
      live = false
    }
  }, [tries])

  // The server's figure when there is one — it counts every run, not the
  // hundred this page happens to have pulled — and this page's own arithmetic
  // when there is not, so a deployment without the endpoint still says
  // something true.
  const today = useMemo(() => mine?.spentUSD ?? (runs ? spentToday(runs) : null), [mine, runs])
  // Only the last hundred runs are on the page, so a very heavy day would be
  // read short. Said as "at least" rather than quietly under-reported.
  // …and only when the figure is this page's own guess, which stops at a
  // hundred rows. The server's figure counts everything.
  const partial = mine?.spentUSD == null && (runs?.length ?? 0) >= 100

  return (
    <div className="page">
      <h1 className="page-title">AI activity</h1>
      {mine && !mine.allowed && (
        <p className="faint" style={{ fontSize: 'var(--fs-label)', marginBottom: 'var(--sp-3)' }} role="status">
          This account is not on the list for AI actions. Everything else in the app works.
        </p>
      )}
      {today !== null && (
        <p className="faint" style={{ fontSize: 'var(--fs-label)', marginBottom: 'var(--sp-3)' }}>
          {partial ? 'At least ' : ''}
          <strong className="mono">${today.toFixed(2)}</strong>
          {mine ? ` of $${mine.capUSD.toFixed(2)}` : ''} today
          {today > 0 && ' · resets at midnight UTC'}
          {/* the ceiling over everybody, when there is one — a guest who cannot
              run anything should be able to see that it is not about them */}
          {mine?.everyoneCapUSD != null && mine.everyoneUSD != null && (
            <>
              <br />
              everyone together: <strong className="mono">${mine.everyoneUSD.toFixed(2)}</strong> of $
              {mine.everyoneCapUSD.toFixed(2)}
            </>
          )}
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
