import { describe, expect, it } from 'vitest'
import { branchOf, dropAt, MAX_DEPTH, type Line } from './arrange'

const H = 40
const G = 'g'
/** `'A'`, `' B'`, `'  C'` — one space of leading indent per level. */
function list(...spec: string[]): Line[] {
  return spec.map((s, i) => ({
    id: s.trim(),
    depth: s.length - s.trimStart().length,
    mid: i * H + H / 2,
  }))
}
/** the y that puts the finger in gap `n` — just past row n-1's middle */
const inGap = (n: number) => n * H - H / 2 + 1

describe('what travels with a row', () => {
  it('is the row and everything under it', () => {
    const l = list('A', ' B', '  C', 'D')
    expect(branchOf(l, 'A').map((x) => x.id)).toEqual(['A', 'B', 'C'])
    expect(branchOf(l, 'B').map((x) => x.id)).toEqual(['B', 'C'])
    expect(branchOf(l, 'D').map((x) => x.id)).toEqual(['D'])
  })
  it('stops at the next row that is no deeper', () => {
    expect(branchOf(list('A', ' B', 'C', ' D'), 'A').map((x) => x.id)).toEqual(['A', 'B'])
  })
  it('is nothing at all for a row that is not there', () => {
    expect(branchOf(list('A'), 'Z')).toEqual([])
    expect(dropAt(list('A'), 'Z', 0, 0, 24, G)).toBeNull()
  })
})

describe('dragging up and down', () => {
  const l = list('A', 'B', 'C')

  it('lands at the top when dragged above everything', () => {
    const d = dropAt(l, 'C', -200, 0, 24, G)
    expect(d).toMatchObject({ parent: G, after: null, depth: 0 })
  })

  it('lands after the row it was dropped below', () => {
    // C removed leaves [A, B]; gap 1 is between them
    expect(dropAt(l, 'C', inGap(1), 0, 24, G)).toMatchObject({ parent: G, after: 'A' })
  })

  it('lands at the end when dragged past everything', () => {
    expect(dropAt(l, 'A', 9999, 0, 24, G)).toMatchObject({ parent: G, after: 'C' })
  })

  it('counts gaps in the list without the row being dragged', () => {
    // The row you are holding is not a place you can drop it, so it does not
    // take up a gap while you hold it — hold A and drag just past B's middle,
    // and that is the first gap, not the second.
    const d = dropAt(l, 'A', H + H / 2 + 1, 0, 24, G)
    expect(d).toMatchObject({ after: 'B', gap: 1 })
  })
})

describe('dragging sideways to nest', () => {
  it('goes under the row above when dragged one indent right', () => {
    const l = list('A', 'B')
    expect(dropAt(l, 'B', inGap(1), 24, 24, G)).toMatchObject({ parent: 'A', after: null, depth: 1 })
  })

  it('will not go deeper than one past the row above it', () => {
    // dragged four indents right, with only one level available
    const l = list('A', 'B')
    expect(dropAt(l, 'B', inGap(1), 96, 24, G)).toMatchObject({ parent: 'A', depth: 1 })
  })

  it('comes back out when dragged left', () => {
    const l = list('A', ' B')
    expect(dropAt(l, 'B', inGap(1), -24, 24, G)).toMatchObject({ parent: G, after: 'A', depth: 0 })
  })

  it('will not go shallower than the row below the gap', () => {
    // Dragging C left here would leave D pointing at a parent that is no longer
    // above it. This is the rule people forget, and the tree it produces is
    // one the sky then has to repair by dropping something.
    const l = list('A', ' B', ' C', ' D')
    expect(dropAt(l, 'C', inGap(2), -96, 24, G)).toMatchObject({ depth: 1, parent: 'A' })
  })

  it('may go shallow at the end of a branch, where nothing is left below it', () => {
    const l = list('A', ' B', ' C')
    expect(dropAt(l, 'C', 9999, -96, 24, G)).toMatchObject({ depth: 0, parent: G, after: 'A' })
  })

  it('finds the sibling it sits after, not merely the row above it', () => {
    // dropping at depth 1 below a depth-2 row: the previous sibling is B, and
    // the row immediately above is its child
    const l = list('A', ' B', '  B1', 'C')
    expect(dropAt(l, 'C', inGap(3), 24, 24, G)).toMatchObject({ parent: 'A', after: 'B', depth: 1 })
  })

  it('is the first child when the row above is its new parent', () => {
    // and the depth is forced: B1 sits below the gap at depth 1, so there is
    // nowhere shallower to land even if you drag hard left
    const l = list('A', 'B', ' B1')
    expect(dropAt(l, 'A', H + H / 2 + 1, 24, 24, G)).toMatchObject({ parent: 'B', after: null, depth: 1 })
    expect(dropAt(l, 'A', H + H / 2 + 1, -96, 24, G)).toMatchObject({ parent: 'B', depth: 1 })
  })

  it('rounds to the nearest level rather than needing a whole one', () => {
    const l = list('A', 'B')
    expect(dropAt(l, 'B', inGap(1), 13, 24, G)).toMatchObject({ depth: 1 })
    expect(dropAt(l, 'B', inGap(1), 11, 24, G)).toMatchObject({ depth: 0 })
  })
})

describe('the positions that must be unreachable', () => {
  it('never offers a row its own descendant as a parent', () => {
    // this is the move that makes a branch unreachable from its own root, and
    // it has to be impossible to express rather than rejected after the fact
    const l = list('A', ' B', '  C', ' D', 'E')
    for (let y = -100; y < 400; y += 7) {
      for (let dx = -120; dx <= 120; dx += 6) {
        const d = dropAt(l, 'A', y, dx, 24, G)
        expect(['A', 'B', 'C']).not.toContain(d?.parent)
        expect(['A', 'B', 'C']).not.toContain(d?.after)
      }
    }
  })

  it('never offers a depth that leaves a gap in the tree', () => {
    const l = list('A', ' B', '  C', 'D')
    for (let y = -100; y < 400; y += 5) {
      for (let dx = -120; dx <= 120; dx += 5) {
        const d = dropAt(l, 'D', y, dx, 24, G)
        const rest = l.filter((x) => x.id !== 'D')
        const above = rest[(d as { gap: number }).gap - 1]
        expect(d!.depth).toBeLessThanOrEqual(above ? above.depth + 1 : 0)
        expect(d!.depth).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('always names a parent that really is one shallower than the drop', () => {
    const l = list('A', ' B', '  C', ' D', 'E', ' F')
    for (let y = -60; y < 300; y += 9) {
      for (let dx = -100; dx <= 100; dx += 9) {
        const d = dropAt(l, 'F', y, dx, 24, G)!
        if (d.depth === 0) expect(d.parent).toBe(G)
        else expect(l.find((x) => x.id === d.parent)!.depth).toBe(d.depth - 1)
      }
    }
  })
})

describe('the floor of the list', () => {
  it('will not push a row deeper than the page can draw', () => {
    // past MAX_DEPTH branchesOf stops walking, so a row nested one level
    // further would simply not be on the page any more — which is the
    // disappearing act that showing the tree was meant to end
    const deep = Array.from({ length: MAX_DEPTH + 1 }, (_, i) => ' '.repeat(i) + `d${i}`)
    const l = list(...deep, 'X')
    for (let dx = 0; dx <= 400; dx += 8) {
      const d = dropAt(l, 'X', 9999, dx, 24, G)!
      expect(d.depth).toBeLessThanOrEqual(MAX_DEPTH)
    }
  })
})
