// "What do I do first" was a question the app answered and never let you
// answer. A playtester came to the app for exactly that and left with her
// priority still in her head: the rules chose, or the agent chose, and there
// was no third option. Now there is, and it writes to the same one slot the
// agent writes to — so the sky, the weather and this page never disagree.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CurrentPage from './CurrentPage'
import { useGraph } from '@/store/graph'
import type { Thought } from '@/domain/types'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))

function thought(over: Partial<Thought> & { id: string; title: string }): Thought {
  return {
    user_id: 'u1',
    raw_content: over.title,
    summary: null,
    type: 'action',
    status: 'open',
    bucket: 'now',
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

beforeEach(() => {
  run.mockReset()
  useGraph.setState({
    userId: 'u1',
    hydrated: true,
    offline: false,
    thoughts: [
      // the rules would put the dated one first; the person may not agree
      thought({ id: 'dated', title: 'Order care labels', due_date: '2026-08-01' }),
      thought({ id: 'mine', title: 'Call the fabric mill' }),
    ],
    relationships: [],
    roadmaps: [],
    memories: [],
    artifacts: [],
    profile: { id: 'u1', display_name: 'k', settings: {}, created_at: '' },
    layouts: {},
  } as never)
})

const show = () =>
  render(
    <MemoryRouter>
      <CurrentPage />
    </MemoryRouter>,
  )

describe('saying what comes first yourself', () => {
  it('puts your pick in the one slot everything reads', () => {
    show()
    fireEvent.click(screen.getByLabelText(/Put “Call the fabric mill” first/))
    const rec = useGraph.getState().profile?.settings.recommended_action
    expect(rec?.id).toBe('mine')
    // the sky prints this reason under the recommendation too, so it has to
    // read as a sentence about you rather than a rule that fired
    expect(rec?.why).toBe('you put this first')
  })

  it('says it was your call, and hands the choice back', async () => {
    show()
    fireEvent.click(screen.getByLabelText(/Put “Call the fabric mill” first/))
    await waitFor(() => expect(screen.getByText(/you put this first/)).toBeTruthy())
    fireEvent.click(screen.getByText('let it choose'))
    await waitFor(() =>
      expect(useGraph.getState().profile?.settings.recommended_action).toBeNull(),
    )
  })

  it('lets go of the pin when the pinned thing is finished', async () => {
    show()
    fireEvent.click(screen.getByLabelText(/Put “Call the fabric mill” first/))
    await waitFor(() => screen.getByText(/you put this first/))
    // the primary card's Done — a pin that outlived its thought would keep
    // recommending something that is no longer there
    fireEvent.click(screen.getByText('Done'))
    await waitFor(() =>
      expect(useGraph.getState().profile?.settings.recommended_action).toBeNull(),
    )
  })
})
