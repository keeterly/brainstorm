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

  it('says when it was last actually needed, once you ask', () => {
    seed([mem({ content: 'writes to buyers plainly', last_used_at: new Date().toISOString() })])
    show()
    // not before: this page is a list you scan, and four lines per memory is
    // a wall you scroll past rather than a thing you can check
    expect(screen.queryByText(/last used today/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /writes to buyers plainly/ }))
    expect(screen.getByText(/last used today/)).toBeTruthy()
  })

  it('says "all of them in use" rather than the same number twice', () => {
    // "3 things kept · 3 leaned on this week" is a true sentence that says
    // nothing — the ranker carries twelve a run, so on a small memory
    // everything gets carried and the count is the total wearing a hat
    seed([
      mem({ content: 'a', last_used_at: new Date().toISOString() }),
      mem({ content: 'b', last_used_at: new Date().toISOString() }),
    ])
    show()
    expect(screen.getByText(/2 things kept, all of them in use/)).toBeTruthy()
    expect(screen.queryByText(/2 leaned on this week/)).toBeNull()
  })
})

describe('a memory you can scan', () => {
  const long =
    'Tends to open many parallel threads and spec multiple angles of one mechanism as separate deliverables'

  it('reads first and edits second, the way a thing in the sky does', () => {
    seed([mem({ content: long, last_used_at: new Date().toISOString() })])
    show()
    // the first tap used to drop straight into a text field, so the only way
    // to read the whole of a long memory was to start editing it
    fireEvent.click(screen.getByRole('button', { name: new RegExp(long.slice(0, 30)) }))
    expect(screen.queryByRole('textbox', { name: /What it remembers/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('textbox', { name: /What it remembers/ })).toBeTruthy()
  })

  it('keeps a long one to one line until it is opened', () => {
    // used, so it does not also appear in the never-needed fold and match twice
    seed([mem({ content: long, last_used_at: new Date().toISOString() })])
    show()
    const row = screen.getByRole('button', { name: new RegExp(long.slice(0, 30)) })
    expect(row.style.textOverflow).toBe('ellipsis')
    /*
     * …and every box between it and the card has to be allowed to shrink.
     * A grid item and a flex item both default to `min-width: auto` — "at
     * least as wide as my content" — so without these the row does not
     * ellipsise, it widens its track, the card, and the page. The first build
     * of this shipped a page-wide horizontal scroll with the title hanging
     * off the left edge.
     */
    expect(row.style.minWidth).toBe('0')
    const flex = row.parentElement as HTMLElement
    expect(flex.style.minWidth).toBe('0')
    expect((flex.parentElement as HTMLElement).style.minWidth).toBe('0')
    const track = flex.parentElement?.parentElement as HTMLElement
    expect(track.style.gridTemplateColumns).toBe('minmax(0, 1fr)')
    fireEvent.click(row)
    expect(row.style.textOverflow).toBe('')
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

describe('memory that can grow to a hundred', () => {
  const many = (n: number, kind: string, tag = 'item') =>
    Array.from({ length: n }, (_, i) =>
      mem({ content: `${tag} ${i}`, kind, last_used_at: new Date().toISOString() }),
    )

  it('separates what governs everything from what has to be about the ask', () => {
    /*
     * Eight equal buckets in a row meant a constraint that shapes every piece
     * of work the app does looked exactly like a fact about one supplier. And
     * at a hundred memories the situational half — facts accumulate fastest
     * and matter least — buries the governing half entirely.
     */
    seed([...many(3, 'constraint', 'rule'), ...many(20, 'fact', 'detail')])
    show()
    expect(screen.getByText('Always true of you')).toBeTruthy()
    expect(screen.getByText(/Carried on every request/)).toBeTruthy()
    expect(screen.getByText('When it comes up')).toBeTruthy()
  })

  it('puts the situational half away once there is a lot of it', () => {
    seed([...many(2, 'preference', 'want'), ...many(20, 'fact', 'detail')])
    show()
    const fold = screen.getByText('When it comes up').closest('details')
    expect(fold).toBeTruthy()
    // the governing half is never folded: it is the half worth reading
    expect(screen.getByText('Always true of you').closest('details')).toBeNull()
  })

  it('leaves a small memory alone, unfolded and unfiltered', () => {
    // a filter is a control asking to be used on four things
    seed([...many(2, 'constraint', 'rule'), ...many(2, 'fact', 'detail')])
    show()
    expect(screen.queryByLabelText('Filter what it knows about you')).toBeNull()
    expect(screen.getByText('When it comes up').closest('details')).toBeNull()
  })

  it('offers a way through it once there is enough to need one', () => {
    seed(many(14, 'fact', 'detail'))
    show()
    const box = screen.getByLabelText('Filter what it knows about you')
    fireEvent.change(box, { target: { value: 'detail 3' } })
    expect(screen.getAllByRole('button', { name: /detail 3/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^detail 7$/ })).toBeNull()
  })

  it('says so rather than looking empty when the filter matches nothing', () => {
    seed(many(14, 'fact', 'detail'))
    show()
    fireEvent.change(screen.getByLabelText('Filter what it knows about you'), {
      target: { value: 'zzzz' },
    })
    expect(screen.getByText(/Nothing it knows matches that/)).toBeTruthy()
  })

  it('counts the whole of what it knows, not what the filter left', () => {
    // the line under the heading is a fact about your memory; a filter is a
    // way of looking at it, and must not appear to shrink it
    seed(many(14, 'fact', 'detail'))
    show()
    fireEvent.change(screen.getByLabelText('Filter what it knows about you'), {
      target: { value: 'detail 1' },
    })
    expect(screen.getByText(/14 things kept/)).toBeTruthy()
  })
})
