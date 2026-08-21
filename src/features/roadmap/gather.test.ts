import { describe, expect, it } from 'vitest'
import { goalOf, pursued } from './gather'
import type { Relationship, Thought } from '@/domain/types'

let n = 0
function th(p: Partial<Thought> & { id: string }): Thought {
  return {
    user_id: 'u',
    raw_content: p.id,
    title: p.id,
    type: 'note',
    status: 'open',
    summary: null,
    effort: null,
    extra: {},
    created_at: new Date(Date.UTC(2026, 0, 1, 0, n++)).toISOString(),
    ...p,
  } as Thought
}
const partOf = (child: string, parent: string): Relationship =>
  ({ id: `r${n++}`, user_id: 'u', from_id: child, to_id: parent, type: 'part_of' }) as Relationship

/** a step as `rain` writes one: a reason and a size */
const planned = (id: string, effort = 2) =>
  th({ id, type: 'action', summary: `why ${id}`, effort })

describe('what is on the roadmap', () => {
  it('takes a group the agent has actually planned', () => {
    const ts = [th({ id: 'goal', type: 'goal' }), planned('a'), planned('b')]
    const rels = [partOf('a', 'goal'), partOf('b', 'goal')]
    const out = pursued(ts, rels)
    expect(out).toHaveLength(1)
    expect(out[0].goal.id).toBe('goal')
    expect(out[0].steps.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })

  it('leaves a pile alone, because numbering it would invent an order', () => {
    // no reason, no effort, no edges — `hasPlan` says this is not a plan, and
    // putting it on a calendar would be the app inventing a week nobody meant
    const ts = [th({ id: 'wall', type: 'goal' }), th({ id: 'x' }), th({ id: 'y' })]
    expect(pursued(ts, [partOf('x', 'wall'), partOf('y', 'wall')])).toHaveLength(0)
  })

  it('does not book an afternoon to look at a photograph', () => {
    /*
     * The one this was written for. A moodboard lives inside the campaign it is
     * for, so its pictures are leaves of a planned group exactly as the steps
     * are — and on the demo world, four of them took a whole week's capacity
     * and pushed every real step past the weekend.
     *
     * A photograph is a `note` and so is a step you typed, so the type cannot
     * tell them apart. The picture can.
     */
    const ts = [
      th({ id: 'goal', type: 'goal' }),
      planned('step'),
      th({ id: 'photo', extra: { img: 'data:image/png;base64,xxx' } }),
      th({ id: 'link', type: 'reference' }),
    ]
    const rels = [partOf('step', 'goal'), partOf('photo', 'goal'), partOf('link', 'goal')]
    expect(pursued(ts, rels)[0].steps.map((s) => s.id)).toEqual(['step'])
  })

  it('keeps a step you typed yourself, which has no reason and no size', () => {
    // the absence is how you tell which are yours — it is still a thing you
    // meant to do, and dropping it would be the roadmap hiding your own work
    const ts = [th({ id: 'goal', type: 'goal' }), planned('written'), th({ id: 'mine' })]
    const out = pursued(ts, [partOf('written', 'goal'), partOf('mine', 'goal')])
    expect(out[0].steps.map((s) => s.id).sort()).toEqual(['mine', 'written'])
  })

  it('schedules the work inside a sub-group, not the sub-group itself', () => {
    // booking both would book the same afternoon twice
    const ts = [th({ id: 'goal', type: 'goal' }), th({ id: 'sub', type: 'goal' }), planned('leaf')]
    const out = pursued(ts, [partOf('sub', 'goal'), partOf('leaf', 'sub')])
    expect(out[0].steps.map((s) => s.id)).toEqual(['leaf'])
  })

  it('lists a nested group once, under the goal that holds it', () => {
    const ts = [th({ id: 'goal', type: 'goal' }), th({ id: 'sub', type: 'goal' }), planned('leaf')]
    const out = pursued(ts, [partOf('sub', 'goal'), partOf('leaf', 'sub')])
    expect(out).toHaveLength(1)
    expect(out[0].goal.id).toBe('goal')
  })

  it('leaves finished work off it', () => {
    const ts = [th({ id: 'goal', type: 'goal' }), planned('open'), { ...planned('shut'), status: 'done' } as Thought]
    const out = pursued(ts, [partOf('open', 'goal'), partOf('shut', 'goal')])
    expect(out[0].steps.map((s) => s.id)).toEqual(['open'])
  })

  it('does not hang on a group that contains itself', () => {
    const ts = [th({ id: 'a', type: 'goal' }), planned('b')]
    const out = pursued(ts, [partOf('b', 'a'), partOf('a', 'b')])
    expect(Array.isArray(out)).toBe(true)
  })

  it('narrows to what you said you were doing, once you have said', () => {
    /*
     * Half the point of a second tab is that the things on it are the things you
     * chose, rather than everything that happens to have been planned.
     */
    const ts = [
      th({ id: 'doing', type: 'goal', extra: { pursuing_since: '2026-03-01T09:00:00.000Z' } }),
      planned('a'),
      th({ id: 'idle', type: 'goal' }),
      planned('b'),
    ]
    const out = pursued(ts, [partOf('a', 'doing'), partOf('b', 'idle')])
    expect(out.map((g) => g.goal.id)).toEqual(['doing'])
  })

  it('shows everything planned until you have chosen anything at all', () => {
    // an empty screen is a worse teacher than a full one — the page says what
    // it is showing and what to do about it
    const ts = [th({ id: 'g1', type: 'goal' }), planned('a'), th({ id: 'g2', type: 'goal' }), planned('b')]
    const out = pursued(ts, [partOf('a', 'g1'), partOf('b', 'g2')])
    expect(out).toHaveLength(2)
    expect(out.every((g) => !g.chosen)).toBe(true)
  })

  it('says which idea a step came out of', () => {
    const ts = [th({ id: 'goal', type: 'goal' }), th({ id: 'sub', type: 'goal' }), planned('leaf')]
    const rels = [partOf('sub', 'goal'), partOf('leaf', 'sub')]
    const byId = new Map(ts.map((t) => [t.id, t] as const))
    expect(goalOf('leaf', rels, byId)?.id).toBe('goal')
  })
})
