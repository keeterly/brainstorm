import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NoticedPanel } from './Noticed'
import { useGraph } from '@/store/graph'
import type { Noticed } from './noticeFlow'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))
vi.mock('@/ai/memoryFlow', () => ({
  learnFacts: vi.fn().mockResolvedValue({ added: 0, updated: 0, archived: 0, knew: 0 }),
}))

/**
 * A sky with `actions` open actions and `notes` open notes.
 *
 * The mix is the whole point. The Current handed the panel
 * `prepass.visible.length` — actions and tasks only — while `lookAgain`
 * recorded every open thought of any type, so the two numbers described
 * different populations. Half of any real graph is questions, ideas and
 * groups, so they drifted past the four-item threshold immediately and the
 * panel said "this has gone stale" from the second it was written. It has
 * never once said "looked today".
 */
function seed(actions: number, notes: number, noticed?: Partial<Noticed>) {
  useGraph.setState({
    userId: 'u1',
    hydrated: true,
    offline: false,
    thoughts: [],
    relationships: [],
    memories: [],
    memoryEvents: [],
    artifacts: [],
    roadmaps: [],
    layouts: {},
    profile: { id: 'u1', display_name: 'k', settings: {}, created_at: new Date().toISOString() },
  } as never)
  const s = useGraph.getState()
  for (let i = 0; i < actions; i++) s.addThought({ raw_content: `do ${i}`, title: `do ${i}`, type: 'action' })
  for (let i = 0; i < notes; i++) s.addThought({ raw_content: `idea ${i}`, title: `idea ${i}`, type: 'idea' })
  if (noticed) {
    s.updateProfileSettings({
      noticed: {
        read: 'You start structural things and finish visual ones.',
        pressing: [],
        suggestions: [],
        learned: [],
        atISO: new Date().toISOString(),
        sawCount: actions + notes,
        ...noticed,
      },
    })
  }
}

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: { read: 'a fresh read', pressing: [], suggestions: [], learned: [] } })
})

describe('what the app says it noticed', () => {
  it('says when it looked, instead of calling a read written seconds ago stale', async () => {
    seed(3, 6, {})
    render(
      <MemoryRouter>
        <NoticedPanel />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText(/what I notice/))
    await waitFor(() => expect(screen.getByText(/looked today/)).toBeTruthy())
    expect(screen.queryByText(/gone stale/)).toBeNull()
  })

  it('goes stale when the sky has genuinely moved on', async () => {
    seed(3, 6, { sawCount: 2 })
    render(
      <MemoryRouter>
        <NoticedPanel />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText(/what I notice/))
    await waitFor(() => expect(screen.getByText(/gone stale/)).toBeTruthy())
  })

  it('counts everything that is open, not only what can be ticked off', async () => {
    // nine thoughts, three of them actions: the panel is speaking about all
    // nine, so it has to count all nine
    seed(3, 6, {})
    render(
      <MemoryRouter>
        <NoticedPanel />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText(/what I notice/))
    await waitFor(() => expect(screen.getByText(/looked today/)).toBeTruthy())
    useGraph.getState().addThought({ raw_content: 'and another', title: 'and another', type: 'idea' })
    useGraph.getState().addThought({ raw_content: 'and more', title: 'and more', type: 'idea' })
    useGraph.getState().addThought({ raw_content: 'and more still', title: 'and more still', type: 'idea' })
    useGraph.getState().addThought({ raw_content: 'enough', title: 'enough', type: 'idea' })
    await waitFor(() => expect(screen.getByText(/gone stale/)).toBeTruthy())
  })

  it('says so when the look does not come back', async () => {
    // it used to swallow the error and render nothing: the spinner stopped and
    // the button reverted, which reads exactly like nothing having happened
    seed(5, 5)
    run.mockRejectedValue(new Error('offline'))
    render(
      <MemoryRouter>
        <NoticedPanel />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/did not come back/)).toBeTruthy())
  })

  it('lets you take a suggestion, instead of only being told about it', async () => {
    // Three of `notice`'s four output fields were write-only. Its suggestions
    // are "moves worth making now" and there was no button on any of them: an
    // agent that says what you should do and cannot help you do it, on the
    // surface you look at every day.
    seed(3, 6, {
      suggestions: [{ title: 'Pick the one feeling the room has to leave people with', why: 'two things wait on it' }],
    })
    render(
      <MemoryRouter>
        <NoticedPanel />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText(/what I notice/))
    fireEvent.click(await screen.findByText('keep it'))
    const made = useGraph.getState().thoughts.find((t) => t.title?.startsWith('Pick the one feeling'))
    expect(made).toBeTruthy()
    expect(made?.summary).toBe('two things wait on it')
    expect(made?.status).toBe('open')
  })

  it('stops suggesting the thing you just took', async () => {
    seed(3, 6, { suggestions: [{ title: 'Write the buyer note', why: 'the season turns in a fortnight' }] })
    render(
      <MemoryRouter>
        <NoticedPanel />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText(/what I notice/))
    fireEvent.click(await screen.findByText('keep it'))
    await waitFor(() => expect(screen.queryByText('keep it')).toBeNull())
  })

  it('hangs it off the thought it came from', async () => {
    seed(3, 6)
    const s = useGraph.getState()
    const goal = s.addThought({ raw_content: 'SS27 campaign', title: 'SS27 campaign', type: 'goal' })
    s.updateProfileSettings({
      noticed: {
        read: '',
        pressing: [],
        suggestions: [{ title: 'Book the space', why: 'everything else waits on a date', from: goal.id }],
        learned: [],
        atISO: new Date().toISOString(),
        sawCount: useGraph.getState().thoughts.filter((t) => t.status === 'open').length,
      },
    })
    render(
      <MemoryRouter>
        <NoticedPanel />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText(/what I notice/))
    fireEvent.click(await screen.findByText('keep it'))
    const made = useGraph.getState().thoughts.find((t) => t.title === 'Book the space')
    expect(
      useGraph.getState().relationships.some((r) => r.from_id === made?.id && r.to_id === goal.id && r.type === 'part_of'),
    ).toBe(true)
  })

  it('makes a question a question, the same way the rest of the app does', async () => {
    seed(3, 6, { suggestions: [{ title: 'What does the lab charge for hand processing?', why: 'the budget turns on it' }] })
    render(
      <MemoryRouter>
        <NoticedPanel />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText(/what I notice/))
    fireEvent.click(await screen.findByText('keep it'))
    const made = useGraph.getState().thoughts.find((t) => t.title?.startsWith('What does the lab'))
    expect(made?.type).toBe('question')
  })
})
