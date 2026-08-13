import { describe, expect, it } from 'vitest'
import { prioritizePrepass } from './prioritize-prepass'
import type { Relationship, Thought } from './types'

const TODAY = '2026-07-28'

function th(over: Partial<Thought>): Thought {
  return {
    id: over.id ?? crypto.randomUUID(),
    user_id: 'u1',
    raw_content: over.raw_content ?? 'x',
    title: null,
    summary: null,
    type: 'action',
    status: 'open',
    bucket: null,
    source: 'text',
    confidence: null,
    urgency: null,
    importance: null,
    effort: null,
    due_date: null,
    snooze_until: null,
    project_id: null,
    image_path: null,
    extra: {},
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    completed_at: null,
    ...over,
  }
}

function rel(from: string, to: string, type: Relationship['type']): Relationship {
  return {
    id: crypto.randomUUID(),
    user_id: 'u1',
    from_id: from,
    to_id: to,
    type,
    created_by: 'user',
    agent_run_id: null,
    created_at: '2026-07-01T00:00:00Z',
  }
}

describe('what is open, actionable and not waiting on something else', () => {
  it('marks what is waiting on an unfinished thing', () => {
    const a = th({ id: 'a' })
    const b = th({ id: 'b' })
    const r = prioritizePrepass([a, b], [rel('a', 'b', 'depends_on')], TODAY)
    expect(r.blocked.has('a')).toBe(true)
    // …and the thing it is waiting on is not itself held back
    expect(r.blocked.has('b')).toBe(false)
  })

  it('stops waiting the moment the thing it waited on is finished', () => {
    const a = th({ id: 'a' })
    const b = th({ id: 'b', status: 'done' })
    const r = prioritizePrepass([a, b], [rel('a', 'b', 'depends_on')], TODAY)
    expect(r.blocked.has('a')).toBe(false)
  })

  it('reads "blocks" as the same fact said the other way round', () => {
    const a = th({ id: 'a' })
    const b = th({ id: 'b' })
    const r = prioritizePrepass([a, b], [rel('a', 'b', 'blocks')], TODAY)
    expect(r.blocked.has('b')).toBe(true)
  })

  it('hides a future snooze, and wakes a past one', () => {
    const hidden = th({ id: 'hidden', snooze_until: '2026-08-15' })
    const awake = th({ id: 'awake', snooze_until: '2026-07-01' })
    const r = prioritizePrepass([hidden, awake], [], TODAY)
    expect(r.visible.find((t) => t.id === 'hidden')).toBeUndefined()
    expect(r.visible.find((t) => t.id === 'awake')).toBeDefined()
  })

  it('shows only open actions and tasks', () => {
    // a thing classified `note` is out of everything that answers "what next",
    // which is the whole reason a thought's own page says which it is
    const note = th({ id: 'note', type: 'note' })
    const done = th({ id: 'done', status: 'done' })
    const goal = th({ id: 'goal', type: 'goal' })
    const act = th({ id: 'act' })
    const r = prioritizePrepass([note, done, goal, act], [], TODAY)
    expect(r.visible.map((t) => t.id)).toEqual(['act'])
  })

  it('sorts by due date, then by age', () => {
    const late = th({ id: 'late', created_at: '2026-07-10T00:00:00Z' })
    const early = th({ id: 'early', created_at: '2026-07-01T00:00:00Z' })
    const dued = th({ id: 'dued', due_date: '2026-08-01', created_at: '2026-07-20T00:00:00Z' })
    const r = prioritizePrepass([late, early, dued], [], TODAY)
    expect(r.visible.map((t) => t.id)).toEqual(['dued', 'early', 'late'])
  })

  it('says nothing about now, next, later or waiting', () => {
    /*
     * Those four were the Current's — the screen that laid them out in
     * columns. When it went, nothing read them, and a map computed every call
     * and thrown away is cheap enough to sit here for years still describing
     * the app as a thing with four columns of work in it. What is blocked is
     * the one thing that mattered and it has its own name.
     */
    const r = prioritizePrepass([th({ id: 'a', bucket: 'now' })], [], TODAY)
    expect(Object.keys(r).sort()).toEqual(['blocked', 'visible'])
  })
})
