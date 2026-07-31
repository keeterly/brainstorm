import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useGraph } from '@/store/graph'
import Opening from './Opening'

function state(over: Record<string, unknown>) {
  useGraph.setState({
    hydrated: false,
    thoughts: [],
    relationships: [],
    ...over,
  } as never)
}
const thing = (id: string, type = 'idea') => ({ id, type, status: 'open' })
const sheet = () => screen.queryByTestId('opening')

describe('the opening moment', () => {
  it('is not there at all before anyone has signed in', () => {
    // `hydrate` only runs for a session. Signed out — the sign-in screen, a
    // password reset, a device with no Supabase configured — the store stays
    // unhydrated for ever, and a full-screen opaque sheet that waits for
    // hydration is a black screen over the form you came to fill in.
    state({ hydrated: false, thoughts: [thing('a')] })
    render(<Opening />)
    expect(sheet()).toBeNull()
  })

  it('is not there for an account with nothing in it', () => {
    state({ hydrated: true, thoughts: [] })
    render(<Opening />)
    expect(sheet()).toBeNull()
  })

  it('shows what state your thinking is in, once there is any', () => {
    state({ hydrated: true, thoughts: [thing('a', 'action'), thing('b')] })
    render(<Opening />)
    expect(sheet()).not.toBeNull()
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('in the works')).toBeInTheDocument()
  })

  it('never sits over the app waiting for something that is not coming', () => {
    // whatever it is doing, it is doing it because the graph landed
    state({ hydrated: false, thoughts: [thing('a'), thing('b', 'action')] })
    const { rerender } = render(<Opening />)
    expect(sheet()).toBeNull()
    state({ hydrated: true, thoughts: [thing('a'), thing('b', 'action')] })
    rerender(<Opening />)
    expect(sheet()).not.toBeNull()
  })
})
