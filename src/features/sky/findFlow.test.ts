import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findLikeThis, imageSearchUrl } from './findFlow'
import type { FindLikeOutput } from '@shared/ai/actions/find-like'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
}))

const PIC = { mediaType: 'image/jpeg', dataB64: 'AAAAAAAAAAAAAAAA' }
const SUBJ = { id: 'p1', title: 'Photo' }

const OUT: FindLikeOutput = {
  reading: 'A cloth-draped seated figure — the De Bruyckere / Moore lineage',
  finds: [
    { title: 'City of Refuge III', who: 'De Bruyckere', where: 'Venice, 2024', why: 'faceless, draped', url: 'https://a.org/1' },
    { title: 'Draped Seated Woman', who: 'Henry Moore', where: 'YSP', why: 'mass without edges', url: 'https://b.org/2' },
    { title: 'Untitled (Shroud)', who: 'Kris Martin', where: 'Ghent', why: 'a covered body', url: 'https://c.org/3' },
  ],
  searches: ['Berlinde De Bruyckere blanket sculpture'],
}

/** What /api/preview said about each page. */
let seen: Record<string, string | null>

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: OUT })
  seen = { 'https://a.org/1': null, 'https://b.org/2': 'https://b.org/hero.jpg', 'https://c.org/3': null }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { urls: string[] }
      return new Response(
        JSON.stringify({ cards: body.urls.map((u) => ({ url: u, image: seen[u] ?? null, title: null })) }),
        { status: 200 },
      )
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('finding more like one picture', () => {
  it('comes back with works, not with an essay', async () => {
    // The whole reason this exists. Asked for more pictures like a photograph,
    // the app used to route the request through `answer` and hand back four
    // paragraphs about the artist — right about the artist, and not the thing
    // that was wanted.
    const res = await findLikeThis(SUBJ, PIC)
    expect(res.kind).toBe('found')
    if (res.kind !== 'found') return
    expect(res.finds.map((f) => f.title)).toContain('City of Refuge III')
    expect(res.searches).toHaveLength(1)
  })

  it('puts the ones with a picture first', async () => {
    // A wall is for looking at. A work whose page kept no image of itself is
    // still real and still findable, and it belongs below the ones you can see.
    const res = await findLikeThis(SUBJ, PIC)
    if (res.kind !== 'found') throw new Error('expected finds')
    expect(res.finds[0].title).toBe('Draped Seated Woman')
    expect(res.finds[0].image).toBe('https://b.org/hero.jpg')
    expect(res.finds.slice(1).every((f) => !f.image)).toBe(true)
  })

  it('keeps the ones with no picture rather than dropping them', async () => {
    const res = await findLikeThis(SUBJ, PIC)
    if (res.kind !== 'found') throw new Error('expected finds')
    expect(res.finds).toHaveLength(3)
  })

  it('asks about each page once, however often the model repeats itself', async () => {
    run.mockResolvedValue({
      runId: 'r1',
      output: { ...OUT, finds: [OUT.finds[0], OUT.finds[0], OUT.finds[1]] },
    })
    const res = await findLikeThis(SUBJ, PIC)
    if (res.kind !== 'found') throw new Error('expected finds')
    expect(res.finds).toHaveLength(2)
    const asked = JSON.parse(String((fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body))
    expect(asked.urls).toEqual(['https://a.org/1', 'https://b.org/2'])
  })

  it('still shows the searches when it found no works at all', async () => {
    // Often the vocabulary is the most useful part — "shrouded figure
    // sculpture" finds nothing and "De Bruyckere blanket sculpture" finds the
    // field — so an empty wall is not an empty result.
    run.mockResolvedValue({ runId: 'r1', output: { ...OUT, finds: [] } })
    const res = await findLikeThis(SUBJ, PIC)
    expect(res.kind).toBe('nothing')
    if (res.kind !== 'nothing') return
    expect(res.searches).toHaveLength(1)
    expect(res.reading).toContain('De Bruyckere')
  })

  it('is still a wall of real works when the preview call is down', async () => {
    // One page that will not answer must not cost the other eleven, and the
    // whole endpoint failing must not cost the run
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    const res = await findLikeThis(SUBJ, PIC)
    if (res.kind !== 'found') throw new Error('expected finds')
    expect(res.finds).toHaveLength(3)
    expect(res.finds.every((f) => !f.image)).toBe(true)
  })

  it('says it could not, rather than pretending it found nothing', async () => {
    run.mockRejectedValueOnce(new Error('offline'))
    const res = await findLikeThis(SUBJ, PIC)
    expect(res.kind).toBe('failed')
  })

  it('sends the picture and what stands around it', async () => {
    await findLikeThis(SUBJ, PIC, { context: ['Shoot on expired film'], under: 'SS28 The Cave' })
    const input = run.mock.calls[0][1] as { image: unknown; context: string[]; under?: string }
    expect(input.image).toEqual(PIC)
    expect(input.context).toContain('Shoot on expired film')
    expect(input.under).toBe('SS28 The Cave')
  })
})

describe('the search you run yourself', () => {
  it('goes to images, because the point is to look at things', () => {
    expect(imageSearchUrl('Henry Moore draped')).toContain('tbm=isch')
  })

  it('escapes what it is given', () => {
    expect(imageSearchUrl('a&b c')).toContain('a%26b%20c')
  })
})
