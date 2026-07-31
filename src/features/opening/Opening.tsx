// The first breath.
//
// Opening the app used to put you straight onto the sky mid-settle: the world
// arrives, the drops find their places, and you are already meant to be
// thinking. This is the half-second before that — the grain, and three numbers
// saying what state your thinking is in.
//
// It is a moment, not a screen. Nothing to dismiss, nothing to learn, no
// button: it fades up, holds long enough to be read, and dissolves into the
// sky on its own. A splash screen you have to get past is a toll you pay
// several times a day; this is closer to the pause before you open a notebook.
//
// It also answers a question the sky cannot. The sky shows you *what* you are
// thinking about; it has no way to say how much of it is waiting on you, how
// much is still shapeless, and how much is already moving. Three numbers do,
// and they cost nothing to read because you are not doing anything yet.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGraph } from '@/store/graph'
import './opening.css'

/** Long enough to read three short numbers; short enough not to be a wait. */
export const HOLD_MS = 1500
/** …and the dissolve on the end of it. */
export const FADE_MS = 620

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
 * Shown once per launch, and only when there is something to say.
 *
 * A brand-new account has nothing to report and would get a screen of three
 * zeroes for its trouble; that is worse than no moment at all.
 */
export default function Opening() {
  const hydrated = useGraph((s) => s.hydrated)
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const [gone, setGone] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const started = useRef(false)

  const weather = useMemo(() => readWeather(thoughts, relationships), [thoughts, relationships])
  const anything = weather.pending + weather.inThought + weather.inWorks > 0

  useEffect(() => {
    // The clock starts when the numbers are real, not when the component
    // mounts. Counting up from an empty store and then jumping as the graph
    // lands is worse than waiting a beat for it.
    if (!hydrated || started.current) return
    started.current = true
    if (!anything) return setGone(true)
    const a = setTimeout(() => setLeaving(true), HOLD_MS)
    const b = setTimeout(() => setGone(true), HOLD_MS + FADE_MS)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [hydrated, anything])

  if (gone) return null
  return (
    <div className={`opening${leaving ? ' leaving' : ''}${hydrated && anything ? ' lit' : ''}`} aria-hidden="true">
      <div className="opening-in">
        {WORDS.map(([k, word], i) => (
          <div className="opening-line" style={{ '--i': i } as React.CSSProperties} key={k}>
            <span className="n">{weather[k]}</span>
            <span className="w">{word}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
