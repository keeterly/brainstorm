// Snoozing from the Current was one tap and a vanished row — to where, for
// how long, it never said. A playtester's whole finding was that sentence.
// Now the page says what went to rest and when it returns, and offers the
// one follow-up that matters: waking it back up.
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
      thought({ id: 't1', title: 'Confirm the venue' }),
      thought({ id: 't2', title: 'Order care labels' }),
    ],
    relationships: [],
    roadmaps: [],
    memories: [],
    artifacts: [],
    profile: { id: 'u1', display_name: 'k', settings: {}, created_at: '' },
    layouts: {},
  })
})

describe('putting something to rest from the Current', () => {
  it('says what went to rest and when it comes back', async () => {
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByLabelText('Snooze one week'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/is resting — back/))
    const rested = useGraph.getState().thoughts.find((t) => !!t.snooze_until)
    expect(rested).toBeTruthy()
    // a week out, not the sky's single day
    const days = Math.round(
      (new Date(rested!.snooze_until as string).getTime() - Date.now()) / 86400000,
    )
    expect(days).toBeGreaterThanOrEqual(6)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('wakes it back up with one tap', async () => {
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByLabelText('Snooze one week'))
    await waitFor(() => screen.getByText('wake it'))
    fireEvent.click(screen.getByText('wake it'))
    await waitFor(() =>
      expect(useGraph.getState().thoughts.every((t) => t.snooze_until === null)).toBe(true),
    )
    expect(screen.queryByText('wake it')).toBeNull()
  })
})
