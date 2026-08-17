import { describe, expect, it } from 'vitest'
import { apply, dropOf, initial, legal, moves, refuse, won, type Level } from './rules'
import { PIGMENT, same } from './color'

const simple: Level = {
  id: 0,
  name: 'test',
  note: '',
  cap: 2,
  target: 'orange',
  drops: [{ color: 'red' }, { color: 'yellow' }],
}

const held: Level = {
  id: 0,
  name: 'test',
  note: '',
  cap: 4,
  target: 'orange',
  membranes: [{ id: 'a', pore: 1 }],
  drops: [{ color: 'yellow' }, { color: 'red', where: 'a' }, { color: 'red', where: 'a' }, { color: 'yellow' }],
}

describe('the three moves', () => {
  it('joins two drops into one that is heavier and blended', () => {
    const s = apply(initial(simple), simple, { kind: 'merge', from: 'd0', into: 'd1' })
    expect(s.drops).toHaveLength(1)
    expect(s.drops[0].mass).toBe(2)
    expect(same(s.drops[0].color, PIGMENT.orange)).toBe(true)
    expect(s.moves).toBe(1)
  })

  it('keeps the standing drop’s id, so the one you dragged is the one that vanishes', () => {
    const s = apply(initial(simple), simple, { kind: 'merge', from: 'd0', into: 'd1' })
    expect(s.drops[0].id).toBe('d1')
  })

  it('leaves the state it was given alone, which is all undo needs', () => {
    const before = initial(simple)
    apply(before, simple, { kind: 'merge', from: 'd0', into: 'd1' })
    expect(before.drops).toHaveLength(2)
    expect(before.moves).toBe(0)
  })

  it('takes a matching drop into the core and counts its mass', () => {
    const merged = apply(initial(simple), simple, { kind: 'merge', from: 'd0', into: 'd1' })
    const done = apply(merged, simple, { kind: 'join', id: 'd1' })
    expect(done.core).toBe(2)
    expect(won(done)).toBe(true)
  })
})

describe('the refusals', () => {
  it('refuses a merge that would burst the skin', () => {
    const three: Level = { ...simple, cap: 2, drops: [{ color: 'red' }, { color: 'yellow' }, { color: 'yellow' }] }
    const s = apply(initial(three), three, { kind: 'merge', from: 'd0', into: 'd1' })
    expect(s.drops.find((d) => d.id === 'd1')!.mass).toBe(2)
    expect(refuse(s, three, { kind: 'merge', from: 'd2', into: 'd1' })).toMatch(/too much/)
  })

  it('refuses to merge across a skin', () => {
    expect(refuse(initial(held), held, { kind: 'merge', from: 'd0', into: 'd1' })).toMatch(/skin/)
  })

  it('refuses to pass a drop bigger than the pore', () => {
    const s = initial(held)
    const inside = apply(s, held, { kind: 'merge', from: 'd1', into: 'd2' })
    expect(refuse(inside, held, { kind: 'pass', id: 'd2' })).toMatch(/too big/)
  })

  it('refuses the core anything that is not its colour', () => {
    expect(refuse(initial(simple), simple, { kind: 'join', id: 'd0' })).toMatch(/colour/)
  })

  it('refuses the core anything still behind a skin', () => {
    expect(refuse(initial(held), held, { kind: 'join', id: 'd1' })).toMatch(/skin/)
  })

  it('offers no illegal move in the list it hands the solver', () => {
    const s = initial(held)
    for (const m of moves(s, held)) expect(legal(s, held, m)).toBe(true)
  })
})

describe('membranes', () => {
  it('lets a drop out into the sky and sheds the skin once it is empty', () => {
    let s = initial(held)
    s = apply(s, held, { kind: 'pass', id: 'd1' })
    expect(dropOf(s, 'd1')!.where).toBeNull()
    expect(s.membranes).toHaveLength(1)
    s = apply(s, held, { kind: 'pass', id: 'd2' })
    expect(s.membranes).toHaveLength(0)
  })

  it('drops a passing drop into the skin outside, not into the sky', () => {
    const nested: Level = {
      ...held,
      membranes: [
        { id: 'a', pore: 2 },
        { id: 'b', parent: 'a', pore: 2 },
      ],
      drops: [{ color: 'red', where: 'b' }, { color: 'yellow' }],
    }
    const s = apply(initial(nested), nested, { kind: 'pass', id: 'd0' })
    expect(dropOf(s, 'd0')!.where).toBe('a')
    expect(s.membranes.map((m) => m.id)).toEqual(['a'])
  })
})
