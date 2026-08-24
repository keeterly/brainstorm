import { describe, expect, it } from 'vitest'
import { briefMap, worthDrawing } from './brief-map'

const deps = (o: Record<string, string[]>) => new Map(Object.entries(o))

describe('laying a brief out as a map', () => {
  it('runs the sequence down a spine', () => {
    // "steps: the actual sequence, first thing first" — the order is the one
    // thing always worth drawing, and it is what stops a map with no
    // dependencies in it from coming out as a heap
    const m = briefMap(['a', 'b', 'c'], deps({}))
    expect(m.nodes.map((n) => n.at)).toEqual([0, 1, 2])
    expect(m.edges).toEqual([
      { from: 'a', to: 'b', kind: 'spine' },
      { from: 'b', to: 'c', kind: 'spine' },
    ])
    expect(m.branches).toBe(0)
  })

  it('draws a real dependency as a branch off it', () => {
    // c waits on a, which the spine does not say — a runs to b runs to c
    const m = briefMap(['a', 'b', 'c'], deps({ c: ['a'] }))
    expect(m.edges.filter((e) => e.kind === 'branch')).toEqual([{ from: 'a', to: 'c', kind: 'branch' }])
    expect(m.branches).toBe(1)
  })

  it('does not draw a second line down the gap the spine already covers', () => {
    // b waits on a, and a is the step immediately before it. That is what the
    // sequence already means; drawing it again lays two lines in one gap and
    // makes every ordinary plan look tangled.
    const m = briefMap(['a', 'b'], deps({ b: ['a'] }))
    expect(m.branches).toBe(0)
    expect(m.edges).toEqual([{ from: 'a', to: 'b', kind: 'spine' }])
    // …but the node still knows it is waiting, which is what dims it
    expect(m.nodes[1].after).toEqual(['a'])
  })

  it('handles a fork and a diamond', () => {
    // b and c both wait on a; d waits on both
    const m = briefMap(['a', 'b', 'c', 'd'], deps({ b: ['a'], c: ['a'], d: ['b', 'c'] }))
    const branch = m.edges.filter((e) => e.kind === 'branch')
    expect(branch).toEqual([
      { from: 'a', to: 'c', kind: 'branch' },
      { from: 'b', to: 'd', kind: 'branch' },
    ])
    // a→b and c→d are the spine's own gaps, so they are not repeated
    expect(m.branches).toBe(2)
  })

  it('does not hang on a cycle', () => {
    /*
     * The model emits one occasionally. Nothing in here walks the graph — the
     * edges are worked out pairwise — which is the whole reason a cycle costs
     * a line rather than the page.
     */
    const m = briefMap(['a', 'b', 'c'], deps({ a: ['c'], c: ['a'] }))
    expect(m.nodes).toHaveLength(3)
    // c→a points backwards over a gap the spine does not cover, and a→c is the
    // same pair the other way; both are drawn, neither is followed
    expect(m.branches).toBe(2)
  })

  it('ignores an edge to something that is not on the map', () => {
    // the step was put away, or the model referenced a tempId it never emitted
    const m = briefMap(['a', 'b'], deps({ b: ['ghost'], a: ['also-gone'] }))
    expect(m.nodes.every((n) => n.after.length === 0)).toBe(true)
    expect(m.branches).toBe(0)
  })

  it('ignores a step that waits on itself', () => {
    const m = briefMap(['a', 'b'], deps({ b: ['b'] }))
    expect(m.nodes[1].after).toEqual([])
    expect(m.branches).toBe(0)
  })

  it('says a dependency once, however many times it is listed', () => {
    const m = briefMap(['a', 'b', 'c'], deps({ c: ['a', 'a', 'a'] }))
    expect(m.nodes[2].after).toEqual(['a'])
    expect(m.branches).toBe(1)
  })

  it('gives a repeated id one place on the map, not two', () => {
    // two positions for one node means two spine lines into it and a second
    // node drawn on top of the first
    const m = briefMap(['a', 'b', 'a'], deps({}))
    expect(m.nodes).toHaveLength(2)
    expect(m.nodes.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('carries which steps are blocked, so the drawing can dim them', () => {
    const m = briefMap(['a', 'b'], deps({ b: ['a'] }), new Set(['b']))
    expect(m.nodes.find((n) => n.id === 'b')?.blocked).toBe(true)
    expect(m.nodes.find((n) => n.id === 'a')?.blocked).toBe(false)
  })

  it('copes with nothing at all', () => {
    const m = briefMap([], deps({}))
    expect(m).toEqual({ nodes: [], edges: [], branches: 0 })
  })
})

describe('whether to draw it', () => {
  it('does not make a picture out of one step', () => {
    // one step is a sentence, not a diagram
    expect(worthDrawing(briefMap(['a'], deps({})))).toBe(false)
    expect(worthDrawing(briefMap([], deps({})))).toBe(false)
  })

  it('draws two, even with no dependencies between them', () => {
    // the spine and the effort dots are both more than the numbered list showed
    expect(worthDrawing(briefMap(['a', 'b'], deps({})))).toBe(true)
  })
})
