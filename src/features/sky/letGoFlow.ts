// What you say no to.
//
// Until the sea meant *let go*, the app could see almost none of this. Saying
// no is the commonest verdict anybody has about their own ideas — most of what
// you think of, you drop — and the only way to record it was a button behind a
// fold on a group page, three taps in, next to the word danger. So the graph
// filled up with everything you finished and almost nothing you rejected, and
// the half of you that the app could have learned the most from was the half it
// could not see.
//
// A preference is much easier to read off refusals than off acceptances. That
// you finished a thing says it was worth finishing; that you dropped four
// ideas in a row that all involved travelling says something about you that you
// would probably not have thought to write down.
//
// Two rules keep this from being creepy or expensive:
//
//   1. It never learns from one. One discard is a mood; four is a pattern, and
//      only the batch is ever sent.
//   2. It proposes rather than writes. Everything goes through the same
//      reconciler as every other fact, whose prompt insists that "nothing new
//      here" is the usual answer — so a run of unrelated discards costs one
//      cheap call and changes nothing.
import { useGraph } from '@/store/graph'
import { learnFacts } from '@/ai/memoryFlow'
import type { Thought } from '@/domain/types'

/** One is a mood. This many in a row is worth a look. */
const ENOUGH = 4
/** And after this long the run has gone cold — a Tuesday is not a pattern. */
const WINDOW_MS = 36 * 60 * 60 * 1000

let run: { at: number; what: string }[] = []

const label = (t: Thought) => t.title || t.raw_content.slice(0, 160)

/**
 * Note that something was let go, and speak up only when there is a run of it.
 *
 * Returns whether it went out to the reconciler, which is what the tests read.
 */
export async function learnFromLettingGo(t: Thought, nowMs = Date.now()): Promise<boolean> {
  run = run.filter((r) => nowMs - r.at < WINDOW_MS)
  run.push({ at: nowMs, what: label(t) })
  if (run.length < ENOUGH) return false
  if (useGraph.getState().offline) return false

  const dropped = run.map((r) => r.what)
  run = []
  // One observation, not four facts. The pattern — if there is one — is in the
  // set, and handing over four separate lines invites four separate memories
  // about four ideas, which is exactly the noise this must not produce.
  await learnFacts(
    [
      `Let go of these ${dropped.length} ideas without acting on any of them: ` +
        dropped.map((d) => `“${d}”`).join(', ') +
        `. If they have nothing in common, there is nothing to learn here.`,
    ],
    'letting several ideas go',
  )
  return true
}

/** What has been let go lately, for the surfaces that ought to know. */
export function recentlyLetGo(n = 12): string[] {
  const s = useGraph.getState()
  return s.thoughts
    .filter((t) => t.status === 'archived')
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
    .slice(0, n)
    .map(label)
}

/** Tests only — the run is process-wide by design. */
export function __resetRun(): void {
  run = []
}
