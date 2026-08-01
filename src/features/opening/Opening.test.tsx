import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useGraph } from '@/store/graph'
import Opening, { BARE_MS, FADE_MS, HOLD_MS, NAME } from './Opening'

function state(over: Record<string, unknown>) {
  useGraph.setState({
    hydrated: false,
    thoughts: [],
    relationships: [],
    ...over,
  } as never)
}
const thing = (id: string, type = 'idea') => ({
  id,
  type,
  status: 'open',
  title: id,
  raw_content: id,
  created_at: '2026-01-01T00:00:00Z',
})
const sheet = () => screen.queryByTestId('opening')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
const tick = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe('the opening moment', () => {
  it('is the first thing on screen, before anything is known', () => {
    // The fix for the background arriving in two pieces. This used to wait for
    // the graph and only then cover the screen, so you watched the sky paint
    // itself and then had a full-screen sheet dropped over the top of it.
    state({ hydrated: false, thoughts: [] })
    render(<Opening />)
    expect(sheet()).not.toBeNull()
  })

  it('says the app’s name, a letter at a time', () => {
    state({ hydrated: false })
    render(<Opening />)
    const name = screen.getByLabelText(NAME)
    // one element per letter, each with its own place in the queue, because
    // that is what makes it read as a word forming rather than as ten things
    // animating
    expect(name.children.length).toBe(NAME.length)
    expect(name.textContent).toBe(NAME)
  })

  it('does not sit on a sign-in form waiting for a graph that is not coming', async () => {
    // `hydrate` only runs for a session. Signed out — the sign-in screen, a
    // password reset, a device with no Supabase configured — the store stays
    // unhydrated for ever, and this is an opaque full-screen sheet.
    state({ hydrated: false, thoughts: [thing('a')] })
    render(<Opening />)
    expect(sheet()).not.toBeNull()
    await tick(BARE_MS + FADE_MS + 50)
    expect(sheet()).toBeNull()
  })

  it('stays longer once there is something to read', async () => {
    state({ hydrated: true, thoughts: [thing('a', 'action'), thing('b')] })
    render(<Opening />)
    await tick(BARE_MS + FADE_MS + 50)
    // the short measure is for an empty screen; this one has three numbers on it
    expect(sheet()).not.toBeNull()
    await tick(HOLD_MS)
    expect(sheet()).toBeNull()
  })

  it('shows what state your thinking is in, once there is any', () => {
    state({ hydrated: true, thoughts: [thing('a', 'action'), thing('b')] })
    render(<Opening />)
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('in the works')).toBeInTheDocument()
  })

  it('says nothing but its name for an account with nothing in it', () => {
    // three zeroes is worse than no numbers at all
    state({ hydrated: true, thoughts: [] })
    render(<Opening />)
    expect(sheet()).not.toBeNull()
    expect(screen.queryByText('pending')).toBeNull()
  })

  it('names the one thing to pick up, and why', () => {
    // Three counts on their own are a readout: accurate, and no use. This is
    // the same choice the Current makes, run here on the graph as it lands.
    state({
      hydrated: true,
      thoughts: [{ ...thing('n1', 'action'), title: 'Write the buyer note' }],
    })
    render(<Opening />)
    expect(screen.getByText('start with')).toBeInTheDocument()
    expect(screen.getByText('Write the buyer note')).toBeInTheDocument()
  })

  it('goes away when you touch it, without waiting out the rest', async () => {
    // two seconds is right the first time you open the app today and too long
    // the fourth time
    state({ hydrated: true, thoughts: [thing('a', 'action')] })
    render(<Opening />)
    const el = sheet() as HTMLElement
    await act(async () => {
      // jsdom has no PointerEvent constructor; React listens for the event by
      // name, and an Event with the right type is what reaches the handler
      el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    await tick(FADE_MS + 50)
    expect(sheet()).toBeNull()
  })

  it('finishes leaving even if the graph lands mid-dissolve', async () => {
    // The timers that finish the dissolve are torn down and rebuilt whenever
    // hydration changes. If that happened after it had committed to going, the
    // one that unmounts it would be cancelled — and a fully transparent sheet
    // would sit over the app for ever, invisible and eating every touch.
    state({ hydrated: false, thoughts: [thing('a')] })
    const { rerender } = render(<Opening />)
    await tick(BARE_MS + 20) // it has started to go
    await act(async () => {
      state({ hydrated: true, thoughts: [thing('a')] })
      rerender(<Opening />)
    })
    await tick(FADE_MS + 50)
    expect(sheet()).toBeNull()
  })
})
