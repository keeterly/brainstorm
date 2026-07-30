import { beforeEach, describe, expect, it } from 'vitest'
import { useGraph } from '@/store/graph'
import { bin, membersOf, renameGroup, takeOut, ungroup } from './groupFlow'

const S = () => useGraph.getState()
const openIds = () => S().thoughts.filter((t) => t.status === 'open').map((t) => t.id)
const partOf = (id: string) => S().relationships.find((r) => r.type === 'part_of' && r.from_id === id)?.to_id

/** A group with three things in it, itself inside a bigger one. */
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
  const s = S()
  const top = s.addThought({ raw_content: 'SS27', title: 'SS27', type: 'goal' })
  const g = s.addThought({ raw_content: 'Travel', title: 'Travel', type: 'goal' })
  const a = s.addThought({ raw_content: 'Fares', title: 'Fares' })
  const bb = s.addThought({ raw_content: 'Seat map', title: 'Seat map' })
  const c = s.addThought({ raw_content: 'Book it', title: 'Book it' })
  s.addRelationship(g.id, top.id, 'part_of')
  for (const m of [a, bb, c]) s.addRelationship(m.id, g.id, 'part_of')
  return { top, g, a, b: bb, c }
}

beforeEach(seed)

describe('naming a group yourself', () => {
  it('was impossible: the only way to rename anything was to tell the agent about it', () => {
    const { g } = seed()
    const u = renameGroup(g.id, 'PFW Travel Booking')!
    expect(S().thoughts.find((t) => t.id === g.id)?.title).toBe('PFW Travel Booking')
    u.undo()
    expect(S().thoughts.find((t) => t.id === g.id)?.title).toBe('Travel')
  })

  it('does nothing at all for a name that is blank or unchanged', () => {
    const { g } = seed()
    expect(renameGroup(g.id, '   ')).toBeNull()
    expect(renameGroup(g.id, 'Travel')).toBeNull()
  })

  it('moves the raw text with the title, so nothing reads the old name back', () => {
    const { g } = seed()
    renameGroup(g.id, 'PFW Travel')
    const t = S().thoughts.find((x) => x.id === g.id)!
    expect(t.raw_content).toBe('PFW Travel')
  })
})

describe('taking one thing out', () => {
  it('leaves it in the sky rather than throwing it away', () => {
    const { g, a } = seed()
    const u = takeOut(a.id)!
    expect(partOf(a.id)).toBeUndefined()
    expect(openIds()).toContain(a.id)
    expect(membersOf(g.id).map((m) => m.id)).not.toContain(a.id)
    u.undo()
    expect(partOf(a.id)).toBe(g.id)
  })

  it('says which one, because three rows of "removed" tell you nothing', () => {
    const { a } = seed()
    expect(takeOut(a.id)!.note).toContain('Fares')
  })
})

describe('losing the grouping but keeping the things', () => {
  it('is the common case, and it was the one with no gesture at all', () => {
    const { g, a, b, c } = seed()
    const u = ungroup(g.id)!
    // the name is gone from the sky
    expect(openIds()).not.toContain(g.id)
    // the contents are not
    for (const m of [a, b, c]) expect(openIds()).toContain(m.id)
    u.undo()
    expect(openIds()).toContain(g.id)
    for (const m of [a, b, c]) expect(partOf(m.id)).toBe(g.id)
  })

  it('lands the contents where the group stood, not at the top of the world', () => {
    // a group inside SS27 that dissolves should leave its contents inside SS27
    const { top, g, a } = seed()
    ungroup(g.id)
    expect(partOf(a.id)).toBe(top.id)
  })

  it('puts them back exactly, without leaving the stand-in edges behind', () => {
    const { top, g, a, b, c } = seed()
    const u = ungroup(g.id)!
    u.undo()
    for (const m of [a, b, c]) expect(partOf(m.id)).toBe(g.id)
    // and nothing is now doubly parented
    expect(S().relationships.filter((r) => r.type === 'part_of' && r.to_id === top.id)).toHaveLength(1)
  })

  it('works on a group that stands on its own', () => {
    const { g, a } = seed()
    const rel = S().relationships.find((r) => r.from_id === g.id)!
    S().deleteRelationship(rel.id)
    ungroup(g.id)
    expect(partOf(a.id)).toBeUndefined()
    expect(openIds()).toContain(a.id)
  })
})

describe('putting a whole group away', () => {
  it('takes what is inside with it, rather than leaving orphans and no name', () => {
    const { g, a, b, c } = seed()
    const u = bin(g.id)!
    for (const t of [g, a, b, c]) expect(openIds()).not.toContain(t.id)
    u.undo()
    for (const t of [g, a, b, c]) expect(openIds()).toContain(t.id)
  })

  it('reaches all the way down, not one level', () => {
    const { g, a } = seed()
    const s = S()
    const deep = s.addThought({ raw_content: 'Aisle or window', title: 'Aisle or window' })
    s.addRelationship(deep.id, a.id, 'part_of')
    bin(g.id)
    expect(openIds()).not.toContain(deep.id)
  })

  it('touches nothing outside it', () => {
    const { top, g } = seed()
    const loose = S().addThought({ raw_content: 'Care labels', title: 'Care labels' })
    bin(g.id)
    expect(openIds()).toContain(top.id)
    expect(openIds()).toContain(loose.id)
  })

  it('keeps the ids and the threads, because this has to be survivable', () => {
    // archived, not deleted: a saved position, a relationship and a finished
    // run all point at an id, and a real delete takes the id with it
    const { g, a } = seed()
    const before = S().relationships.length
    bin(g.id)
    expect(S().thoughts.find((t) => t.id === a.id)).toBeTruthy()
    expect(S().relationships).toHaveLength(before)
  })

  it('counts what went with it', () => {
    const { g } = seed()
    expect(bin(g.id)!.note).toContain('3 inside it')
  })
})

describe('when the thing is not there', () => {
  it('says so by doing nothing, rather than throwing', () => {
    expect(renameGroup('nope', 'x')).toBeNull()
    expect(takeOut('nope')).toBeNull()
    expect(ungroup('nope')).toBeNull()
    expect(bin('nope')).toBeNull()
  })
})
