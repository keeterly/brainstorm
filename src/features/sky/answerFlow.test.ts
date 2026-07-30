import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { answerMarkdown, answerThought, firstSentence } from './answerFlow'
import type { AnswerOutput } from '@shared/ai/actions/answer'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))

const OUT: AnswerOutput = {
  asked: 'What does LAX→CDG premium economy cost, Sept 28 out / Oct 9 back?',
  answer:
    '$1,180–$1,420 round trip. Air France’s own site is showing $1,214 on AF65/AF66 for those exact dates; Delta ' +
    'codeshares the same metal about $60 higher. Nothing on that route has gone under $1,050 in the last month.',
  facts: [
    { label: 'Cheapest found', value: '$1,214 round trip', note: 'AF65 out, AF66 back, booked direct' },
    { label: 'Aircraft', value: '777-300ER', note: '2-4-2 in premium economy, 38" pitch' },
  ],
  asOf: 'Fares checked today; transatlantic premium economy moves daily and jumps inside 21 days.',
  unknown: [
    { what: 'The live ITA Matrix fare basis', toKnow: 'ITA cannot be queried programmatically — run it yourself' },
  ],
  next: [{ tempId: 'n1', title: 'Hold the AF65 seat with a 24-hour courtesy hold', why: 'Free, and locks the fare', effort: 1 }],
  sources: [{ title: 'Air France', url: 'https://wwws.airfrance.us/x' }],
  learned: ['Flies LAX→CDG for fashion week and prefers premium economy over business'],
  settled: false,
}

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
  } as never)
  const s = useGraph.getState()
  const goal = s.addThought({ raw_content: 'SS27 Lookbook & Collection Prep', title: 'SS27 Lookbook & Collection Prep', type: 'goal' })
  const q = s.addThought({
    raw_content: 'Pull live Google Flights / ITA Matrix fares for LAX→CDG premium economy',
    title: 'Pull live Google Flights / ITA Matrix fares for LAX→CDG premium economy',
  })
  s.addRelationship(q.id, goal.id, 'part_of')
  return { goal, q }
}

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: OUT })
})

