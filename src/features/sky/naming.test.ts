// The one rename in this app that nobody asks for.
//
// Drag two things together and a group forms with a local guess for a name —
// "Fares · Seat map" — and a moment later a better name arrives from the model
// and replaces it. That is naming something that had no name, and it is worth
// having.
//
// It used to write unconditionally, which made it something else: a rename,
// with no offer, no undo, and nothing anywhere saying it had happened. Name a
// group yourself, drag one more thing into it, and it came back a second later
// called something else. These are the two rules that separate the first thing
// from the second.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { nameThePool } from './absorbFlow'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))

const S = () => useGraph.getState()
const called = (id: string) => S().thoughts.find((t) => t.id === id)?.title

function seed(name: string) {
  useGraph.setState({
    userId: 'u1',
    hydrated: true,
    offline: false,
    thoughts: [],
    relationships: [],
    memories: [],
    artifacts: [],
    roadmaps: [],
    layouts: {},
  } as never)
  return S().addThought({ raw_content: name, title: name, type: 'goal' })
}

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: { name: 'Paris Fashion Week travel' } })
})

/** nameThePool is fire-and-forget; this is the tick it lands on. */
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('naming a pool that has just formed', () => {
  it('replaces the local guess with something a person would have written', async () => {
    const g = seed('Fares · Seat map')
    nameThePool(g.id, ['Fares', 'Seat map'], 'Fares · Seat map')
    await settle()
    expect(called(g.id)).toBe('Paris Fashion Week travel')
  })

  it('says so, rather than changing the map in silence', async () => {
    const g = seed('Fares · Seat map')
    const said: string[] = []
    nameThePool(g.id, ['Fares', 'Seat map'], 'Fares · Seat map', (n) => said.push(n))
    await settle()
    expect(said).toEqual(['Paris Fashion Week travel'])
  })

  it('leaves alone a name you typed while it was out asking', async () => {
    // the whole point. You named it; a model's opinion does not outrank that.
    const g = seed('Fares · Seat map')
    nameThePool(g.id, ['Fares', 'Seat map'], 'Fares · Seat map')
    S().updateThought(g.id, { title: 'PFW Travel', raw_content: 'PFW Travel' })
    await settle()
    expect(called(g.id)).toBe('PFW Travel')
  })

  it('says nothing when it changed nothing', async () => {
    const g = seed('Fares · Seat map')
    const said: string[] = []
    nameThePool(g.id, ['Fares', 'Seat map'], 'Fares · Seat map', (n) => said.push(n))
    S().updateThought(g.id, { title: 'PFW Travel', raw_content: 'PFW Travel' })
    await settle()
    expect(said).toEqual([])
  })

  it('does not rename a group that already had a name of its own', async () => {
    // regrouping inside something you named is not permission to rename it
    const g = seed('PFW Travel')
    nameThePool(g.id, ['Fares', 'Seat map'], 'Fares · Seat map')
    await settle()
    expect(called(g.id)).toBe('PFW Travel')
  })

  it('never asks at all for a group of one', async () => {
    const g = seed('Fares')
    nameThePool(g.id, ['Fares'], 'Fares')
    await settle()
    expect(run).not.toHaveBeenCalled()
  })

  it('keeps the guess when the model cannot be reached', async () => {
    const g = seed('Fares · Seat map')
    run.mockRejectedValueOnce(new Error('offline'))
    nameThePool(g.id, ['Fares', 'Seat map'], 'Fares · Seat map')
    await settle()
    expect(called(g.id)).toBe('Fares · Seat map')
  })

  it('does nothing to a group that was taken apart while it was out', async () => {
    const g = seed('Fares · Seat map')
    nameThePool(g.id, ['Fares', 'Seat map'], 'Fares · Seat map')
    useGraph.setState({ thoughts: [] } as never)
    await settle()
    expect(S().thoughts).toHaveLength(0)
  })
})
