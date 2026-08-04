import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MemoryPage from './MemoryPage'
import { useGraph } from '@/store/graph'
import type { Memory } from '@/domain/types'

const DAY = 86_400_000

function mem(p: Partial<Memory>): Memory {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    user_id: 'u',
    content: 'a thing',
    source: 'learned',
    created_at: new Date(Date.now() - 60 * DAY).toISOString(),
    ...p,
  }
}

function seed(memories: Memory[]) {
  useGraph.setState({ memories, thoughts: [], memoryEvents: [], offline: false })
}

const show = () =>
  render(
    <MemoryRouter>
      <MemoryPage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.restoreAllMocks()
  seed([])
})

describe('the page shows its own claim being kept', () => {
  it('says how much of what it knows is actually being used', () => {
    // "It picks from this for whatever you are working on" was unverifiable
    // from the only screen it appears on, and an unverifiable claim about what
    // a thing knows about you is worth less than no claim
    seed([
      mem({ content: 'writes to buyers plainly', last_used_at: new Date(Date.now() - DAY).toISOString() }),
      mem({ content: 'never travels in production weeks', last_used_at: new Date(Date.now() - 2 * DAY).toISOString() }),
      mem({ content: 'the supplier in Como', last_used_at: null }),
    ])
    show()
    expect(screen.getByText(/3 things kept · 2 leaned on this week/)).toBeTruthy()
  })

  it('does not dress up a memory nothing has touched', () => {
    seed([mem({ content: 'the supplier in Como', last_used_at: null })])
    show()
    expect(screen.getByText(/None of them has been needed this week/)).toBeTruthy()
  })

  it('is silent rather than saying "0 things kept" on an empty memory', () => {
    show()
    expect(screen.queryByText(/things kept/)).toBeNull()
  })

  it('says when each one was last actually needed', () => {
    seed([
      mem({ content: 'writes to buyers plainly', last_used_at: new Date().toISOString() }),
      mem({ content: 'the supplier in Como', last_used_at: null }),
    ])
    show()
    expect(screen.getByText(/last used today/)).toBeTruthy()
    expect(screen.getAllByText(/never needed yet/).length).toBeGreaterThan(0)
  })
})

describe('what has ridden along unread', () => {
  it('collects what has never once been carried, and forgets one on request', () => {
    const del = vi.fn()
    seed([mem({ id: 'm1', content: 'the supplier in Como', last_used_at: null })])
    useGraph.setState({ deleteMemory: del } as never)
    show()
    const fold = screen.getByText('What it has never needed').closest('details') as HTMLElement
    expect(fold).toBeTruthy()
    fireEvent.click(within(fold).getByRole('button', { name: /Forget: the supplier in Como/ }))
    expect(del).toHaveBeenCalledWith('m1')
  })

  it('gives something written this morning a fair chance first', () => {
    // nothing written today has been used today, because nothing has happened
    // yet — listing it as dead weight the same day is the app telling you off
    // for having just used it
    seed([mem({ content: 'just written', created_at: new Date().toISOString(), last_used_at: null })])
    show()
    expect(screen.queryByText('What it has never needed')).toBeNull()
  })

  it('stays away entirely while everything is earning its place', () => {
    seed([mem({ content: 'writes to buyers plainly', last_used_at: new Date().toISOString() })])
    show()
    expect(screen.queryByText('What it has never needed')).toBeNull()
  })
})
