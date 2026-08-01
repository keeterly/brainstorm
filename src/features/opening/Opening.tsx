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
import './opening.css'

/** Long enough to read three short numbers and a line; short enough not to be a wait. */
export const HOLD_MS = 2300
/**
 * Signed out there are no numbers coming — `hydrate` only runs for a session —
 * so the name says its piece and gets out of the way of the form.
 */
export const BARE_MS = 1250
/** …and the dissolve on the end of it. */
export const FADE_MS = 620

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
  const born = useRef(0)
  if (!born.current) born.current = performance.now()
  /** past the point of no return: the timers that finish the dissolve must live */
  const going = useRef(false)

  const weather = useMemo(() => readWeather(thoughts, relationships), [thoughts, relationships])
  const anything = weather.pending + weather.inThought + weather.inWorks > 0
  // The same rules the Current applies, on the graph that has just arrived. No
  // model, no network, no waiting: a pure read of what is already here.
  const next = useMemo(
    () => (hydrated ? nextAction(thoughts, relationships, todayISO()) : null),
    [hydrated, thoughts, relationships],
  )

  const skip = () => {
    if (going.current) return
    going.current = true
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
    const wait = hydrated ? HOLD_MS : BARE_MS
    const left = Math.max(120, wait - (performance.now() - born.current))
    const a = setTimeout(() => {
      going.current = true
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
  }, [hydrated])

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
          <div className="opening-said">
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
