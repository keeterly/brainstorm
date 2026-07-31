import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from './graph'
import { loadSnapshot, saveSnapshot } from '@/lib/idb'
import { flush } from '@/lib/outbox'

// What each table comes back with. A test sets one of them to an error to say
// "this half of the load failed and the rest did not".
let tables: Record<string, { data?: unknown; error?: unknown }> = {}

function chain(table: string) {
  const self: Record<string, unknown> = {}
  const reply = () => Promise.resolve(tables[table] ?? { data: [] })
  for (const k of ['select', 'order', 'limit', 'eq']) self[k] = () => self
  self.maybeSingle = reply
  self.then = (res: (v: unknown) => unknown) => reply().then(res)
  return self
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => chain(t) } }))
vi.mock('@/lib/outbox', () => ({
  write: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/idb', () => ({
  saveSnapshot: vi.fn(),
  loadSnapshot: vi.fn().mockResolvedValue(null),
}))

const th = (id: string) => ({ id, raw_content: id, type: 'note', status: 'open', extra: {} })

beforeEach(() => {
  vi.clearAllMocks()
  tables = {}
  useGraph.getState().reset()
})

describe('opening the app', () => {
  it('sends what is owed before it asks what is there', async () => {
    // The other way round — read, overwrite the store, then flush — means the
    // server's rows momentarily replace edits that have not landed, and the
    // snapshot written straight afterwards captures the graph without them.
    tables.thoughts = { data: [th('t1')] }
    await useGraph.getState().hydrate('u1')
    expect(flush).toHaveBeenCalled()
  })

  it('treats half an answer as no answer', async () => {
    // Only `th.error` was checked. A relationships query that failed on its
    // own gave `hydrated: true, offline: false` with an empty edge set — every
    // pool in the sky dissolved, nothing read as blocked — and the snapshot
    // that followed wrote that blank graph over the good local copy.
    tables.thoughts = { data: [th('t1')] }
    tables.relationships = { error: { message: 'gateway' } }
    vi.mocked(loadSnapshot).mockResolvedValueOnce({
      userId: 'u1',
      thoughts: [th('kept')] as never,
      relationships: [{ id: 'r1' }] as never,
      roadmaps: [],
      memories: [],
      artifacts: [],
      profile: null,
      savedAt: new Date().toISOString(),
    })
    await useGraph.getState().hydrate('u1')
    const s = useGraph.getState()
    expect(s.offline).toBe(true)
    expect(s.thoughts.map((t) => t.id)).toEqual(['kept'])
    expect(s.relationships).toHaveLength(1)
    expect(saveSnapshot).not.toHaveBeenCalled()
  })

  it('brings back where you put everything, and what it changed its mind about', async () => {
    // Neither was in the snapshot. Without `layouts` the sky re-randomised
    // every drop on an offline launch and then saved the reshuffle over an
    // hour of arranging; without `memoryEvents` the Memory page's record of
    // its own corrections was silently empty.
    tables.thoughts = { error: { message: 'offline' } }
    vi.mocked(loadSnapshot).mockResolvedValueOnce({
      userId: 'u1',
      thoughts: [],
      relationships: [],
      roadmaps: [],
      memories: [],
      memoryEvents: [{ id: 'e1', op: 'update' }] as never,
      artifacts: [],
      profile: null,
      layouts: { sky: { t1: { x: 12, y: 34 } } },
      savedAt: new Date().toISOString(),
    })
    await useGraph.getState().hydrate('u1')
    const s = useGraph.getState()
    expect(s.layouts.sky.t1).toEqual({ x: 12, y: 34 })
    expect(s.memoryEvents).toHaveLength(1)
  })

  it('opens empty rather than not at all when there is nothing to fall back on', async () => {
    tables.thoughts = { error: { message: 'offline' } }
    await useGraph.getState().hydrate('u1')
    expect(useGraph.getState().hydrated).toBe(true)
    expect(useGraph.getState().offline).toBe(true)
  })

  it('writes the arrangement into the snapshot it keeps', async () => {
    vi.useFakeTimers()
    tables.thoughts = { data: [th('t1')] }
    await useGraph.getState().hydrate('u1')
    useGraph.getState().saveLayout('sky', { t1: { x: 1, y: 2 } })
    useGraph.getState().addThought({ raw_content: 'a' })
    await vi.advanceTimersByTimeAsync(1000)
    const snap = vi.mocked(saveSnapshot).mock.calls.at(-1)?.[0]
    expect(snap?.layouts?.sky).toEqual({ t1: { x: 1, y: 2 } })
    vi.useRealTimers()
  })
})
