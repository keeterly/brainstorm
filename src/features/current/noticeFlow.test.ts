import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { lookAgain, noticedIsStale, type Noticed } from './noticeFlow'
import type { NoticeOutput } from '@shared/ai/actions/notice'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))

function seed() {
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
    profile: { id: 'u1', display_name: 'k', settings: {}, created_at: new Date().toISOString() },
  } as never)
  const s = useGraph.getState()
  const a = s.addThought({ raw_content: 'Ship SS27 lookbook', title: 'Ship SS27 lookbook' })
  const b = s.addThought({ raw_content: 'File the LLC', title: 'File the LLC' })
  return { a, b }
}

const OUT = (over: Partial<NoticeOutput> = {}): NoticeOutput => ({
  read: 'You start structural things and finish visual ones.',
  pressing: [],
  suggestions: [],
  learned: [],
  ...over,
})

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: OUT() })
})

describe('the read on you', () => {
  it('shows it everything at once, not one thought', async () => {
    const { a } = seed()
    const s = useGraph.getState()
    const kid = s.addThought({ raw_content: 'Book the studio', title: 'Book the studio' })
    s.addRelationship(kid.id, a.id, 'part_of')
    const done = s.addThought({ raw_content: 'Pay the sales tax', title: 'Pay the sales tax' })
    s.updateThought(done.id, { status: 'done', completed_at: new Date().toISOString() })

    await lookAgain()
    const input = run.mock.calls[0][1] as {
      thoughts: { title: string }[]
      pools: { name: string; members: string[] }[]
      recentlyDone: string[]
    }
    expect(input.thoughts.length).toBeGreaterThan(1)
    expect(input.pools[0]).toMatchObject({ name: 'Ship SS27 lookbook', members: ['Book the studio'] })
    // what you finished says as much as what is open
    expect(input.recentlyDone).toContain('Pay the sales tax')
    // and a finished thing is not still open
    expect(input.thoughts.map((t) => t.title)).not.toContain('Pay the sales tax')
  })

  it('refuses to point at a thought that no longer exists', async () => {
    const { a } = seed()
    run.mockResolvedValue({
      runId: 'r1',
      output: OUT({
        pressing: [
          { id: a.id, why: 'the shoot is booked' },
          { id: 'ghost', why: 'invented' },
        ],
        suggestions: [{ title: 'Call the printer', why: 'lead time', from: 'ghost' }],
      }),
    })
    const n = await lookAgain()
    expect(n?.pressing.map((p) => p.id)).toEqual([a.id])
    expect(n?.suggestions[0].from).toBeUndefined()
  })

  it('keeps what it learned about you, once', async () => {
    seed()
    run.mockResolvedValue({ runId: 'r1', output: OUT({ learned: ['Does her own bookkeeping'] }) })
    await lookAgain()
    expect(useGraph.getState().memories.map((m) => m.content)).toEqual(['Does her own bookkeeping'])
    await lookAgain()
    expect(useGraph.getState().memories).toHaveLength(1)
  })

  it('remembers the read, so glancing at it costs nothing', async () => {
    seed()
    await lookAgain()
    const saved = useGraph.getState().profile?.settings.noticed as Noticed
    expect(saved.read).toContain('structural')
    expect(saved.sawCount).toBe(2)
  })

  it('says nothing rather than something wrong when it cannot look', async () => {
    seed()
    run.mockRejectedValueOnce(new Error('down'))
    expect(await lookAgain()).toBeNull()
    expect(useGraph.getState().profile?.settings.noticed).toBeUndefined()
  })

  it('has nothing to say about an empty sky', async () => {
    useGraph.setState({ thoughts: [], relationships: [] } as never)
    expect(await lookAgain()).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })
})

describe('knowing when it has gone stale', () => {
  const at = (iso: string, sawCount: number): Noticed => ({
    read: '',
    pressing: [],
    suggestions: [],
    learned: [],
    atISO: iso,
    sawCount,
  })
  it('is stale before it has ever looked', () => {
    expect(noticedIsStale(null, 10)).toBe(true)
  })
  it('holds while the sky is roughly as it was', () => {
    expect(noticedIsStale(at(new Date().toISOString(), 10), 12)).toBe(false)
  })
  it('goes stale once enough has changed', () => {
    expect(noticedIsStale(at(new Date().toISOString(), 10), 14)).toBe(true)
    expect(noticedIsStale(at(new Date().toISOString(), 10), 6)).toBe(true)
  })
  it('goes stale on its own overnight', () => {
    const yesterday = new Date(Date.now() - 25 * 3600 * 1000).toISOString()
    expect(noticedIsStale(at(yesterday, 10), 10)).toBe(true)
  })
})
