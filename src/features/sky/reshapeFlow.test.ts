import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { reshapeTally, reshapeThought } from './reshapeFlow'
import type { ReshapeOutput } from '@shared/ai/actions/reshape'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))

const NOTHING: ReshapeOutput = { rename: null, add: [], reword: [], retire: [], group: [], note: 'already said' }
const out = (o: Partial<ReshapeOutput>): ReshapeOutput => ({ ...NOTHING, ...o })

/** A goal with three things under it, which is what you are looking at when
 *  you tell the map something. */
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
  const goal = s.addThought({ raw_content: 'SS27 lookbook', title: 'SS27 lookbook', type: 'goal' })
  const kids = ['Shoot on expired film', 'Book the photographer', 'Find a studio'].map((t) => {
    const k = s.addThought({ raw_content: t, title: t })
    s.addRelationship(k.id, goal.id, 'part_of')
    return k
  })
  return { goal, kids }
}

const g = () => useGraph.getState()
const titles = () =>
  g()
    .thoughts.filter((t) => t.status === 'open')
    .map((t) => t.title)
const kidsOf = (id: string) =>
  g()
    .relationships.filter((r) => r.type === 'part_of' && r.to_id === id)
    .map((r) => g().thoughts.find((t) => t.id === r.from_id)?.title)

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: NOTHING })
})

describe('telling the map something new', () => {
  it('hands it what is actually under the thing you are looking at', async () => {
    const { goal } = seed()
    await reshapeThought(goal.id, 'The studio fell through')
    const [name, input] = run.mock.calls[0]
    expect(name).toBe('reshape')
    expect(input.subject.id).toBe(goal.id)
    expect(input.inside.map((r: { title: string }) => r.title)).toEqual([
      'Shoot on expired film',
      'Book the photographer',
      'Find a studio',
    ])
    expect(input.news).toBe('The studio fell through')
  })

  it('gives it the research it already did, so news is weighed against it', async () => {
    const { goal } = seed()
    g().addArtifact({
      id: 'a1',
      thought_id: goal.id,
      title: 'Expired film',
      content_md: '## What I found\n- Rate it a stop slower',
      sources: [],
      agent_run_id: null,
    })
    await reshapeThought(goal.id, 'anything')
    expect(run.mock.calls[0][1].brief).toContain('Rate it a stop slower')
  })

  it('adds what the news brought, under the thing it belongs to', async () => {
    const { goal } = seed()
    run.mockResolvedValue({
      runId: 'r1',
      output: out({
        add: [{ tempId: 'n1', title: 'Ask Ana about her garage', why: 'You said she offered', type: 'action' }],
        note: 'A studio to chase.',
      }),
    })
    const res = await reshapeThought(goal.id, 'Ana offered her garage')
    expect(res.kind).toBe('reshaped')
    expect(kidsOf(goal.id)).toContain('Ask Ana about her garage')
    expect(g().thoughts.find((t) => t.title === 'Ask Ana about her garage')?.summary).toBe('You said she offered')
  })

  it('rewords what is already there without making a second copy of it', async () => {
    const { goal, kids } = seed()
    run.mockResolvedValue({
      runId: 'r1',
      output: out({ reword: [{ id: kids[0].id, title: 'Shoot on expired Portra, rated 200' }] }),
    })
    await reshapeThought(goal.id, 'It is Portra, and I will rate it 200')
    expect(titles()).toContain('Shoot on expired Portra, rated 200')
    expect(titles()).not.toContain('Shoot on expired film')
    expect(kidsOf(goal.id)).toHaveLength(3)
  })

  it('renames the thing itself when what it is about has moved', async () => {
    const { goal } = seed()
    run.mockResolvedValue({ runId: 'r1', output: out({ rename: 'SS27 lookbook — on film' }) })
    const res = await reshapeThought(goal.id, 'the whole thing is film now')
    expect(g().thoughts.find((t) => t.id === goal.id)?.title).toBe('SS27 lookbook — on film')
    expect(res.kind === 'reshaped' && res.change.renamed).toBe(true)
  })

  it('settles what the news rules out — and does not delete it', async () => {
    const { goal, kids } = seed()
    run.mockResolvedValue({
      runId: 'r1',
      output: out({ retire: [{ id: kids[2].id, why: 'Ana’s garage is the studio' }] }),
    })
    await reshapeThought(goal.id, 'Using Ana’s garage')
    const gone = g().thoughts.find((t) => t.id === kids[2].id)
    expect(gone).toBeTruthy() // still there, still yours
    expect(gone?.status).toBe('done')
    expect(gone?.summary).toBe('Ana’s garage is the studio')
    expect(titles()).not.toContain('Find a studio')
  })

  it('gathers existing pieces into a group inside the same thing', async () => {
    const { goal, kids } = seed()
    run.mockResolvedValue({
      runId: 'r1',
      output: out({ group: [{ name: 'The shoot day', members: [kids[0].id, kids[1].id] }] }),
    })
    await reshapeThought(goal.id, 'the film and the photographer are one problem')
    expect(kidsOf(goal.id)).toContain('The shoot day')
    expect(kidsOf(goal.id)).not.toContain('Shoot on expired film')
    const hub = g().thoughts.find((t) => t.title === 'The shoot day')!
    expect(kidsOf(hub.id)).toEqual(['Shoot on expired film', 'Book the photographer'])
  })

  it('can gather something it has only just added', async () => {
    const { goal, kids } = seed()
    run.mockResolvedValue({
      runId: 'r1',
      output: out({
        add: [{ tempId: 'n1', title: 'Hire a van', why: 'to move the lights', type: 'action' }],
        group: [{ name: 'The shoot day', members: ['n1', kids[1].id] }],
      }),
    })
    await reshapeThought(goal.id, 'we need a van')
    const hub = g().thoughts.find((t) => t.title === 'The shoot day')!
    expect(kidsOf(hub.id)).toEqual(expect.arrayContaining(['Hire a van', 'Book the photographer']))
  })

  it('says plainly when the map already covered it, rather than inventing an edit', async () => {
    const { goal } = seed()
    const res = await reshapeThought(goal.id, 'we are shooting on film')
    expect(res).toEqual({ kind: 'unchanged', note: 'already said' })
    expect(titles()).toHaveLength(4)
  })

  it('tells you what it did, in a line', async () => {
    const { goal, kids } = seed()
    run.mockResolvedValue({
      runId: 'r1',
      output: out({
        rename: 'SS27 on film',
        add: [{ tempId: 'n1', title: 'Hire a van', why: 'x', type: 'action' }],
        reword: [{ id: kids[0].id, title: 'Shoot on Portra' }],
        retire: [{ id: kids[2].id, why: 'settled' }],
      }),
    })
    const res = await reshapeThought(goal.id, 'lots changed')
    expect(res.kind === 'reshaped' && reshapeTally(res.change)).toBe('1 new · 1 reworded · 1 settled · renamed')
  })
})

