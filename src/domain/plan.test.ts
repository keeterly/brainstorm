import { describe, expect, it } from 'vitest'
import { effortDots, hasPlan, orderTree, planOrder, waitingOn } from './plan'
import { prioritizePrepass } from './prioritize-prepass'
import type { Relationship, Thought } from './types'

let n = 0
function step(p: Partial<Thought> & { id: string }): Thought {
  return {
    user_id: 'u',
    raw_content: p.id,
    title: p.id,
    type: 'action',
    status: 'open',
    created_at: new Date(Date.UTC(2026, 0, 1, 0, n++)).toISOString(),
    ...p,
  } as Thought
}
const dep = (from: string, to: string): Relationship =>
  ({ id: `r${n++}`, user_id: 'u', from_id: from, to_id: to, type: 'depends_on' }) as Relationship
const blocks = (from: string, to: string): Relationship =>
  ({ id: `r${n++}`, user_id: 'u', from_id: from, to_id: to, type: 'blocks' }) as Relationship

describe('the order the steps should be done in', () => {
  it('puts what something has to follow in front of it', () => {
    const steps = [step({ id: 'c' }), step({ id: 'a' }), step({ id: 'b' })]
    const out = planOrder(steps, [dep('c', 'a')]).map((s) => s.id)
    expect(out.indexOf('a')).toBeLessThan(out.indexOf('c'))
  })

  it('leaves everything else exactly where it was', () => {
    /*
     * Stability matters more than it sounds: the list is on screen while you
     * work, and a sort that reshuffles equal items moves rows under your thumb
     * between one paint and the next.
     */
    const steps = ['a', 'b', 'c', 'd'].map((id) => step({ id }))
    expect(planOrder(steps, []).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reads "blocks" as the same fact said the other way round', () => {
    // the graph has carried both directions since the beginning
    const steps = [step({ id: 'x' }), step({ id: 'y' })]
    expect(planOrder(steps, [blocks('y', 'x')]).map((s) => s.id)).toEqual(['y', 'x'])
  })

  it('keeps finished work at the bottom, in the order it arrived', () => {
    const steps = [
      step({ id: 'done1', status: 'done' }),
      step({ id: 'open1' }),
      step({ id: 'done2', status: 'done' }),
    ]
    expect(planOrder(steps, []).map((s) => s.id)).toEqual(['open1', 'done1', 'done2'])
  })

  it('does not hang, or lose a step, on a plan that disagrees with itself', () => {
    // a cycle is a bad plan, and a bad plan still has to be readable
    const steps = [step({ id: 'a' }), step({ id: 'b' }), step({ id: 'c' })]
    const out = planOrder(steps, [dep('a', 'b'), dep('b', 'a')])
    expect(out).toHaveLength(3)
    expect(new Set(out.map((s) => s.id))).toEqual(new Set(['a', 'b', 'c']))
  })

  it('ignores a dependency on something that is not in this plan', () => {
    // a step waiting on something put away is not held back for ever
    const steps = [step({ id: 'a' }), step({ id: 'b' })]
    expect(planOrder(steps, [dep('a', 'elsewhere')]).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('orders a chain all the way down', () => {
    const steps = ['third', 'first', 'second'].map((id) => step({ id }))
    const out = planOrder(steps, [dep('third', 'second'), dep('second', 'first')]).map((s) => s.id)
    expect(out).toEqual(['first', 'second', 'third'])
  })
})

describe('what is waiting on what', () => {
  const byId = (ts: Thought[]) => new Map(ts.map((t) => [t.id, t]))

  it('names the open thing a step is waiting on', () => {
    const ts = [step({ id: 'a' }), step({ id: 'b' })]
    expect(waitingOn(byId(ts), [dep('b', 'a')]).get('b')).toEqual(['a'])
  })

  it('stops waiting the moment the blocker is finished', () => {
    const ts = [step({ id: 'a', status: 'done' }), step({ id: 'b' })]
    expect(waitingOn(byId(ts), [dep('b', 'a')]).has('b')).toBe(false)
  })

  it('agrees with the Current about what is blocked', () => {
    /*
     * One rule, because two would drift. The Current hides what is blocked and
     * the plan marks it; if those disagreed the app would be saying two
     * different things about the same step on two screens.
     */
    const ts = [step({ id: 'a' }), step({ id: 'b' }), step({ id: 'c' })]
    const rels = [dep('b', 'a'), blocks('a', 'c')]
    const pre = prioritizePrepass(ts, rels, '2026-08-04')
    expect(new Set(waitingOn(byId(ts), rels).keys())).toEqual(pre.blocked)
  })
})

describe('telling a plan from a pile', () => {
  it('is a plan when the steps carry reasons and efforts', () => {
    const ts = [step({ id: 'a', summary: 'because it settles the rest', effort: 2 })]
    expect(hasPlan(ts, [])).toBe(true)
  })

  it('is a plan when the steps have an order between them', () => {
    const ts = [step({ id: 'a' }), step({ id: 'b' })]
    expect(hasPlan(ts, [dep('b', 'a')])).toBe(true)
  })

  it('is not a plan when you just put some things together', () => {
    // a wall of references has no order and no efforts; numbering it would be
    // the app inventing a sequence nobody meant
    const ts = [step({ id: 'a', type: 'note' }), step({ id: 'b', type: 'idea' })]
    expect(hasPlan(ts, [])).toBe(false)
  })

  it('is not fooled by a reason with no effort beside it', () => {
    // both, because a hand-typed step can pick up a summary from elsewhere
    expect(hasPlan([step({ id: 'a', summary: 'a note to self' })], [])).toBe(false)
  })

  it('ignores a dependency that reaches outside the group', () => {
    expect(hasPlan([step({ id: 'a' })], [dep('a', 'somewhere-else')])).toBe(false)
  })
})

describe('how much of a thing a step is', () => {
  it('says nothing at all about a step you wrote yourself', () => {
    // the absence is how you tell which ones are yours
    expect(effortDots(null)).toBe('')
    expect(effortDots(undefined)).toBe('')
  })

  it('reads as a size rather than a number', () => {
    expect(effortDots(1)).toBe('•')
    expect(effortDots(3)).toBe('•••')
  })

  it('cannot run off the row on a bad value', () => {
    expect(effortDots(99)).toBe('•••••')
    expect(effortDots(0)).toBe('•')
  })
})

describe('a nested list, ordered at every level', () => {
  const node = (id: string, parentId: string, p: Partial<Thought> = {}) => ({
    t: step({ id, ...p }),
    parentId,
    depth: parentId === 'root' ? 0 : 1,
  })

  it('orders siblings without taking the nesting apart', () => {
    // a sub-group's contents sit under it, not at the end — that walk is right
    // and stays; this only reorders each set of siblings within it
    const nodes = [node('b', 'root'), node('a', 'root'), node('b1', 'b')]
    const out = orderTree('root', nodes, [dep('b', 'a')]).map((x) => x.t.id)
    expect(out).toEqual(['a', 'b', 'b1'])
  })

  it('keeps a child directly under its parent', () => {
    const nodes = [node('a', 'root'), node('a1', 'a'), node('b', 'root')]
    const out = orderTree('root', nodes, []).map((x) => x.t.id)
    expect(out).toEqual(['a', 'a1', 'b'])
  })

  it('drops nothing when an edge points somewhere unreachable', () => {
    // a malformed parent must not silently remove a row from the page
    const nodes = [node('a', 'root'), node('orphan', 'nowhere')]
    const out = orderTree('root', nodes, []).map((x) => x.t.id)
    expect(out).toHaveLength(2)
    expect(out).toContain('orphan')
  })

  it('does not spin on a parent loop', () => {
    const nodes = [node('a', 'b'), node('b', 'a')]
    expect(orderTree('root', nodes, [])).toHaveLength(2)
  })
})
