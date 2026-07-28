import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CollectPage from './collect/CollectPage'
import CurrentPage from './current/CurrentPage'
import { useGraph } from '@/store/graph'

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

beforeEach(seedStore)

describe('CollectPage', () => {
  it('captures a plain thought optimistically', () => {
    render(
      <MemoryRouter>
        <CollectPage />
      </MemoryRouter>,
    )
    const ta = screen.getByTestId('capture-input')
    fireEvent.change(ta, { target: { value: 'test a messy thought' } })
    fireEvent.click(screen.getByText('Capture'))
    expect(useGraph.getState().thoughts).toHaveLength(1)
    expect(screen.getByText('test a messy thought')).toBeInTheDocument()
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
  it("renders today's flow from the deterministic prepass", () => {
    seedStore()
    const base = {
      user_id: 'u1',
      raw_content: '',
      summary: null,
      type: 'action' as const,
      status: 'open' as const,
      bucket: null,
      source: 'text' as const,
      confidence: null,
      urgency: null,
      importance: null,
      effort: null,
      snooze_until: null,
      project_id: null,
      image_path: null,
      extra: {},
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
      completed_at: null,
    }
    useGraph.setState({
      thoughts: [
        { ...base, id: 'a', title: 'Overdue thing', due_date: '2020-01-01' },
        { ...base, id: 'b', title: 'Soon thing', due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) },
      ],
    })
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Now')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
    expect(screen.getByText('Overdue thing')).toBeInTheDocument()
    expect(screen.getByText('Soon thing')).toBeInTheDocument()
  })

  it('tapping an action opens the focus overlay', () => {
    seedStore()
    useGraph.setState({
      thoughts: [
        {
          user_id: 'u1',
          raw_content: 'do the thing',
          summary: null,
          type: 'action',
          status: 'open',
          bucket: 'now',
          source: 'text',
          confidence: null,
          urgency: null,
          importance: null,
          effort: null,
          snooze_until: null,
          project_id: null,
          image_path: null,
          extra: {},
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-01T00:00:00Z',
          completed_at: null,
          id: 'x',
          title: 'Do the thing',
          due_date: null,
        },
      ],
    })
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Do the thing'))
    expect(screen.getByRole('dialog', { name: 'Focus on one action' })).toBeInTheDocument()
  })
})
