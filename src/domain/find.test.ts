import { describe, expect, it } from 'vitest'
import { findThoughts } from './find'
import type { Thought } from './types'

function thought(over: Partial<Thought> & { id: string; raw_content: string }): Thought {
  return {
    user_id: 'u1',
    title: null,
    summary: null,
    type: 'idea',
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
  } as Thought
}

const ALL: Thought[] = [
  thought({ id: 'open1', raw_content: 'Renew car insurance' }),
  thought({ id: 'done1', raw_content: 'Careful with the hem', status: 'done', completed_at: '2026-07-20T00:00:00Z' }),
  thought({ id: 'nap1', raw_content: 'Care package for the studio', status: 'snoozed', snooze_until: '2026-08-09' }),
  thought({ id: 'gone1', raw_content: 'Carefree pop-up idea', status: 'archived' }),
  thought({ id: 'other', raw_content: 'Take care of the venue plants' }),
]

describe('finding a thought by the words in it', () => {
  it('needs two letters before it answers', () => {
    expect(findThoughts(ALL, 'c')).toHaveLength(0)
    expect(findThoughts(ALL, '  ')).toHaveLength(0)
  })

  it('searches title, body and summary, not just one of them', () => {
    const titled = thought({ id: 't', raw_content: 'x', title: 'Wax seals' })
    const summed = thought({ id: 's', raw_content: 'y', summary: 'about wax seals' })
    expect(findThoughts([titled, summed], 'wax').map((t) => t.id)).toEqual(['t', 's'])
  })

  it('puts what you can still act on first', () => {
    // "care" hits all four states; the open one leads, the finished one ends
    const ids = findThoughts(ALL, 'care').map((t) => t.id)
    expect(ids[0]).toBe('other')
    expect(ids[ids.length - 1]).toBe('done1')
  })

  it('does not reshuffle equal results between keystrokes', () => {
    /*
     * The sort runs on every character typed and its output is on screen while
     * a thumb is coming down on it. Two things updated in the same millisecond
     * have to come back in the same order every time, or the row you were
     * reaching for moves out from under you.
     */
    const a = thought({ id: 'a', raw_content: 'wax one' })
    const b = thought({ id: 'b', raw_content: 'wax two' })
    expect(findThoughts([a, b], 'wax').map((t) => t.id)).toEqual(['a', 'b'])
    expect(findThoughts([a, b], 'wax').map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('is not case sensitive, in either direction', () => {
    const t = thought({ id: 'x', raw_content: 'The Lyon MILL' })
    expect(findThoughts([t], 'lyon')).toHaveLength(1)
    expect(findThoughts([t], 'MILL')).toHaveLength(1)
  })
})
