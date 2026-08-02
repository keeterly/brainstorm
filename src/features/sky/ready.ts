// When the sky has actually drawn itself.
//
// The opening and the sky are two independent clocks, and nothing joined
// them: the opening left after a fixed measure of its own, and the sky
// painted whenever hydration and the auth check happened to finish. Traced on
// the built app, the two orders both occur — sometimes the drops are already
// standing there through the dissolve, and sometimes the curtain lifts on an
// empty sky and everything appears three hundred milliseconds later, at full
// size, all at once. That is the pop; the settle you then watch from the
// middle is the drift.
//
// A latch rather than an event on `window`: it is asked *after* the fact as
// often as before it — the opening may mount, or re-render, long after the
// sky is up — and a listener that missed the moment would wait for a second
// firing that never comes.
let at = 0
const waiting = new Set<() => void>()

/** The sky has put its first frame on the glass. Idempotent. */
export function markSkyReady(): void {
  if (at) return
  at = performance.now()
  for (const f of [...waiting]) f()
  waiting.clear()
}

/** …tell me when, or now if it already has. Returns the unsubscribe. */
export function onSkyReady(cb: () => void): () => void {
  if (at) {
    cb()
    return () => {}
  }
  waiting.add(cb)
  return () => waiting.delete(cb)
}

/** When it happened, on the same clock as `performance.now()`. 0 if not yet. */
export function skyReadyAt(): number {
  return at
}

/** Tests only: forget that it ever happened. */
export function resetSkyReady(): void {
  at = 0
  waiting.clear()
  lifted = false
  curtainUp = false
  lifting.clear()
}

/*
 * …and the other half of the handover: when the curtain starts to go.
 *
 * Holding the opening until the sky exists fixed the pop and hid the cure —
 * measured, the drops finished condensing two and a half seconds before the
 * curtain lifted, so the one thing worth watching happened behind it. The
 * arrival belongs to the dissolve: the name goes out of focus and the drops
 * come into it, out of the same grain, at the same moment.
 *
 * Latched for the session like the other one, so coming back to the sky from
 * another tab does not wait for a curtain that left long ago.
 */
let lifted = false
let curtainUp = false
const lifting = new Set<() => void>()

/**
 * There is an opening on screen, and it will say when it goes.
 *
 * Without this the sky had to guess how long to hold its breath, and any
 * guess is wrong in one direction or the other: measured, a fallback short
 * enough to be safe (1.2s) fired two and a half seconds before the curtain
 * actually lifted, and the whole arrival played out behind it again. So the
 * opening declares itself while it is being rendered — before the sky's
 * first frame, which happens after paint — and the sky waits only when there
 * is genuinely something to wait for.
 */
export function markCurtainUp(): void {
  if (!lifted) curtainUp = true
}

/** Has it? For deciding whether a drop is part of the first sky or a later one. */
export function curtainLifted(): boolean {
  return lifted
}

/** The opening has begun to dissolve. Idempotent. */
export function markCurtainLifting(): void {
  if (lifted) return
  lifted = true
  for (const f of [...lifting]) f()
  lifting.clear()
}

/**
 * Run this as the curtain goes — or now, if it already has, or if there is
 * no curtain at all (every visit to the sky after the first one).
 *
 * The fallback covers only the case where an opening declared itself and
 * then failed to dissolve: it is longer than that screen's own hard ceiling,
 * because expiring early is exactly the bug it exists to prevent.
 */
export function whenCurtainLifts(cb: () => void, fallbackMs = 7500): () => void {
  if (lifted || !curtainUp) {
    cb()
    return () => {}
  }
  let done = false
  const once = () => {
    if (done) return
    done = true
    lifting.delete(once)
    clearTimeout(timer)
    cb()
  }
  const timer = setTimeout(once, fallbackMs)
  lifting.add(once)
  return () => {
    done = true
    lifting.delete(once)
    clearTimeout(timer)
  }
}
