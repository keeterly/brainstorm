import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CurrentPage from './CurrentPage'
import { Answered } from './Answered'
import { useGraph } from '@/store/graph'
import type { AnswerOutput } from '@shared/ai/actions/answer'
import type { Thought } from '@/domain/types'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))

const OUT: AnswerOutput = {
  asked: 'What does LAX→CDG premium economy cost, Sept 28 out / Oct 9 back?',
  answer: '$1,180–$1,420 round trip. Air France is showing $1,214 direct on AF65/AF66 for those exact dates.',
  facts: [{ label: 'Cheapest found', value: '$1,214 round trip', note: 'AF65 out, AF66 back, booked direct' }],
  asOf: 'Checked today; these move daily.',
  unknown: [{ what: 'The live ITA fare basis', toKnow: 'ITA cannot be queried programmatically — run it yourself' }],
  next: [],
  sources: [{ title: 'Air France', url: 'https://wwws.airfrance.us/x' }],
  learned: [],
  settled: true,
}

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

function seed(title: string) {
  useGraph.setState({
    userId: 'u1',
    hydrated: true,
    offline: false,
    thoughts: [thought({ id: 'q1', title })],
    relationships: [],
    roadmaps: [],
    memories: [],
    artifacts: [],
    profile: { id: 'u1', display_name: 'k', settings: {}, created_at: '' },
    layouts: {},
  })
}

// Asking now costs two calls: a cheap read that decides how much looking-up
// this one needs, then the answer itself at that depth.
const GAUGED = { depth: 'deep', needs: ['live fares for those dates'], why: 'checking the fares' }
let answerFails: Error | null = null

beforeEach(() => {
  answerFails = null
  run.mockReset()
  run.mockImplementation(async (action: string) => {
    if (action === 'gauge') return { runId: null, output: GAUGED }
    if (answerFails) throw answerFails
    return { runId: 'r1', output: OUT }
  })
})

describe('the one thing to do, when it is a question', () => {
  const QUESTION = 'Pull live LAX→CDG premium economy fares, Sept 28 out / Oct 9 back'

  it('offers to go and find out, first', () => {
    // this is the screen the whole thing was asked for: it used to offer only
    // Focus (sit and stare at it) and Done (pretend you did)
    seed(QUESTION)
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Answer it')).toBeInTheDocument()
  })

  it('offers nothing of the kind for a job of work', () => {
    seed('Book once the fare is confirmed reasonable')
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Answer it')).not.toBeInTheDocument()
    expect(screen.getByText('Focus')).toBeInTheDocument()
  })

  it('puts the answer under the question rather than filing it somewhere', async () => {
    seed(QUESTION)
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Answer it'))
    await waitFor(() => expect(screen.getByText(/\$1,180–\$1,420 round trip/)).toBeInTheDocument())
    expect(screen.getByText('$1,214 round trip')).toBeInTheDocument()
    // and it says what it could not settle, rather than presenting a range as
    // a price
    expect(screen.getByText(/ITA cannot be queried programmatically/)).toBeInTheDocument()
    expect(screen.getByText('Checked today; these move daily.')).toBeInTheDocument()
  })

  it('says so, in the user’s words, when it could not get out there', async () => {
    seed(QUESTION)
    answerFails = new Error('offline')
    render(
      <MemoryRouter>
        <CurrentPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Answer it'))
    await waitFor(() => expect(screen.getByText('try again')).toBeInTheDocument())
    expect(screen.getByText(/offline/)).toBeInTheDocument()
  })
})

describe('the answer card', () => {
  it('closes the question when the answer was the whole of it', () => {
    const onDone = vi.fn()
    render(<Answered out={OUT} onDone={onDone} />)
    fireEvent.click(screen.getByText(/That’s it/))
    expect(onDone).toHaveBeenCalled()
  })

  it('does not offer to close one that still needs acting on', () => {
    render(<Answered out={{ ...OUT, settled: false }} onDone={() => {}} />)
    expect(screen.queryByText(/That’s it/)).not.toBeInTheDocument()
  })

  it('names a source by the page, and opens it away from the app', () => {
    // two links to the same site both reading "airfrance.us" name neither
    render(<Answered out={OUT} />)
    const a = screen.getByText('Air France').closest('a')!
    expect(a.getAttribute('href')).toBe('https://wwws.airfrance.us/x')
    expect(a.getAttribute('rel')).toContain('noopener')
  })

  it('falls back to the host when the source came back unnamed', () => {
    render(<Answered out={{ ...OUT, sources: [{ title: '', url: 'https://wwws.airfrance.us/x' }] }} />)
    expect(screen.getByText('wwws.airfrance.us')).toBeInTheDocument()
  })
})
