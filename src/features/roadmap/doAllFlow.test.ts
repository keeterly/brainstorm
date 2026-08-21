import { beforeEach, describe, expect, it } from 'vitest'
import { BATCH, doThemAll, offerLine, shortlist, type BatchEvent } from './doAllFlow'
import { useGraph } from '@/store/graph'
import type { Relationship, Thought } from '@/domain/types'

let n = 0
function th(p: Partial<Thought> & { id: string }): Thought {
  return {
    user_id: 'u',
    raw_content: p.title ?? p.id,
    title: p.title ?? p.id,
    type: 'action',
    status: 'open',
    extra: {},
    created_at: new Date(Date.UTC(2026, 0, 1, 0, n++)).toISOString(),
    ...p,
  } as Thought
}
const partOf = (child: string, parent: string): Relationship =>
  ({ id: `r${n++}`, user_id: 'u', from_id: child, to_id: parent, type: 'part_of' }) as Relationship

/** put a graph in front of the flow, which reads the store directly */
function world(thoughts: Thought[], relationships: Relationship[]) {
  useGraph.setState({ thoughts, relationships } as never)
}

beforeEach(() => world([], []))

describe('what the agent will take on', () => {
  it('takes what it said it could write, and leaves what has to be gone and done', () => {
    /*
     * The half that matters more is the refusal. An app that offers to shoot a
     * roll of film for you is an app you stop believing.
     */
    const write = th({ id: 'copy', title: 'Write the wax-letter copy', extra: { canDraft: true } })
    const shoot = th({ id: 'shoot', title: 'Shoot one roll of expired stock', extra: { canDraft: false } })
    world([write, shoot], [partOf('copy', 'g'), partOf('shoot', 'g')])
    const list = shortlist([write, shoot])
    expect(list.mine.map((t) => t.id)).toEqual(['copy'])
    expect(list.yours.map((t) => t.id)).toEqual(['shoot'])
  })

  it('does not offer to write something it has already written', () => {
    // two briefs on one step and no way to tell which is current
    const done = th({ id: 'a', extra: { canDraft: true, drafted_at: '2026-03-01T09:00:00.000Z' } })
    const open = th({ id: 'b', extra: { canDraft: true } })
    world([done, open], [partOf('a', 'g'), partOf('b', 'g')])
    const list = shortlist([done, open])
    expect(list.mine.map((t) => t.id)).toEqual(['b'])
    // …and it is not sitting in "yours" either, implying you have to do it
    expect(list.yours).toHaveLength(0)
  })

  it('never takes on more than a batch at once', () => {
    /*
     * Six. `draft` is the most expensive action in the app against a daily cap
     * of six dollars, and `pendingRuns` reads at most eight unclaimed runs — a
     * larger batch out-runs the machinery that reattaches the results.
     */
    const many = Array.from({ length: 20 }, (_, i) => th({ id: `s${i}`, extra: { canDraft: true } }))
    world(many, many.map((t) => partOf(t.id, 'g')))
    expect(shortlist(many).mine).toHaveLength(BATCH)
  })

  it('says how many of how many, in words', () => {
    const list = { mine: [th({ id: 'a' }), th({ id: 'b' })], yours: [] }
    expect(offerLine(list, 11)).toBe('I can write 2 of the 11 on your roadmap now')
    expect(offerLine({ mine: [th({ id: 'a' })], yours: [] }, 4)).toBe('I can write one of the 4 on your roadmap now')
  })

  it('says nothing at all when there is nothing it can do', () => {
    // an offer to do nothing is worse than no offer
    expect(offerLine({ mine: [], yours: [th({ id: 'x' })] }, 5)).toBe('')
  })
})

describe('working through them', () => {
  /** six steps the agent says it can write, all under one goal */
  const six = () => {
    const ts = Array.from({ length: 6 }, (_, i) => th({ id: `s${i}`, extra: { canDraft: true } }))
    world(ts, ts.map((t) => partOf(t.id, 'g')))
    return ts
  }

  it('says which one it is on, and what it ended up with', async () => {
    // a batch that works in silence is one you cannot tell from a batch that
    // has died
    const ts = six()
    const heard: BatchEvent[] = []
    const out = await doThemAll(ts, (e) => heard.push(e), async () => ({ kind: 'made' }))
    expect(out).toEqual({ done: 6, failed: 0 })
    expect(heard.filter((e) => e.kind === 'starting')).toHaveLength(6)
    expect(heard.at(-1)).toEqual({ kind: 'finished', done: 6, failed: 0 })
  })

  it('stops the moment the account itself is refused', async () => {
    /*
     * A cap or a guest list is about the account, not about this step, so the
     * next one gets the same answer. Pressing on would spend a `gauge` per step
     * to be told the same thing five more times.
     */
    const ts = six()
    const heard: BatchEvent[] = []
    await doThemAll(ts, (e) => heard.push(e), async () => ({
      kind: 'failed',
      why: 'daily ai limit reached — $6.00 of $6.00 used today',
    }))
    const stopped = heard.find((e) => e.kind === 'stopped')
    expect(stopped, 'it kept going after being refused').toBeTruthy()
    expect(heard.filter((e) => e.kind === 'starting'), 'it tried more than the one').toHaveLength(1)
  })

  it('stops after two go wrong in a row, whatever the reason said', async () => {
    /*
     * The backstop that does not depend on wording. Some refusals come back as
     * a sentence the app's phrasebook does not recognise — "everyone’s AI
     * budget for today is used up" is a word too long for it — and a batch that
     * cannot recognise a wall will walk into it six times, paying each time.
     */
    const ts = six()
    const heard: BatchEvent[] = []
    await doThemAll(ts, (e) => heard.push(e), async () => ({
      kind: 'failed',
      why: 'the thinking engine could not finish that one',
    }))
    expect(heard.filter((e) => e.kind === 'starting'), 'it walked into the wall more than twice').toHaveLength(2)
    expect(heard.find((e) => e.kind === 'stopped')).toBeTruthy()
  })

  it('carries on past one that simply went wrong', async () => {
    // one bad step is not a reason to abandon the other five
    const ts = six()
    const heard: BatchEvent[] = []
    let n = 0
    const out = await doThemAll(ts, (e) => heard.push(e), async () => {
      n++
      return n === 2 ? { kind: 'failed', why: 'it went quiet before answering' } : { kind: 'made' }
    })
    expect(out).toEqual({ done: 5, failed: 1 })
    expect(heard.filter((e) => e.kind === 'starting')).toHaveLength(6)
  })
})
