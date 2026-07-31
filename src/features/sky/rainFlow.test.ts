import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { applyRain, rainThought } from './rainFlow'
import type { RainOutput } from '@shared/ai/actions/rain'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))
vi.mock('@/ai/memoryFlow', () => ({ learnFacts: vi.fn().mockResolvedValue({ added: 0, updated: 0, archived: 0, knew: 0 }) }))

const OUT: RainOutput = {
  read: 'Whether the memory layer is built on Postgres or rented',
  steps: [
    { tempId: 's1', title: 'Decide storage: pgvector here or a hosted memory API', why: 'three of these are waiting on it', effort: 2, dependsOn: [] },
    { tempId: 's2', title: 'Feed a week of real notes through whichever wins', why: 'the only way to know if recall is good enough', effort: 3, dependsOn: ['s1'] },
  ],
  missing: [],
  learned: ['Prefers to prove a thing before adopting it'],
  note: 'one decision, and the thing that settles it',
}

function seed() {
  useGraph.setState({
    userId: 'u1',
    hydrated: true,
    offline: false,
    thoughts: [],
    relationships: [],
    memories: [],
    memoryEvents: [],
    artifacts: [],
    roadmaps: [],
    layouts: {},
  } as never)
  const s = useGraph.getState()
  const pool = s.addThought({ raw_content: 'Brainstorm’s memory layer', title: 'Brainstorm’s memory layer', type: 'idea' })
  const members = [
    'Memory architecture proof of concept',
    'Spin up Mem0 free-tier hosted API against Brainstorm’s notes',
    'Feed a week of your real thought-bubble notes through it',
    'What is mem2.0',
  ].map((t) => s.addThought({ raw_content: t, title: t, type: 'idea' }))
  for (const m of members) s.addRelationship(m.id, pool.id, 'part_of')
  return { pool, members }
}

const kids = (id: string) => {
  const s = useGraph.getState()
  return s.relationships
    .filter((r) => r.type === 'part_of' && r.to_id === id)
    .map((r) => s.thoughts.find((t) => t.id === r.from_id)!)
}

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: OUT })
})

describe('what falls out of a full cloud', () => {
  it('lands as real work under the goal, not as a plan nobody can reach', () => {
    // The whole point of the rewrite. The template wrote its rows into
    // extra.plan — read by exactly one page — so nothing it produced could be
    // ticked, focused, drafted or counted, and nothing ever reached the
    // Current despite that being what raining means.
    const { pool, members } = seed()
    const res = applyRain(pool.id, OUT, 'r1')
    expect(res.kind).toBe('rained')
    const after = kids(pool.id)
    expect(after).toHaveLength(members.length + 2)
    const made = after.filter((t) => t.type === 'action')
    expect(made.map((t) => t.title)).toEqual([
      'Decide storage: pgvector here or a hosted memory API',
      'Feed a week of real notes through whichever wins',
    ])
    // …and each carries its reason, which is what the sky reads under a title
    expect(made[0].summary).toBe('three of these are waiting on it')
  })

  it('makes the cloud a goal, so the funnel can act on what fell', () => {
    // a leaf under a goal is exactly what the third moon reads: it is what
    // turns on `answer it` on a question and `do it` on something makeable
    const { pool } = seed()
    applyRain(pool.id, OUT, 'r1')
    expect(useGraph.getState().thoughts.find((t) => t.id === pool.id)?.type).toBe('goal')
  })

  it('keeps the order it said mattered, and no more', () => {
    const { pool } = seed()
    applyRain(pool.id, OUT, 'r1')
    const s = useGraph.getState()
    const deps = s.relationships.filter((r) => r.type === 'depends_on')
    expect(deps).toHaveLength(1)
    const from = s.thoughts.find((t) => t.id === deps[0].from_id)
    const to = s.thoughts.find((t) => t.id === deps[0].to_id)
    expect(from?.title).toContain('Feed a week')
    expect(to?.title).toContain('Decide storage')
  })

  it('says what the cloud turned out to be, under the name they gave it', () => {
    const { pool } = seed()
    applyRain(pool.id, OUT, 'r1')
    const after = useGraph.getState().thoughts.find((t) => t.id === pool.id)
    expect(after?.title).toBe('Brainstorm’s memory layer')
    expect(after?.summary).toBe('Whether the memory layer is built on Postgres or rented')
  })

  it('clears the template’s leftovers so an old plan cannot come back', () => {
    const { pool } = seed()
    useGraph.getState().updateThought(pool.id, { extra: { plan: [{ pt: 'Rough out “…”' }], planSig: 'x' } })
    applyRain(pool.id, OUT, 'r1')
    const ex = useGraph.getState().thoughts.find((t) => t.id === pool.id)?.extra as Record<string, unknown>
    expect(ex.plan).toBeNull()
    expect(ex.planSig).toBeNull()
    expect(ex.rained_at).toBeTruthy()
  })

  it('hands over the whole group, not the first three of it', async () => {
    // members.slice(0, 3) is what made a seven-member cloud lose four of them
    // silently, and the three it kept were whichever happened to come first
    const { pool, members } = seed()
    await rainThought(pool.id)
    const [action, input] = run.mock.calls[0] as [string, { inside: string[] }]
    expect(action).toBe('rain')
    expect(input.inside).toHaveLength(members.length)
    expect(input.inside).toContain('What is mem2.0')
  })

  it('tells it what is already under there, so nothing arrives twice', async () => {
    const { pool } = seed()
    applyRain(pool.id, OUT, 'r1')
    run.mockClear()
    await rainThought(pool.id)
    const [, input] = run.mock.calls[0] as [string, { already: string[] }]
    expect(input.already).toContain('Decide storage: pgvector here or a hosted memory API')
  })

  it('takes "nothing follows from this yet" for an answer', async () => {
    // the honest outcome the template could never give: it always had five
    // rows, whether or not the pile contained a single next action
    const { pool } = seed()
    run.mockResolvedValue({
      runId: 'r1',
      output: { ...OUT, steps: [], missing: ['Which of these you actually want to ship first'] },
    })
    const res = await rainThought(pool.id)
    expect(res.kind).toBe('thin')
    if (res.kind !== 'thin') return
    expect(res.missing[0]).toContain('ship first')
    expect(kids(pool.id).filter((t) => t.type === 'action')).toHaveLength(0)
  })

  it('changes nothing at all when it cannot get out there', async () => {
    const { pool, members } = seed()
    run.mockRejectedValueOnce(new Error('offline'))
    expect((await rainThought(pool.id)).kind).toBe('failed')
    expect(kids(pool.id)).toHaveLength(members.length)
  })
})
