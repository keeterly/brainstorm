import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { applyDeepen, briefMarkdown, deepenThought } from './deepenFlow'
import type { DeepenOutput } from '@shared/ai/actions/deepen'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))

const OUT: DeepenOutput = {
  read: 'A 7(a) working-capital loan, not a 504',
  found: [{ point: '7(a) tops out at $5M', why: 'Well above the 100k you want' }],
  steps: [
    { tempId: 's1', title: 'Pull two years of business tax returns', why: 'Every lender opens with this', effort: 2, dependsOn: [] },
    { tempId: 's2', title: 'Call an SBA preferred lender', why: 'They approve without SBA review', effort: 1, dependsOn: ['s1'] },
  ],
  watchOuts: ['A personal guarantee is required over 20% ownership'],
  sources: [{ title: 'SBA 7(a)', url: 'https://www.sba.gov/x' }],
  learned: ['Runs a two-person label and does the finance herself'],
  note: 'It is a 7(a) — here is the order.',
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
  return useGraph.getState().addThought({ raw_content: 'Get a $100k SBA loan', title: 'Get a $100k SBA loan' })
}

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: OUT })
})

describe('⚡ turns what it found into work you can actually pick up', () => {
  it('hangs every step off the thing you pointed it at', async () => {
    const subject = seed()
    const res = await deepenThought(subject.id)
    expect(res.kind).toBe('deepened')
    const s = useGraph.getState()
    const kids = s.relationships.filter((r) => r.type === 'part_of' && r.to_id === subject.id)
    expect(kids).toHaveLength(2)
    const titles = kids.map((r) => s.thoughts.find((t) => t.id === r.from_id)?.title)
    expect(titles).toContain('Pull two years of business tax returns')
  })

  it('makes the subject a goal, so the sky shows it as a pool with work in it', async () => {
    const subject = seed()
    expect(subject.type).not.toBe('goal')
    await deepenThought(subject.id)
    expect(useGraph.getState().thoughts.find((t) => t.id === subject.id)?.type).toBe('goal')
  })

  it('keeps the order it said mattered, and invents none', async () => {
    const subject = seed()
    await deepenThought(subject.id)
    const s = useGraph.getState()
    const deps = s.relationships.filter((r) => r.type === 'depends_on')
    expect(deps).toHaveLength(1)
    const from = s.thoughts.find((t) => t.id === deps[0].from_id)?.title
    const to = s.thoughts.find((t) => t.id === deps[0].to_id)?.title
    expect(from).toBe('Call an SBA preferred lender')
    expect(to).toBe('Pull two years of business tax returns')
  })

  it('offers what it learned to memory rather than writing it there itself', async () => {
    // Whether this is new, a correction of something already believed, or —
    // most often — already known is the reconciler's call. ⚡'s job is to hand
    // it over and say where it came from.
    const subject = seed()
    await deepenThought(subject.id)
    const offer = run.mock.calls.find((c) => c[0] === 'remember')
    expect(offer).toBeTruthy()
    const input = offer![1] as { text: string; from?: string }
    expect(input.text).toContain('Runs a two-person label and does the finance herself')
    expect(input.from).toContain('working out')
  })

  it('keeps the research as something you can read again', async () => {
    const subject = seed()
    await deepenThought(subject.id)
    const art = useGraph.getState().artifacts[0]
    expect(art.thought_id).toBe(subject.id)
    expect(art.content_md).toContain('7(a) tops out at $5M')
    expect(art.content_md).toContain('https://www.sba.gov/x')
  })

  it('tells it what is already inside, so it does not hand back your own list', async () => {
    const subject = seed()
    const s = useGraph.getState()
    const existing = s.addThought({ raw_content: 'Open a business bank account', title: 'Open a business bank account' })
    s.addRelationship(existing.id, subject.id, 'part_of')
    await deepenThought(subject.id, { intent: 'by March' })
    const input = run.mock.calls[0][1] as { context: string[]; intent?: string }
    expect(input.context).toContain('Open a business bank account')
    expect(input.intent).toBe('by March')
  })

  it('changes nothing at all when it cannot get out there', async () => {
    const subject = seed()
    run.mockRejectedValueOnce(new Error('offline'))
    const before = useGraph.getState().thoughts.length
    expect((await deepenThought(subject.id)).kind).toBe('failed')
    expect(useGraph.getState().thoughts).toHaveLength(before)
    expect(useGraph.getState().relationships).toHaveLength(0)
  })
})

describe('the brief it leaves behind', () => {
  it('reads as a document, not as a dump', () => {
    const md = briefMarkdown(OUT)
    expect(md).toContain('# A 7(a) working-capital loan, not a 504')
    expect(md).toContain('## What I found')
    expect(md).toContain('## The way through')
    expect(md).toContain('1. **Pull two years of business tax returns**')
    expect(md).toContain('[SBA 7(a)](https://www.sba.gov/x)')
  })
  it('leaves out the sections it has nothing for', () => {
    const md = briefMarkdown({ ...OUT, watchOuts: [], sources: [], found: [] })
    expect(md).not.toContain('## Where this goes wrong')
    expect(md).not.toContain('## Sources')
    expect(md).not.toContain('## What I found')
  })
})

const kids = (id: string) => {
  const s = useGraph.getState()
  return s.relationships.filter((r) => r.type === 'part_of' && r.to_id === id)
}

describe('running it twice on the same thing', () => {
  it('adds what is new and not what is already under there', () => {
    // The prompt asks it not to repeat what it was shown. Nothing checked, so
    // a second run — or one background run collected twice — left every step
    // sitting under its own duplicate, with no undo and no way to tell the
    // copies apart. Three of five, in the screenshot that found this.
    const goal = seed()
    applyDeepen(goal.id, OUT, 'r1')
    const first = kids(goal.id).length
    const res = applyDeepen(goal.id, OUT, 'r2')
    expect(kids(goal.id)).toHaveLength(first)
    if (res.kind !== 'deepened') throw new Error('expected deepened')
    expect(res.added).toBe(0)
  })

  it('does not care about the punctuation it happened to use the second time', () => {
    const goal = seed()
    applyDeepen(goal.id, OUT, 'r1')
    const before = kids(goal.id).length
    const reworded = {
      ...OUT,
      steps: OUT.steps.map((st) => ({ ...st, title: st.title.toUpperCase() + '.' })),
    }
    applyDeepen(goal.id, reworded, 'r2')
    expect(kids(goal.id)).toHaveLength(before)
  })

  it('still lands the ones it had not thought of before', () => {
    const goal = seed()
    applyDeepen(goal.id, OUT, 'r1')
    const before = kids(goal.id).length
    const res = applyDeepen(
      goal.id,
      { ...OUT, steps: [...OUT.steps, { tempId: 'sX', title: 'Ring the lender back on Monday', why: 'they said to', effort: 1, dependsOn: [] }] },
      'r2',
    )
    expect(kids(goal.id)).toHaveLength(before + 1)
    if (res.kind !== 'deepened') throw new Error('expected deepened')
    expect(res.added).toBe(1)
  })
})
