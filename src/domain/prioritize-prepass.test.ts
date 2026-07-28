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

describe('prioritizePrepass', () => {
  it('unmet depends_on lands in waiting', () => {
    const a = th({ id: 'a' })
    const b = th({ id: 'b' })
    const r = prioritizePrepass([a, b], [rel('a', 'b', 'depends_on')], TODAY)
    expect(r.buckets.get('a')).toBe('waiting')
    expect(r.blocked.has('a')).toBe(true)
    expect(r.buckets.get('b')).toBe('later')
  })

  it('dependency on a DONE thought does not block', () => {
    const a = th({ id: 'a' })
    const b = th({ id: 'b', status: 'done' })
    const r = prioritizePrepass([a, b], [rel('a', 'b', 'depends_on')], TODAY)
    expect(r.buckets.get('a')).toBe('later')
  })

  it('blocks edge marks the target as waiting', () => {
    const a = th({ id: 'a' })
    const b = th({ id: 'b' })
    const r = prioritizePrepass([a, b], [rel('a', 'b', 'blocks')], TODAY)
    expect(r.buckets.get('b')).toBe('waiting')
  })

  it('overdue and due-today go to now; due-this-week to next', () => {
    const over = th({ id: 'over', due_date: '2026-07-20' })
    const today = th({ id: 'today', due_date: TODAY })
    const week = th({ id: 'week', due_date: '2026-08-01' })
    const far = th({ id: 'far', due_date: '2026-09-20' })
    const r = prioritizePrepass([over, today, week, far], [], TODAY)
    expect(r.buckets.get('over')).toBe('now')
    expect(r.buckets.get('today')).toBe('now')
    expect(r.buckets.get('week')).toBe('next')
    expect(r.buckets.get('far')).toBe('later')
  })

  it('future snooze hides the action; past snooze wakes it', () => {
    const hidden = th({ id: 'hidden', snooze_until: '2026-08-15' })
    const awake = th({ id: 'awake', snooze_until: '2026-07-01' })
    const r = prioritizePrepass([hidden, awake], [], TODAY)
    expect(r.visible.find((t) => t.id === 'hidden')).toBeUndefined()
    expect(r.visible.find((t) => t.id === 'awake')).toBeDefined()
  })

  it('manual bucket wins unless blocked', () => {
    const manual = th({ id: 'manual', bucket: 'now' })
    const blocked = th({ id: 'blocked', bucket: 'now' })
    const dep = th({ id: 'dep' })
    const r = prioritizePrepass([manual, blocked, dep], [rel('blocked', 'dep', 'depends_on')], TODAY)
    expect(r.buckets.get('manual')).toBe('now')
    expect(r.buckets.get('blocked')).toBe('waiting')
  })

  it('only open actions/tasks appear', () => {
    const note = th({ id: 'note', type: 'note' })
    const done = th({ id: 'done', status: 'done' })
    const goal = th({ id: 'goal', type: 'goal' })
    const act = th({ id: 'act' })
    const r = prioritizePrepass([note, done, goal, act], [], TODAY)
    expect(r.visible.map((t) => t.id)).toEqual(['act'])
  })

  it('sorts by due date then age', () => {
    const late = th({ id: 'late', created_at: '2026-07-10T00:00:00Z' })
    const early = th({ id: 'early', created_at: '2026-07-01T00:00:00Z' })
    const dued = th({ id: 'dued', due_date: '2026-08-01', created_at: '2026-07-20T00:00:00Z' })
    const r = prioritizePrepass([late, early, dued], [], TODAY)
    expect(r.visible.map((t) => t.id)).toEqual(['dued', 'early', 'late'])
  })
})
