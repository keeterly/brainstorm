import { beforeEach, describe, expect, it } from 'vitest'
import { useGraph } from '@/store/graph'
import { rankOf } from '@/domain/rank'
import { branchesOf, membersOf, moveInto } from './groupFlow'

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
}

const S = () => useGraph.getState()
const make = (title: string) => S().addThought({ raw_content: title, title, type: 'idea' })
const put = (childId: string, parentId: string) => S().addRelationship(childId, parentId, 'part_of')

/** A group with `names` inside it, in that order. */
function group(name: string, names: string[]) {
  const g = S().addThought({ raw_content: name, title: name, type: 'goal' })
  const kids = names.map((n) => {
    const t = make(n)
    put(t.id, g.id)
    return t
  })
  return { g, kids }
}

const listOf = (id: string) => membersOf(id, true).map((t) => t.title)
const treeOf = (id: string) => branchesOf(id, true).map((b) => `${'  '.repeat(b.depth)}${b.t.title}`)

beforeEach(seed)

describe('the order things sit in', () => {
  it('is the order they were made, until something is moved', () => {
    const { g } = group('SS27', ['A', 'B', 'C'])
    expect(listOf(g.id)).toEqual(['A', 'B', 'C'])
  })

  it('numbers the list the first time it is arranged, and only that time', () => {
    // A list carries no order at all until you touch it, so the first move has
    // to give the whole thing ranks — there is nothing to sit between. Every
    // move after that writes one row, which is the whole reason ranks are
    // spaced rather than consecutive.
    const { g, kids } = group('SS27', ['A', 'B', 'C'])
    moveInto(kids[2].id, g.id, null)
    expect(listOf(g.id)).toEqual(['C', 'A', 'B'])
    for (const k of kids) expect(rankOf(S().thoughts.find((t) => t.id === k.id)!)).not.toBeNull()

    const before = new Map(S().thoughts.map((t) => [t.id, rankOf(t)]))
    moveInto(kids[0].id, g.id, kids[1].id)
    const moved = S().thoughts.filter((t) => rankOf(t) !== before.get(t.id))
    expect(moved.map((t) => t.title)).toEqual(['A'])
  })

  it('drops a row between two others', () => {
    const { g, kids } = group('SS27', ['A', 'B', 'C', 'D'])
    moveInto(kids[3].id, g.id, kids[0].id)
    expect(listOf(g.id)).toEqual(['A', 'D', 'B', 'C'])
  })

  it('sends one to the end', () => {
    const { g, kids } = group('SS27', ['A', 'B', 'C'])
    moveInto(kids[0].id, g.id, kids[2].id)
    expect(listOf(g.id)).toEqual(['B', 'C', 'A'])
  })

  it('survives being rearranged over and over', () => {
    // the gaps run out eventually and the list is spread again; the order must
    // be exactly what the moves said either way
    const { g, kids } = group('SS27', ['A', 'B', 'C', 'D', 'E'])
    for (let i = 0; i < 120; i++) {
      // keep dropping into the same gap, which is what exhausts it
      moveInto(kids[4].id, g.id, kids[0].id)
      moveInto(kids[3].id, g.id, kids[0].id)
    }
    expect(listOf(g.id)).toEqual(['A', 'D', 'E', 'B', 'C'])
  })

  it('puts the order back exactly, including any spreading it had to do', () => {
    const { g, kids } = group('SS27', ['A', 'B', 'C', 'D'])
    for (let i = 0; i < 90; i++) moveInto(kids[3].id, g.id, kids[0].id)
    const before = listOf(g.id)
    const ranks = S().thoughts.map((t) => [t.id, rankOf(t)])
    const u = moveInto(kids[2].id, g.id, null)
    expect(listOf(g.id)).not.toEqual(before)
    u?.undo()
    expect(listOf(g.id)).toEqual(before)
    expect(S().thoughts.map((t) => [t.id, rankOf(t)])).toEqual(ranks)
  })

  it('is the order the sky rings them in too, not just the list', () => {
    // membersOf is what the sky lays out a pool from, so an order you set in
    // the list that the sky ignored would be two apps disagreeing
    const { g, kids } = group('SS27', ['A', 'B', 'C'])
    moveInto(kids[2].id, g.id, null)
    expect(membersOf(g.id).map((t) => t.title)).toEqual(['C', 'A', 'B'])
  })
})

