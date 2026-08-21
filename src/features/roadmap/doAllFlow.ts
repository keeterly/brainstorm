// The agent doing a piece of the week, rather than a piece of one thing.
//
// Everything this needs already exists and only one thing consumed it. `rain`
// writes each step and says, of each, whether a useful first version could be
// written from what is in front of it — `canDraft` — and `getOnWithIt` turns
// that into a "do it" verb for exactly one step at a time. This is the same
// judgement asked of a week.
//
// What it deliberately is *not*: the model deciding what to do. Every graph
// mutation in this app is deterministic TypeScript reading a validated output,
// and the model never calls back in. This is the UI calling a flow in a loop,
// which is the pattern that already exists (`sizeUp` → `draftThought`), not a
// new one.
import { canAgentDo, alreadyDrafted } from '@/domain/doable'
import { nameOf } from '@/domain/row'
import type { Thought } from '@/domain/types'
import { useGraph } from '@/store/graph'
import { sizeUp } from '@/features/sky/gaugeFlow'
import { draftThought } from '@/features/sky/draftFlow'

const S = () => useGraph.getState()

/**
 * How many it will take on at once.
 *
 * Six, and serially. `draft` is the most expensive action in the app — the
 * smart tier, nine thousand tokens, two searches — against a daily cap of six
 * dollars; and `pendingRuns` reads at most eight unclaimed runs, so a larger
 * batch would out-run the very machinery that reattaches the results when you
 * come back to the app. Serially because one failure must not take the rest of
 * the batch with it, and because a queue you can watch is a queue you can stop.
 */
export const BATCH = 6

export interface Shortlist {
  /** what it could write, in the order the week has them */
  mine: Thought[]
  /** …and what it is leaving to you, because these have to be gone and done */
  yours: Thought[]
}

/**
 * Split a week into what the agent can do and what it cannot.
 *
 * Already-written steps are in neither: they are done as far as this is
 * concerned, and offering to write them again is how you get two briefs on one
 * step and no way to tell which is current.
 */
export function shortlist(steps: Thought[]): Shortlist {
  const rels = S().relationships
  const mine: Thought[] = []
  const yours: Thought[] = []
  for (const t of steps) {
    if (alreadyDrafted(t)) continue
    if (canAgentDo(t, rels, nameOf)) mine.push(t)
    else yours.push(t)
  }
  return { mine: mine.slice(0, BATCH), yours }
}

/** What to say about a shortlist, in the app's own voice. */
export function offerLine(list: Shortlist, total: number): string {
  if (!list.mine.length) return ''
  const n = list.mine.length
  return `I can write ${n === 1 ? 'one' : n} of the ${total} on your roadmap now`
}

export type BatchEvent =
  | { kind: 'starting'; t: Thought; at: number; of: number }
  | { kind: 'made'; t: Thought }
  | { kind: 'failed'; t: Thought; why?: string }
  /** the whole batch stopped — a cap, a refusal, no key. Everything after is undone. */
  | { kind: 'stopped'; why: string; done: number; left: number }
  | { kind: 'finished'; done: number; failed: number }

/**
 * Work through the shortlist, saying what is happening as it goes.
 *
 * Each one is sized first, exactly as a single "do it" is — `draft` is
 * `background: true`, so every one of these outlives the page that started it.
 * That is not a complication to be managed here: `collectOwed` already reattaches
 * unclaimed runs on the next load, `markApplied` already stops a result landing
 * twice across devices, and the push already fires when each finishes.
 *
 * A refusal stops the batch where it is rather than pressing on. The server can
 * answer "not on the list", "past today's cap" or "the meter is unreadable", and
 * a batch that half-happens in silence is worse than one that never started —
 * you would come back to four of eleven done and no idea why the other two are
 * missing.
 */
/** What actually writes one, so a test can watch the batch decide without a model. */
export type Writer = (id: string) => Promise<{ kind: string; why?: string }>

const writeOne: Writer = async (id) => {
  const sizing = await sizeUp(id, 'draft', 2)
  return draftThought(id, { sizing })
}

export async function doThemAll(
  steps: Thought[],
  say: (e: BatchEvent) => void,
  write: Writer = writeOne,
): Promise<{ done: number; failed: number }> {
  const list = shortlist(steps)
  let done = 0
  let failed = 0
  // …and a backstop that does not depend on wording. Some refusals arrive as a
  // sentence this cannot recognise — "everyone's AI budget for today is used
  // up" is one word too long for the app's own phrasebook and comes back as the
  // generic line — and a batch that cannot recognise a wall will walk into it
  // six times, paying for a `gauge` each time. Two in a row is a wall.
  let inARow = 0
  for (let i = 0; i < list.mine.length; i++) {
    const t = list.mine[i]
    say({ kind: 'starting', t, at: i + 1, of: list.mine.length })
    try {
      const res = await write(t.id)
      if (res.kind === 'failed') {
        // A refusal is about the account, not about this step, so the next one
        // would be refused too. Anything else is this step having gone wrong.
        if (isRefusal(res.why)) {
          say({ kind: 'stopped', why: res.why ?? 'it would not run', done, left: list.mine.length - i })
          return { done, failed }
        }
        failed++
        inARow++
        say({ kind: 'failed', t, why: res.why })
        if (inARow >= 2 && i + 1 < list.mine.length) {
          say({
            kind: 'stopped',
            why: res.why ?? 'two went wrong in a row',
            done,
            left: list.mine.length - i - 1,
          })
          return { done, failed }
        }
      } else {
        done++
        inARow = 0
        say({ kind: 'made', t })
      }
    } catch (e) {
      const why = (e as Error)?.message
      say({ kind: 'stopped', why: why && why.length < 90 ? why.toLowerCase() : 'it stopped', done, left: list.mine.length - i })
      return { done, failed }
    }
  }
  say({ kind: 'finished', done, failed })
  return { done, failed }
}

/**
 * Is this the account being refused, rather than this one step failing?
 *
 * The three the server can answer with — not on the list, past a cap, the meter
 * unreadable — plus not being signed in, being offline, and having cancelled.
 * All of them mean the next one gets the same answer, so there is nothing to be
 * gained by trying it.
 *
 * Matching on wording is not something to rely on alone, and it is not relied
 * on alone: see the two-in-a-row backstop above, which stops a batch walking
 * into a wall whose sentence this does not happen to recognise.
 */
function isRefusal(why?: string): boolean {
  if (!why) return false
  return /sign in|not on the list|cap\b|limit|too many|allowance|budget|usage|offline|cancelled/i.test(why)
}
