// The same wait, on the other surface it happens on.
//
// The Current had its own sentence for this — the line, plus "it keeps going
// if you lock the phone" — and the sky had a different one, and neither showed
// what the agent had said it was going out to check. Two surfaces describing
// the same minute in two voices is how an app starts feeling like several
// apps, so both read from `workFace` now and cannot drift.
//
// This one is paper rather than glass, and that is the only difference.
import { workFace, type Phase } from '@/features/sky/working'
import type { Sizing } from '@/features/sky/gaugeFlow'

export default function Working({
  sizing,
  sized,
  waited,
}: {
  sizing: Sizing
  /** the cheap read has come back, so the numbers below are real */
  sized: boolean
  /** seconds since the button was pressed */
  waited: number
}) {
  // Only the two this page can tell apart. It hands the result to the graph
  // through the same call that returns it, so there is no separate moment when
  // something has come back and is being written down.
  const phase: Phase = sized ? 'out' : 'sizing'
  const f = workFace({
    who: '',
    what: sizing.why,
    phase,
    needs: sizing.needs,
    expect: sizing.seconds,
    elapsed: waited,
    background: !sizing.quick,
  })
  return (
    <div className="working" role="status">
      <p className="working__line">{f.line}</p>
      <div className="working__bar" aria-hidden="true">
        <i style={{ width: `${(f.fill * 100).toFixed(1)}%` }} className={f.over ? 'over' : undefined} />
      </div>
      {f.needs.length > 0 && (
        <ul className="working__needs">
          {f.needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {f.note && <p className="working__note">{f.note}</p>}
    </div>
  )
}