describe('asking one thing on the map', () => {
  it('comes back with the answer, not with a count of what it did', async () => {
    const { q } = seed()
    const res = await answerThought(q.id)
    expect(res.kind).toBe('answered')
    if (res.kind !== 'answered') return
    expect(res.line).toBe('$1,180–$1,420 round trip.')
  })

  it('writes what it learned onto the question, so the map stops only asking', async () => {
    const { q } = seed()
    await answerThought(q.id)
    const t = useGraph.getState().thoughts.find((x) => x.id === q.id)!
    expect(t.summary).toContain('$1,180–$1,420 round trip')
    expect(t.extra.answered_at).toBeTruthy()
  })

  it('does not turn a question into a pool of chores', async () => {
    // deepen makes a goal with steps under it. An answer must leave the shape
    // of the map alone — that is the whole difference between them.
    const { q } = seed()
    await answerThought(q.id)
    const s = useGraph.getState()
    expect(s.thoughts.find((t) => t.id === q.id)!.type).not.toBe('goal')
    expect(s.relationships.filter((r) => r.type === 'part_of' && r.to_id === q.id)).toHaveLength(0)
  })

  it('hangs what the answer did create beside the question, not under it', async () => {
    // work that came out of an answer is not part of asking it
    const { goal, q } = seed()
    const res = await answerThought(q.id)
    expect(res.kind === 'answered' && res.added).toBe(1)
    const s = useGraph.getState()
    const under = s.relationships.filter((r) => r.type === 'part_of' && r.to_id === goal.id)
    const titles = under.map((r) => s.thoughts.find((t) => t.id === r.from_id)?.title)
    expect(titles).toContain('Hold the AF65 seat with a 24-hour courtesy hold')
    expect(titles).toContain(q.title)
  })

  it('adds nothing when the answer created nothing, which is the usual case', async () => {
    const { q } = seed()
    run.mockResolvedValue({ runId: 'r1', output: { ...OUT, next: [], settled: true } })
    const before = useGraph.getState().thoughts.length
    const res = await answerThought(q.id)
    expect(useGraph.getState().thoughts).toHaveLength(before)
    expect(res.kind === 'answered' && res.settled).toBe(true)
  })

  it('sends the neighbours, because they are most of the question', async () => {
    // "fares for LAX→CDG" under a fashion-week goal is a different question
    // from the same words on their own
    const { goal, q } = seed()
    const s = useGraph.getState()
    const sib = s.addThought({ raw_content: 'Arrive by September 28', title: 'Arrive by September 28' })
    s.addRelationship(sib.id, goal.id, 'part_of')
    await answerThought(q.id, { intent: 'economy is fine if it is half' })
    const input = run.mock.calls[0][1] as { context: string[]; under?: string; intent?: string }
    expect(input.under).toBe('SS27 Lookbook & Collection Prep')
    expect(input.context).toContain('Arrive by September 28')
    expect(input.context).not.toContain(q.title)
    expect(input.intent).toBe('economy is fine if it is half')
  })

  it('keeps the answer as something you can reopen weeks later', async () => {
    const { q } = seed()
    await answerThought(q.id)
    const art = useGraph.getState().artifacts[0]
    expect(art.thought_id).toBe(q.id)
    expect(art.content_md).toContain('$1,214 round trip')
    expect(art.sources[0].url).toBe('https://wwws.airfrance.us/x')
  })

  it('learns you, once', async () => {
    const { q } = seed()
    await answerThought(q.id)
    await answerThought(q.id)
    expect(useGraph.getState().memories).toHaveLength(1)
  })

  it('changes nothing at all when it cannot get out there', async () => {
    const { q } = seed()
    run.mockRejectedValueOnce(new Error('offline'))
    const before = useGraph.getState()
    expect((await answerThought(q.id)).kind).toBe('failed')
    expect(useGraph.getState().thoughts).toHaveLength(before.thoughts.length)
    expect(useGraph.getState().artifacts).toHaveLength(0)
  })
})

describe('the answer, written down', () => {
  it('leads with the answer itself, above everything else', () => {
    const md = answerMarkdown(OUT)
    expect(md.indexOf('$1,180–$1,420')).toBeLessThan(md.indexOf('## The specifics'))
  })

  it('says what it is as of, and what it could not settle', () => {
    const md = answerMarkdown(OUT)
    expect(md).toContain('## As of')
    expect(md).toContain('## Still open')
    expect(md).toContain('ITA cannot be queried programmatically')
  })

  it('leaves out the sections it has nothing for', () => {
    const md = answerMarkdown({ ...OUT, facts: [], unknown: [], next: [], sources: [], asOf: '' })
    for (const h of ['## The specifics', '## As of', '## Still open', '## What this makes', '## Sources']) {
      expect(md).not.toContain(h)
    }
  })
})

describe('the one line of it that fits on a lock screen', () => {
  it('is the first sentence, because that is where the figure is', () => {
    expect(firstSentence('Yes — $1,214. Booked direct on AF.')).toBe('Yes — $1,214.')
  })
  it('does not break on a decimal, an initial or an abbreviation mid-sentence', () => {
    expect(firstSentence('It is $1,214.50 round trip on AF65. Delta is higher.')).toBe(
      'It is $1,214.50 round trip on AF65.',
    )
  })
  it('takes the whole thing when the opening fragment says nothing', () => {
    expect(firstSentence('No. The 777 has no premium cabin on that rotation.')).toBe(
      'No. The 777 has no premium cabin on that rotation.',
    )
  })
  it('clips rather than runs off the screen', () => {
    expect(firstSentence('x'.repeat(400)).length).toBeLessThanOrEqual(160)
  })
})
