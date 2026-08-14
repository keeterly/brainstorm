// Three playtesters could not find their own thoughts — hunted a drifting
// bubble "by luck", asked outright for search, lost a week of writing inside
// the wrong group. Find answers with every thought in every state, and each
// result carries the one act its state calls for.
//
// What counts as a match is domain/find.ts and is tested there; this is about
// what a result lets you do once you have one.
import { describe, expect, it, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Find } from './Find'
import { useGraph } from '@/store/graph'
import type { Thought } from '@/domain/types'

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
  }
}

const ALL: Thought[] = [
  thought({ id: 'done1', raw_content: 'Order care labels', status: 'done', completed_at: '2026-07-30T10:00:00Z' }),
  thought({ id: 'open1', raw_content: 'Renew car insurance by Friday' }),
  thought({ id: 'nap1', raw_content: 'Care package for the studio', status: 'snoozed', snooze_until: '2026-08-09' }),
  thought({ id: 'gone1', raw_content: 'Carefree pop-up idea', status: 'archived' }),
  thought({ id: 'other', raw_content: 'Take care of the venue plants' }),
]

describe('what each result lets you do', () => {
  beforeEach(() => {
    useGraph.setState({
      userId: 'u1',
      hydrated: true,
      offline: false,
      thoughts: ALL.map((t) => ({ ...t })),
      relationships: [],
      roadmaps: [],
      memories: [],
      artifacts: [],
      layouts: {},
    } as never)
  })

  function type(q: string) {
    render(
      <MemoryRouter>
        <Find />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('Find a thought'), { target: { value: q } })
  }

  it('an open thing is a door into the sky', () => {
    type('insurance')
    const link = screen.getByText(/Renew car insurance/).closest('a')
    expect(link?.getAttribute('href')).toBe('/?open=open1')
  })

  it('a resting thing can be woken, clearing both marks of rest', () => {
    type('care package')
    fireEvent.click(screen.getByText('wake it'))
    const t = useGraph.getState().thoughts.find((x) => x.id === 'nap1')!
    expect(t.status).toBe('open')
    expect(t.snooze_until).toBeNull()
  })

  it('a put-away or finished thing can be brought back', () => {
    type('carefree')
    fireEvent.click(screen.getByText('bring it back'))
    expect(useGraph.getState().thoughts.find((x) => x.id === 'gone1')!.status).toBe('open')
  })

  it('says so when nothing holds those words', () => {
    type('zeppelin')
    expect(screen.getByRole('status').textContent).toMatch(/nothing holds those words/)
  })
})
