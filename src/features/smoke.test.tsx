import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CollectPage from './collect/CollectPage'
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

describe('CollectPage', () => {
  it('captures a thought and shows only the quiet skyline — no list', () => {
    render(
      <MemoryRouter>
        <CollectPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByTestId('capture-input'), { target: { value: 'test a messy thought' } })
    fireEvent.click(screen.getByText('Capture'))
    expect(useGraph.getState().thoughts).toHaveLength(1)
    expect(screen.getByText(/1 thought in the sky/)).toBeInTheDocument()
    // reduce cognitive load: the captured text is NOT listed on Collect
    expect(screen.queryByText('test a messy thought')).not.toBeInTheDocument()
  })

  it('heading + bullets becomes a goal with part_of steps', () => {
    render(
      <MemoryRouter>
        <CollectPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByTestId('capture-input'), {
      target: { value: 'Launch plan:\n- step one\n- step two' },
    })
    fireEvent.click(screen.getByText('Capture'))
    const s = useGraph.getState()
    expect(s.thoughts.find((t) => t.type === 'goal')?.title).toBe('Launch plan')
    expect(s.thoughts.filter((t) => t.type === 'action')).toHaveLength(2)
    expect(s.relationships.filter((r) => r.type === 'part_of')).toHaveLength(2)
  })
})

describe('CurrentPage', () => {
  it('surfaces exactly one primary action; the rest stay folded', () => {
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
    expect(screen.queryByText('Soon thing')).not.toBeInTheDocument() // folded
    fireEvent.click(screen.getByText(/1 more in the current/))
    expect(screen.getByText('Soon thing')).toBeInTheDocument()
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
