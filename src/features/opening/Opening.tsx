// The first breath.
//
// Opening the app used to put you straight onto the sky mid-settle: the world
// arrives, the drops find their places, and you are already meant to be
// thinking. This is the half-second before that — the app's own name
// condensing out of the grain, and then where your thinking stands.
//
// It is a moment, not a screen. Nothing to dismiss, nothing to learn, no
// button: it fades up, holds long enough to be read, and dissolves into the
// sky on its own. A splash screen you have to get past is a toll you pay
// several times a day; this is closer to the pause before you open a notebook.
// Touching it anywhere skips the rest, because some of the time you already
// know what you came in for.
//
// It also answers a question the sky cannot. The sky shows you *what* you are
// thinking about; it has no way to say how much of it is waiting on you, how
// much is still shapeless, and how much is already moving. Three numbers do,
// and they cost nothing to read because you are not doing anything yet.
//
// And then — the part that was missing — it says what to pick up. Three counts
// with nothing under them are a readout: true, and not usable. The same rules
// the Current uses to choose the next thing run here, offline, on the graph
// that has just landed, so the last thing you read before the sky arrives is a
// thing to do and the reason it was chosen.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGraph } from '@/store/graph'
import { nextAction } from '@/domain/next-action'
import { todayISO } from '@/domain/prioritize-prepass'
import { markCurtainLifting, markCurtainUp, onSkyReady, skyReadyAt } from '@/features/sky/ready'
import './opening.css'

/*
 * How long the whole moment lasts.
 *
 * Slower than it was, on purpose. The first version put the name, three
 * numbers and a thing to do on screen and took them away again inside two and
 * a half seconds, which is enough time to *see* all of it and not enough to
 * read any of it — so it registered as something flashing past rather than as
 * a pause. This is meant to be the beat before you start, and a beat you have
 * to hurry to catch is not one.
 *
 * Measured on the built app: the name has finished forming by about 2.2s and
 * the last line has landed by 2.7s, which leaves a full second of complete
 * stillness with everything readable before the dissolve starts. The stillness
 * is the part that reads as calm — motion that never stops is busy however
 * slowly it moves — so it is deliberate rather than slack.
 *
 * The cost of a slow opening is real and it is paid every launch, which is why
 * touching anywhere skips the rest of it. That is the trade: unhurried by
 * default, and one thumb away from gone.
 */
export const HOLD_MS = 3800
/**
 * The head start the numbers wait out, measured from the app opening.
 *
 * They come in over the tail of the name rather than after all of it: two slow
 * halves read as slower than one slow thing. Mirrored in opening.css as the
 * fallback for `--lead`.
 */
export const LEAD_MS = 1150
/** …and how long the whole set of them takes to arrive, once it starts. */
export const ARRIVE_MS = 3 * 230 + 900
/** How long you get with all of it on screen and nothing moving. */
export const READ_MS = 1100
/** However slow the graph is, this moment ends. */
export const CEILING_MS = 6000
/**
 * Signed out there are no numbers coming — `hydrate` only runs for a session —
 * so the name says its piece and gets out of the way of the form. Still long
 * enough for the word to finish forming, which is the whole of what there is
 * to see in that case.
 */
export const BARE_MS = 2400
/** …and the dissolve on the end of it, long enough to read as one. */
export const FADE_MS = 900

/** Ten letters, each one a beat behind the last. See opening.css. */
export const NAME = 'Brainstorm'

/**
 * What state your thinking is in, in three numbers.
 *
 * Deliberately not "tasks, projects, done". Those are a to-do list's words and
 * this is not one. What a person wants to know before they open this app is
 * whether anything is waiting on *them*, how much is still unformed, and how
 * much is already under way — which the graph can answer exactly.
 */
export interface Weather {
  pending: number
  inThought: number
  inWorks: number
}

