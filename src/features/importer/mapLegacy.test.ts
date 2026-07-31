import { describe, expect, it } from 'vitest'
import { mapLegacy } from './mapLegacy'

// A miniature but structurally faithful VENIA workspace blob.
const BLOB = {
  dump: [
    {
      id: 'g1',
      t: 'SS27 campaign',
      d: '2026-06-01T10:00:00.000Z',
      done: false,
      due: '2026-08-15',
      children: [
        { id: 'c1', t: 'Write brief', done: true },
        { id: 'c2', t: 'Book photographer', done: false },
        { id: 'c3', t: 'Scout locations', done: false, parentId: 'c2' },
      ],
      web: {
        branches: [{ label: 'Creative direction', ids: ['c1'] }],
        pos: { g1: { x: 100, y: 100 }, c1: { x: 200, y: 220 }, ghost: { x: 1, y: 1 } },
        extra: [{ id: 'x1', t: 'What about letters?' }],
      },
      work: { q: 'Research campaign printers', md: '# Findings\nSome research…', at: '2026-06-05T00:00:00.000Z' },
    },
    { id: 'n1', t: 'Order labels', d: '2026-06-02T10:00:00.000Z', done: false, snooze: '2026-09-01' },
    { id: 'n2', t: 'Done thing', done: true, doneAt: '2026-06-03T00:00:00.000Z' },
    { id: '', t: '', done: false }, // empty — skipped
  ],
  eniMemory: [
    { id: 'm1', t: 'Two-person team, LA based', at: '2026-05-01T00:00:00.000Z', src: 'chat' },
    { id: 'm2', t: '' }, // empty — skipped
  ],
  dumpMasterPos: { g1: { x: 500, y: 600 }, unknown: { x: 9, y: 9 } },
  dumpPlan: { headline: 'not modeled — archived' },
}

describe('mapLegacy', () => {
  const result = mapLegacy(BLOB, 'user-1', idFactory())

  it('maps counts correctly', () => {
    expect(result.counts).toEqual({
      notes: 2,
      goals: 1,
      actions: 3,
      concepts: 1,
      ideas: 1,
      edges: 5, // 3 part_of steps (one re-pointed) + concept→goal + idea relates_to
      memories: 1,
      artifacts: 1,
    })
  })

  it('creates the goal with due date and its steps with statuses', () => {
    const goal = result.thoughts.find((t) => t.title === 'SS27 campaign')!
    expect(goal.type).toBe('goal')
    expect(goal.due_date).toBe('2026-08-15')
    const brief = result.thoughts.find((t) => t.title === 'Write brief')!
    expect(brief.type).toBe('action')
    expect(brief.status).toBe('done')
  })

  it('nested sub-steps attach to their sibling parent, not the goal', () => {
    const book = result.thoughts.find((t) => t.title === 'Book photographer')!
    const scout = result.thoughts.find((t) => t.title === 'Scout locations')!
    const edge = result.relationships.find((r) => r.from_id === scout.id && r.type === 'part_of')!
    expect(edge.to_id).toBe(book.id)
  })

  it('re-points branch members from the goal to the concept', () => {
    const concept = result.thoughts.find((t) => t.title === 'Creative direction')!
    const brief = result.thoughts.find((t) => t.title === 'Write brief')!
    const edge = result.relationships.find((r) => r.from_id === brief.id && r.type === 'part_of')!
    expect(edge.to_id).toBe(concept.id)
  })

  it('imports map positions with ids remapped and unknown ids dropped', () => {
    const goal = result.thoughts.find((t) => t.title === 'SS27 campaign')!
    const goalLayout = result.layouts.find((l) => l.scope === `thought:${goal.id}`)!
    expect(Object.keys(goalLayout.positions)).toHaveLength(2) // ghost dropped
    const brain = result.layouts.find((l) => l.scope === 'brain')!
    expect(brain.positions[goal.id]).toEqual({ x: 500, y: 600 })
  })

  it('preserves snooze, memory, and research artifacts', () => {
    const labels = result.thoughts.find((t) => t.title === 'Order labels')!
    expect(labels.snooze_until).toBe('2026-09-01')
    expect(result.memories[0].content).toBe('Two-person team, LA based')
    expect(result.memories[0].source).toBe('import')
    expect(result.artifacts[0].title).toBe('Research campaign printers')
    expect(result.artifacts[0].content_md).toContain('Findings')
  })

  it('all rows carry the importing user id and import source', () => {
    expect(result.thoughts.every((t) => t.user_id === 'user-1' && t.source === 'import')).toBe(true)
  })
})

function idFactory() {
  let i = 0
  return () => `00000000-0000-4000-8000-${String(i++).padStart(12, '0')}`
}

describe('what the importer refuses to write', () => {
  it('draws each connection once, however many ways the dump implies it', () => {
    // There is a unique index on (from_id, to_id, type). A child listed under
    // a goal *and* carrying that goal as its parentId produced two identical
    // rows, and the second aborted the whole import partway through.
    const out = mapLegacy(
      {
        dump: [
          { id: 'g1', t: 'SS27 campaign', children: [{ id: 'c1', t: 'Shoot the roll', parentId: 'g1' }] },
          { id: 'c1', t: 'Shoot the roll', parentId: 'g1' },
        ],
      },
      'u1',
      idFactory(),
    )
    const pairs = out.relationships.map((r) => `${r.from_id}|${r.to_id}|${r.type}`)
    expect(pairs.length).toBeGreaterThan(0)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('drops an edge to a parent that never became a thought', () => {
    // `mapId` mints a uuid for any old id it is handed, whether or not that id
    // ever becomes a row. An edge to one is a foreign key violation, and it
    // used to abort the import with the thoughts already written and the
    // relationships half in.
    const out = mapLegacy({ dump: [{ id: 'a1', t: 'A loose thought', parentId: 'ghost' }] }, 'u1', idFactory())
    expect(out.thoughts).toHaveLength(1)
    // the thought survives; only the edge to the parent that is not there goes
    expect(out.relationships).toHaveLength(0)
    expect(out.counts.edges).toBe(0)
  })
})
