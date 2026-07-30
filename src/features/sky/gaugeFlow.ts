// How long this one is going to take, decided before it takes it.
//
// ⚡ spent the same minute on everything. Four live web searches on "Get
// approved for a $100K SBA loan", which needs every one of them, and four on
// "SS27 Lookbook & Collection Prep", which needs none — nobody on the web has
// heard of that lookbook, and the searches were sixty seconds spent confirming
// it. The depth was a constant in a file rather than a property of the ask.
//
// So a cheap read goes first. Under a second on the fast tier, and what it buys
// is three things: the right number of searches, the right road (an ask that
// needs nothing looked up is an ordinary call that lands in seconds, not a
// background job you poll for a minute), and a wait that can say which of those
// two this is instead of always promising a minute.
//
// It fails soft, deliberately. A gauge that does not come back must never stop
// the thing it was gauging: the answer is then the action's own ceiling, which
// is exactly the behaviour that existed before any of this.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import { SEARCHES_FOR, SECONDS_FOR, type Depth, type GaugeOutput } from '@shared/ai/actions/gauge'

export interface Sizing {
  depth: Depth
  /** how many searches the run gets */
  searches: number
  /** true when this is short enough to wait on directly */
  quick: boolean
  /** roughly how long, in seconds, for a wait that does not lie */
  seconds: number
  /** one line for the notice that stands while it works */
  why: string
  /** the specific things it said it would go and check */
  needs: string[]
}

/** What to assume when nothing has been measured: the old behaviour, unchanged. */
export function fullDepth(ceiling: number): Sizing {
  return {
    depth: 'deep',
    searches: ceiling,
    quick: false,
    seconds: SECONDS_FOR.deep,
    why: 'out finding out',
    needs: [],
  }
}

export async function sizeUp(
  subjectId: string,
  kind: 'plan' | 'answer' | 'draft',
  ceiling: number,
  intent?: string,
): Promise<Sizing> {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === subjectId)
  if (!subject || s.offline) return fullDepth(ceiling)

  const title = (t: { title: string | null; raw_content: string }) => t.title || t.raw_content.slice(0, 200)
  const context = s.relationships
    .filter((r) => r.type === 'part_of' && r.to_id === subjectId)
    .map((r) => s.thoughts.find((t) => t.id === r.from_id))
    .filter((t): t is NonNullable<typeof t> => !!t && t.status !== 'done')
    .map(title)
    .slice(0, 20)

  try {
    const { output } = await runAction<GaugeOutput>('gauge', {
      subject: { id: subject.id, title: title(subject), type: subject.type, summary: subject.summary },
      context,
      kind,
      intent: intent?.trim() || undefined,
    })
    return sizingOf(output, ceiling)
  } catch {
    // it is a hint, not a gate
    return fullDepth(ceiling)
  }
}

/** Turn what it said into what the run actually does. */
export function sizingOf(out: GaugeOutput, ceiling: number): Sizing {
  const searches = Math.min(SEARCHES_FOR[out.depth], ceiling)
  return {
    depth: out.depth,
    searches,
    // Nothing to look up is the only case short enough to hold someone's
    // attention, and it is the case a background job serves worst.
    quick: searches === 0,
    seconds: SECONDS_FOR[out.depth],
    why: out.why.trim() || (searches === 0 ? 'thinking it through' : 'checking a few things first'),
    needs: out.needs,
  }
}

/**
 * What to put on screen while it works.
 *
 * The old notice promised a minute for everything, which was a lie half the
 * time in each direction. This says what it is doing and roughly how long, and
 * counts once it has gone past that — an estimate that quietly becomes a
 * stopwatch is more honest than one that keeps insisting.
 */
export function waitingWord(sz: Sizing, elapsedS: number): string {
  if (elapsedS > sz.seconds) return `${sz.why} · ${elapsedS}s`
  if (sz.quick) return sz.why
  return elapsedS < 4 ? sz.why : `${sz.why} · ${elapsedS}s`
}