export function readWeather(
  thoughts: { status: string; type: string; id: string }[],
  relationships: { type: string; from_id: string; to_id: string }[],
): Weather {
  const open = thoughts.filter((t) => t.status === 'open')
  const parents = new Set(relationships.filter((r) => r.type === 'part_of').map((r) => r.to_id))
  // Each thing counted once, in the first bucket it falls into. Counting by
  // three independent rules and subtracting to get the third is how a thing
  // that is both a group and an action makes the last number negative.
  const w: Weather = { pending: 0, inThought: 0, inWorks: 0 }
  for (const t of open) {
    // holding other things first: a group is work that has taken a shape, and
    // that is the more interesting thing to be true of it
    if (parents.has(t.id)) w.inWorks++
    else if (t.type === 'action' || t.type === 'task') w.pending++
    else w.inThought++
  }
  return w
}

const WORDS: [keyof Weather, string][] = [
  ['pending', 'pending'],
  ['inThought', 'in thought'],
  ['inWorks', 'in the works'],
]

/**
 * Shown once per launch.
 *
 * From the very first frame, opaque, before anything is known — which is the
 * fix for the background arriving in two pieces. It used to wait for the graph
 * and only then cover the screen, so you watched the sky paint itself and then
 * had a full-screen sheet dropped over the top of it. The sheet is what the
 * app opens as now, and the sky is revealed by it leaving.
 */
