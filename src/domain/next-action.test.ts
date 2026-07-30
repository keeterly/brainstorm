import { describe, expect, it } from 'vitest'
import { nextAction } from './next-action'
import type { Relationship, Thought } from './types'

const TODAY = '2026-07-30'
const ago = (n: number) => {
  const d = new Date('2026-07-30T12:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
const on = (n: number) => {
  const d = new Date('2026-07-30T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

let seq = 0
function act(over: Partial<Thought> & { title: string }): Thought {
  seq++
  return {
    id: over.id ?? `t${seq}`,
    user_id: 'u',
    raw_content: over.title,
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
    created_at: ago(1),
    updated_at: ago(1),
    completed_at: null,
    ...over,
  } as Thought
}
const dep = (from: string, to: string, type: Relationship['type'] = 'depends_on'): Relationship => ({
  id: `r-${from}-${to}`,
  user_id: 'u',
  from_id: from,
  to_id: to,
  type,
  created_by: 'user',
  agent_run_id: null,
  created_at: ago(1),
})

describe('what to do next', () => {
  it('says nothing when there is nothing, rather than filling the space', () => {
    expect(nextAction([], [], TODAY)).toBeNull()
    expect(nextAction([act({ title: 'done it', status: 'done' })], [], TODAY)).toBeNull()
    // an idea is not an action; you cannot do it
    expect(nextAction([act({ title: 'a thought', type: 'idea' })], [], TODAY)).toBeNull()
  })

  it('puts a late thing above everything else', () => {
    const late = act({ id: 'late', title: 'Send the invoice', due_date: on(-3) })
    const soon = act({ id: 'soon', title: 'Book the studio', due_date: on(1) })
    const r = nextAction([soon, late], [], TODAY)!
    expect(r.thought.id).toBe('late')
    expect(r.why).toBe('3 days late')
  })

  it('counts one day late as a day, not as 1 days', () => {
    const r = nextAction([act({ title: 'x', due_date: on(-1) })], [], TODAY)!
    expect(r.why).toBe('a day late')
  })

  it('then today', () => {
    const r = nextAction(
      [act({ id: 'later', title: 'later', due_date: on(4) }), act({ id: 'now', title: 'now', due_date: TODAY })],
      [],
      TODAY,
    )!
    expect(r.thought.id).toBe('now')
    expect(r.why).toBe('due today')
  })

  it('then the thing holding up the most other work — the reason you would never work out yourself', () => {
    const key = act({ id: 'key', title: 'Register the LLC' })
    const a = act({ id: 'a', title: 'Open the bank account' })
    const b = act({ id: 'b', title: 'Apply for the loan' })
    const c = act({ id: 'c', title: 'File for the licence' })
    const idle = act({ id: 'idle', title: 'Tidy the studio' })
    const r = nextAction([idle, a, b, c, key], [dep('a', 'key'), dep('b', 'key'), dep('c', 'key')], TODAY)!
    expect(r.thought.id).toBe('key')
    expect(r.why).toBe('3 things are waiting on it')
  })

  it('counts a blocks edge the same way, from the other end', () => {
    const key = act({ id: 'key', title: 'Get the samples back' })
    const a = act({ id: 'a', title: 'Shoot the lookbook' })
    const r = nextAction([a, key], [dep('key', 'a', 'blocks')], TODAY)!
    expect(r.thought.id).toBe('key')
    expect(r.why).toBe('one thing is waiting on it')
  })

  it('never recommends something that is itself blocked', () => {
    const blocked = act({ id: 'blocked', title: 'Apply for the loan', due_date: on(-9) })
    const blocker = act({ id: 'blocker', title: 'Register the LLC' })
    const r = nextAction([blocked, blocker], [dep('blocked', 'blocker')], TODAY)!
    expect(r.thought.id).toBe('blocker')
  })

  it('then what is due soonest', () => {
    const r = nextAction(
      [act({ id: 'far', title: 'far', due_date: on(9) }), act({ id: 'near', title: 'near', due_date: on(2) })],
      [],
      TODAY,
    )!
    expect(r.thought.id).toBe('near')
    expect(r.why).toBe('due in 2 days')
    expect(nextAction([act({ title: 'x', due_date: on(1) })], [], TODAY)!.why).toBe('due tomorrow')
  })

  it('with nothing pressing, offers the smallest thing — starting is the difficulty', () => {
    const r = nextAction(
      [act({ id: 'big', title: 'Rebuild the site', effort: 5 }), act({ id: 'small', title: 'Email Mei', effort: 1 })],
      [],
      TODAY,
    )!
    expect(r.thought.id).toBe('small')
    expect(r.why).toBe('the smallest thing in reach')
  })

  it('otherwise the one that has been waiting longest, which is the one being avoided', () => {
    const old = act({ id: 'old', title: 'Call the accountant', created_at: ago(11) })
    const fresh = act({ id: 'fresh', title: 'Buy tape', created_at: ago(0) })
    const r = nextAction([fresh, old], [], TODAY)!
    expect(r.thought.id).toBe('old')
    expect(r.why).toBe('waiting 11 days')
  })

  it('does not scold you about something you thought of this morning', () => {
    const r = nextAction([act({ title: 'Buy tape', created_at: ago(0) })], [], TODAY)!
    expect(r.why).toBe('nothing is pressing — start here')
  })

  it('leaves out what you have put to sleep', () => {
    const resting = act({ id: 'resting', title: 'resting', snooze_until: on(3), due_date: on(-5) })
    const awake = act({ id: 'awake', title: 'awake' })
    expect(nextAction([resting, awake], [], TODAY)!.thought.id).toBe('awake')
  })

  it('always gives a reason, whatever the sky looks like', () => {
    const skies: Thought[][] = [
      [act({ title: 'a' })],
      [act({ title: 'a', due_date: on(-1) }), act({ title: 'b', effort: 2 })],
      [act({ title: 'a', effort: 3 }), act({ title: 'b', effort: 3 })],
      [act({ title: 'a', bucket: 'now' }), act({ title: 'b', bucket: 'later' })],
    ]
    for (const sky of skies) {
      const r = nextAction(sky, [], TODAY)
      expect(r).not.toBeNull()
      expect(r!.why.length).toBeGreaterThan(3)
      expect(r!.why).not.toMatch(/undefined|NaN|null/)
    }
  })
})
