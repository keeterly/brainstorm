import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CurrentPage from './current/CurrentPage'
import { useGraph } from '@/store/graph'
import type { Thought } from '@/domain/types'

function seedStore() {
  useGraph.setState({
    userId: 'u1',
    hydrated: true,
    offline: true, // AI paused — pure-UI smoke tests
    thoughts: [],
    relationships: [],
    roadmaps: [],
    memories: [],
    artifacts: [],
    profile: { id: 'u1', display_name: 'k', settings: {}, created_at: '' },
    layouts: {},
  })
}

function action(over: Partial<Thought> & { id: string; title: string }): Thought {
  return {
    user_id: 'u1',
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
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    completed_at: null,
    ...over,
  }
}

beforeEach(seedStore)

describe('CurrentPage', () => {
  it('names one thing to do first, and shows the rest of the current under it', () => {
    // The rest used to be folded away, which left the lower half of the screen
    // empty under a closed disclosure. One thing is still *the* thing; what is
    // flowing sits quietly below it rather than nowhere.
    useGraph.setState({
      thoughts: [
        action({ id: 'a', title: 'Overdue thing', due_date: '2020-01-01' }),
        action({ id: 'b', title: 'Soon thing', due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }),
      ],
    })
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('This first')).toBeInTheDocument()
    expect(screen.getByText('Overdue thing')).toBeInTheDocument()
    expect(screen.getByText('Soon thing')).toBeInTheDocument()
    // …and it still folds away, for a day when one thing is all you want
    fireEvent.click(screen.getByText(/also in the current/))
    expect(screen.queryByText('Soon thing')).not.toBeInTheDocument()
  })

  it('Focus opens the one-drop overlay', () => {
    useGraph.setState({
      thoughts: [action({ id: 'x', title: 'Do the thing', bucket: 'now' })],
    })
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Focus'))
    expect(screen.getByRole('dialog', { name: 'Focus on one action' })).toBeInTheDocument()
  })
})
