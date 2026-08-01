// What the agent is doing, said out loud.
//
// The whole of it used to be one line — "out finding out · 41s" — over a
// pulsing drop. That tells you something is happening and nothing else: not
// what it went to do, not whether forty-one seconds is normal or worrying, not
// whether you have to sit here for it. A minute of silence with a glow on it
// is indistinguishable from a minute of nothing working, and the second guess
// is the one people make.
//
// Everything here is something the app actually knows. The gauge that runs
// before every long action already decides how deep to go, roughly how long
// that takes, and **the specific things it is going out to check** — and that
// last one was thrown away, never shown, on the one screen where a person is
// sitting waiting and would most like to read it.
//
// What it deliberately does not do is invent a story. There are no server-side
// step events to have: a run is one request that comes back `succeeded` or
// `failed`, so a five-stage checklist ticking itself off would be a fiction
// with good production values. The phases below are the three the *client*
// genuinely passes through, the bar is elapsed against an estimate and says so
// the moment it overruns, and it never fills — because a full bar means done,
// and this is not done until it is.

/** The three states the page itself can tell apart. */
export type Phase =
  /** the cheap read that decides how much work this is */
  | 'sizing'
  /** the real call, away at the model */
  | 'out'
  /** it came back, and what it wrote is going into the graph */
  | 'landing'

export interface WorkState {
  /** the drop it is working on */
  who: string
  /** what the gauge said it was doing */
  what: string
  phase: Phase
  /** the specific things the gauge said it would go and check */
  needs: string[]
  /** how many seconds this size of job usually takes */
  expect: number
  /** how many it has actually taken */
  elapsed: number
  /** true when the run outlives the page and you may walk away from it */
  background: boolean
}

export interface WorkFace {
  /** the headline, in the app's voice */
  line: string
  /** the second line, or nothing */
  note: string | null
  /** 0…1, and never 1 while it is still out there */
  fill: number
  /** what it went out to check, trimmed to what fits */
  needs: string[]
  /** it has taken longer than the estimate, and the bar has stopped pretending */
  over: boolean
}

/** Never all the way. A bar at 100% says finished, and it is not. */
const CEILING = 0.92
/** More than three and it is a document, not a status. */
const NEEDS_SHOWN = 3

/**
 * Turn what is known into what is said.
 *
 * Pure, so the wording and the arithmetic can be argued with in a test rather
 * than by staring at a phone for ninety seconds.
 */
export function workFace(w: WorkState): WorkFace {
  const secs = Math.max(0, Math.round(w.elapsed))
  const over = w.phase === 'out' && secs > w.expect

  if (w.phase === 'sizing') {
    // Under a second, most of the time. Naming it costs nothing and stops the
    // first moment of every run looking like a stall.
    return { line: 'sizing it up', note: null, fill: 0.06, needs: [], over: false }
  }
  if (w.phase === 'landing') {
    // The bar has to move here or the last second of a minute-long wait looks
    // like the failure it very much is not.
    return { line: 'landing it', note: null, fill: 1, needs: [], over: false }
  }

  const line = secs < 3 ? w.what : `${w.what} · ${secs}s`
  const note = over
    ? // Said plainly. The alternative is a bar that inches towards a line it
      // will never reach, which is a way of not admitting the estimate was
      // wrong — and it is only an estimate.
      `longer than the usual ${w.expect}s`
    : w.background
      ? // True, and the single most useful thing to know: this one survives
        // the app being closed, and comes back on its own.
        'you can put the phone down — it finishes without you'
      : null

  return {
    line,
    note,
    fill: over ? CEILING : Math.min(CEILING, secs / Math.max(1, w.expect)),
    needs: w.needs.slice(0, NEEDS_SHOWN),
    over,
  }
}