export default function Opening() {
  const hydrated = useGraph((s) => s.hydrated)
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const [gone, setGone] = useState(false)
  const [leaving, setLeaving] = useState(false)
  /*
   * When the app opened, and the one clock everything here is measured against.
   *
   * `null` rather than `0` as the "not set yet" value, and checked against
   * `null` rather than for falsiness. A zero reading is a legitimate one — it
   * is what `performance.now()` gives at the very start of a document's life,
   * and what a test's clock gives on its first tick — and a falsy check would
   * re-stamp the origin on every render, leaving every elapsed time in here
   * permanently zero. Which is not a hypothetical: it is what happened, and
   * the only reason it was caught is that a test moved the clock and asked.
   */
  const born = useRef<number | null>(null)
  if (born.current === null) {
    born.current = performance.now()
    // Told during render, which is over before the sky's first frame — that
    // runs on a rAF, after paint. The sky holds its drops as vapour only
    // because this said there was something to hold them for.
    markCurtainUp()
  }
  const since = () => performance.now() - (born.current as number)
  /** past the point of no return: the timers that finish the dissolve must live */
  const going = useRef(false)
  /** when the graph landed, on the app's clock. 0 while it has not. */
  const landed = useRef(0)

  const weather = useMemo(() => readWeather(thoughts, relationships), [thoughts, relationships])
  const anything = weather.pending + weather.inThought + weather.inWorks > 0
  // The same rules the Current applies, on the graph that has just arrived. No
  // model, no network, no waiting: a pure read of what is already here.
  const next = useMemo(
    () => (hydrated ? nextAction(thoughts, relationships, todayISO()) : null),
    [hydrated, thoughts, relationships],
  )

  /*
   * How much of the head start is left when the numbers finally mount.
   *
   * This was the whole of the bug behind "the title plays and that's it". The
   * lines wait 1150ms before arriving, and that wait was written in CSS — which
   * counts from the moment the element is *inserted*, not from the moment the
   * app opened. The element is inserted when the graph lands, so a hydrate that
   * took a second and a half handed the numbers a fresh second-and-a-half head
   * start on top of the wait you had already done, and they finished arriving
   * after the dissolve had started. On a phone on a cellular connection that is
   * the ordinary case, not the edge one; here it looked fine, because the demo
   * hydrates in nothing flat and the fault only shows up when the network is
   * real.
   *
   * Fixed once, on the first render that has something to show, so a later
   * re-render cannot restart an animation that is already playing.
   */
  const lead = useRef<number | null>(null)
  if (hydrated && anything && lead.current === null) lead.current = Math.max(0, LEAD_MS - since())

  /*
   * Whether there is a sky behind this to be revealed.
   *
   * The two were independent clocks: this left on a measure of its own, and
   * the sky painted whenever hydration and the auth check happened to finish.
   * Traced on the built app, both orders occur — and in the losing one the
   * curtain lifts on an empty sky and every drop appears three hundred
   * milliseconds later, at full size, together. Waiting costs nothing in the
   * ordinary case, where the sky is up long before the name has finished
   * forming.
   */
  const [painted, setPainted] = useState(skyReadyAt() > 0)
  useEffect(() => onSkyReady(() => setPainted(true)), [])

  const skip = () => {
    if (going.current) return
    going.current = true
    // the drops condense as this goes out of focus — see whenCurtainLifts
    markCurtainLifting()
    setLeaving(true)
    setTimeout(() => setGone(true), FADE_MS)
  }

  useEffect(() => {
    if (going.current) return
    /*
     * The clock runs from when the app opened, not from when this effect ran,
     * and it is re-set once the graph lands. Signed in, hydration usually beats
     * the name finishing and the whole thing reads as one movement. Signed out
     * it never comes at all, so this leaves on the short measure rather than
     * sitting on a sign-in form waiting for something that is not coming.
     */
    const now = since()
    if (hydrated && !landed.current) landed.current = Math.max(1, now)
    /*
     * Long enough to read what is on it, counted from when it got there.
     *
     * A fixed length from the app opening is only right when the graph lands
     * instantly. When it does not, the numbers turn up late and the clock they
     * were being measured against had been running the whole time — so the
     * slower the network, the less of the moment you actually got, which is
     * exactly backwards. This waits out whatever is left of the arrival and
     * then gives it a beat of stillness, and the ceiling means a graph that
     * never lands cannot hold the screen for ever.
     */
    const readable = Math.max(landed.current, LEAD_MS) + ARRIVE_MS + READ_MS
    // …and never before the sky behind it exists. Held at the ceiling until
    // it does, so this cannot sit here for ever if the sky never mounts —
    // and the moment it paints, the effect re-runs on the real measure.
    const held = painted ? 0 : CEILING_MS
    const wait = hydrated ? Math.min(CEILING_MS, Math.max(HOLD_MS, readable, held)) : BARE_MS
    const left = Math.max(120, wait - now)
    const a = setTimeout(() => {
      going.current = true
      markCurtainLifting()
      setLeaving(true)
    }, left)
    const b = setTimeout(() => setGone(true), left + FADE_MS)
    return () => {
      // Once it has started to go it has to be allowed to finish. Hydration
      // landing late would otherwise tear down the timer that unmounts this,
      // leaving a fully transparent sheet over the app for ever.
      if (going.current) return
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [hydrated, painted])

  if (gone) return null
  const title = next ? (next.thought.title || next.thought.raw_content).trim().slice(0, 72) : ''
  return (
    <div
      data-testid="opening"
      className={`opening lit${leaving ? ' leaving' : ''}`}
      onPointerDown={skip}
      role="presentation"
    >
      <div className="opening-in">
        <h1 className="opening-name" aria-label={NAME}>
          {[...NAME].map((c, i) => (
            <span key={i} style={{ '--i': i } as React.CSSProperties} aria-hidden="true">
              {c}
            </span>
          ))}
        </h1>
        {/* Nothing below the name until the graph is here. Counting up from an
            empty store and then jumping as it lands is worse than a beat of
            the name on its own. */}
        {hydrated && anything && (
          <div
            className="opening-said"
            style={{ '--lead': `${Math.round(lead.current ?? LEAD_MS)}ms` } as React.CSSProperties}
          >
            {WORDS.map(([k, word], i) => (
              <div className="opening-line" style={{ '--i': i } as React.CSSProperties} key={k}>
                <span className="n">{weather[k]}</span>
                <span className="w">{word}</span>
              </div>
            ))}
            {next && (
              <div className="opening-next" style={{ '--i': 3 } as React.CSSProperties}>
                <div className="lb">start with</div>
                <div className="what">{title}</div>
                <div className="why">{next.why}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