describe('nesting one row under another', () => {
  it('makes the row it went under a group, in the graph and so in every view', () => {
    // nothing marks a thought as a group; being part_of'd is what makes one.
    // So nesting here is the same fact the sky reads to draw a pool.
    const { g, kids } = group('SS27', ['Lookbook', 'Shoot the lookbook'])
    moveInto(kids[1].id, kids[0].id, null)
    expect(membersOf(kids[0].id).map((t) => t.title)).toEqual(['Shoot the lookbook'])
    expect(membersOf(g.id).map((t) => t.title)).toEqual(['Lookbook'])
  })

  it('keeps the nested row on the page instead of vanishing it', () => {
    const { g, kids } = group('SS27', ['Lookbook', 'Shoot it', 'Book the studio'])
    moveInto(kids[1].id, kids[0].id, null)
    expect(treeOf(g.id)).toEqual(['Lookbook', '  Shoot it', 'Book the studio'])
  })

  it('nests as deep as you like, and says how deep each row is', () => {
    const { g, kids } = group('SS27', ['A', 'B', 'C'])
    moveInto(kids[1].id, kids[0].id, null)
    moveInto(kids[2].id, kids[1].id, null)
    expect(branchesOf(g.id, true).map((b) => b.depth)).toEqual([0, 1, 2])
    expect(branchesOf(g.id, true).map((b) => b.parentId)).toEqual([g.id, kids[0].id, kids[1].id])
  })

  it('takes it back out again, to exactly where it was', () => {
    const { g, kids } = group('SS27', ['A', 'B', 'C'])
    const u = moveInto(kids[1].id, kids[0].id, null)
    expect(treeOf(g.id)).toEqual(['A', '  B', 'C'])
    u?.undo()
    expect(treeOf(g.id)).toEqual(['A', 'B', 'C'])
  })

  it('refuses to put a thing inside itself', () => {
    const { kids } = group('SS27', ['A'])
    expect(moveInto(kids[0].id, kids[0].id, null)).toBeNull()
  })

  it('refuses to put a group inside its own child, which would orphan the branch', () => {
    // rebuild() survives a cycle by dropping whatever caused it, which from the
    // outside looks exactly like the app having eaten your work
    const { kids } = group('SS27', ['Parent', 'Child'])
    moveInto(kids[1].id, kids[0].id, null)
    expect(moveInto(kids[0].id, kids[1].id, null)).toBeNull()
    expect(membersOf(kids[0].id).map((t) => t.title)).toEqual(['Child'])
  })

  it('refuses a grandchild too, not just a direct one', () => {
    const { kids } = group('SS27', ['A', 'B', 'C'])
    moveInto(kids[1].id, kids[0].id, null)
    moveInto(kids[2].id, kids[1].id, null)
    expect(moveInto(kids[0].id, kids[2].id, null)).toBeNull()
  })

  it('refuses to land after a row that is not there', () => {
    const { g, kids } = group('SS27', ['A', 'B'])
    expect(moveInto(kids[0].id, g.id, 'nobody')).toBeNull()
    expect(moveInto(kids[0].id, g.id, kids[0].id)).toBeNull()
  })
})

describe('what the tree shows', () => {
  it('sinks finished work among its own siblings, not to the foot of everything', () => {
    // a done thing three deep belongs beside the things it is with
    const { g, kids } = group('SS27', ['A', 'B', 'C'])
    moveInto(kids[1].id, kids[0].id, null)
    const inner = make('B2')
    put(inner.id, kids[0].id)
    S().toggleDone(kids[1].id)
    expect(treeOf(g.id)).toEqual(['A', '  B2', '  B', 'C'])
  })

  it('leaves out what has been finished when it is not asked for', () => {
    const { g, kids } = group('SS27', ['A', 'B'])
    S().toggleDone(kids[0].id)
    expect(branchesOf(g.id).map((b) => b.t.title)).toEqual(['B'])
  })

  it('does not hang on an edge that loops', () => {
    const { g, kids } = group('SS27', ['A', 'B'])
    // forced past moveInto's guard, the way a bad import or an older build could
    put(g.id, kids[0].id)
    expect(() => branchesOf(g.id, true)).not.toThrow()
    expect(treeOf(g.id).length).toBeLessThan(10)
  })

  it('stops descending rather than running away on a very deep tree', () => {
    const { g, kids } = group('SS27', ['A'])
    let under = kids[0].id
    for (let i = 0; i < 20; i++) {
      const t = make(`d${i}`)
      put(t.id, under)
      under = t.id
    }
    expect(branchesOf(g.id, true).length).toBeLessThanOrEqual(7)
  })
})

describe('what the undo bar says', () => {
  it('names what it went under, when it went under something', () => {
    // "moved" is true of both, and useless for the one you might want back:
    // a nest changes the shape of the group, and the bar is the only place
    // that says so before you have looked away
    const { kids } = group('SS27', ['Lookbook', 'Shoot it'])
    expect(moveInto(kids[1].id, kids[0].id, null)?.note).toContain('under “Lookbook”')
  })

  it('just says it moved, when it only changed places', () => {
    const { g, kids } = group('SS27', ['A', 'B'])
    expect(moveInto(kids[1].id, g.id, null)?.note).toMatch(/“B” moved/)
  })
})