describe('putting it back', () => {
  it('undoes every kind of edit, exactly', async () => {
    const { goal, kids } = seed()
    const before = {
      titles: titles().sort(),
      kids: kidsOf(goal.id).sort(),
      count: g().thoughts.length,
      rels: g().relationships.length,
    }
    run.mockResolvedValue({
      runId: 'r1',
      output: out({
        rename: 'Something else entirely',
        add: [{ tempId: 'n1', title: 'Hire a van', why: 'x', type: 'action' }],
        reword: [{ id: kids[0].id, title: 'Shoot on Portra' }],
        retire: [{ id: kids[2].id, why: 'settled' }],
        group: [{ name: 'The shoot day', members: [kids[0].id, kids[1].id] }],
      }),
    })
    const res = await reshapeThought(goal.id, 'everything changed')
    expect(res.kind).toBe('reshaped')
    // it really did move
    expect(titles().sort()).not.toEqual(before.titles)

    if (res.kind !== 'reshaped') throw new Error('unreachable')
    res.change.undo()

    expect(titles().sort()).toEqual(before.titles)
    // membership exactly; the order they sit in the ring is not restored,
    // because a relationship that moved is re-added at the end of the list
    expect(kidsOf(goal.id).sort()).toEqual(before.kids)
    expect(g().thoughts.filter((t) => t.status === 'open')).toHaveLength(before.count)
    expect(g().relationships).toHaveLength(before.rels)
    expect(g().thoughts.find((t) => t.id === goal.id)?.title).toBe('SS27 lookbook')
    expect(g().thoughts.find((t) => t.id === kids[2].id)?.status).toBe('open')
  })

  it('returns a regrouped thought to where it was, not to nowhere', async () => {
    const { goal, kids } = seed()
    run.mockResolvedValue({
      runId: 'r1',
      output: out({ group: [{ name: 'The shoot day', members: [kids[0].id, kids[1].id] }] }),
    })
    const res = await reshapeThought(goal.id, 'x')
    if (res.kind !== 'reshaped') throw new Error('unreachable')
    res.change.undo()
    expect(kidsOf(goal.id).sort()).toEqual(['Book the photographer', 'Find a studio', 'Shoot on expired film'])
    expect(titles()).not.toContain('The shoot day')
  })
})

describe('not touching what was never on the table', () => {
  it('ignores an id it was not given', async () => {
    const { goal } = seed()
    const other = g().addThought({ raw_content: 'Nothing to do with this', title: 'Nothing to do with this' })
    run.mockResolvedValue({
      runId: 'r1',
      output: out({
        reword: [{ id: other.id, title: 'HIJACKED' }],
        retire: [{ id: other.id, why: 'no' }],
      }),
    })
    const res = await reshapeThought(goal.id, 'x')
    expect(res.kind).toBe('unchanged')
    expect(g().thoughts.find((t) => t.id === other.id)?.title).toBe('Nothing to do with this')
    expect(g().thoughts.find((t) => t.id === other.id)?.status).toBe('open')
  })

  it('does not rename the subject to the name it already has', async () => {
    const { goal } = seed()
    run.mockResolvedValue({ runId: 'r1', output: out({ rename: '  SS27 lookbook  ' }) })
    expect((await reshapeThought(goal.id, 'x')).kind).toBe('unchanged')
  })

  it('does not reword something to what it already said', async () => {
    const { goal, kids } = seed()
    run.mockResolvedValue({ runId: 'r1', output: out({ reword: [{ id: kids[0].id, title: 'Shoot on expired film' }] }) })
    expect((await reshapeThought(goal.id, 'x')).kind).toBe('unchanged')
  })

  it('reports why it could not, rather than failing silently', async () => {
    const { goal } = seed()
    run.mockRejectedValue(new Error('offline'))
    expect(await reshapeThought(goal.id, 'x')).toEqual({ kind: 'failed', why: 'offline' })
  })

  it('does nothing at all for a thought that is not there', async () => {
    seed()
    expect(await reshapeThought('nope', 'x')).toEqual({ kind: 'failed' })
    expect(run).not.toHaveBeenCalled()
  })
})
