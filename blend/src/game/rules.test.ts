import { describe, expect, it } from 'vitest'
import { apply, dropOf, initial, legal, moves, refuse, won, type Level } from './rules'
import { HUE } from './color'

const simple: Level = {
  id: 0,
  name: 'test',
  note: '',
  cap: 2,
  takes: 1,
  target: 'orange',
  drops: [{ color: 'red' }, { color: 'yellow' }],
}

const held: Level = {
  id: 0,
  name: 'test',
  note: '',
  cap: 4,
  takes: 2,
  target: 'orange',
  membranes: [{ id: 'a', pore: 1 }],
  drops: [
    { color: 'yellow' },
    { color: 'red', where: 'a' },
    { color: 'red', where: 'a' },
    { color: 'yellow' },
  ],
}

describe('the three moves', () => {
  it('joins two drops into one that is heavier and blended', () => {
    const s = apply(initial(simple), simple, { kind: 'merge', from: 'd0', into: 'd1' })
    expect(s.drops).toHaveLength(1)
    expect(s.drops[0].mass).toBe(2)
    expect(s.drops[0].color).toBe(HUE.orange)
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

  it('takes a matching drop into the core, counts its mass, and closes once behind it', () => {
    const merged = apply(initial(simple), simple, { kind: 'merge', from: 'd0', into: 'd1' })
    const done = apply(merged, simple, { kind: 'join', id: 'd1' })
    expect(done.core).toBe(2)
    expect(done.takes).toBe(0)
    expect(won(done)).toBe(true)
  })
})

describe('the refusals', () => {
  it('refuses a merge that would burst the skin', () => {
    const three: Level = {
      ...simple,
      cap: 2,
      drops: [{ color: 'red' }, { color: 'yellow' }, { color: 'yellow' }],
    }
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

  it('refuses to open once more than the level allows', () => {
    const s = apply(initial(simple), simple, { kind: 'merge', from: 'd0', into: 'd1' })
    const spent = { ...s, takes: 0 }
    expect(refuse(spent, simple, { kind: 'join', id: 'd1' })).toMatch(/will not open/)
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

describe('the two numbers that make the game', () => {
  // the whole point of the design: one of these alone is not a puzzle
  const four: Level = {
    id: 0,
    name: 'test',
    note: '',
    cap: 2,
    takes: 2,
    target: 'orange',
    drops: [{ color: 'red' }, { color: 'red' }, { color: 'yellow' }, { color: 'yellow' }],
  }

  it('punishes putting the same colour together when the cap is tight', () => {
    const s = apply(initial(four), four, { kind: 'merge', from: 'd0', into: 'd1' })
    // two reds now weigh the cap, and no yellow can ever reach them
    for (const y of ['d2', 'd3'])
      expect(refuse(s, four, { kind: 'merge', from: y, into: 'd1' })).toMatch(/too much/)
  })

  it('punishes keeping it apart when the core will not open often enough', () => {
    const roomy: Level = { ...four, cap: 4, takes: 1 }
    let s = initial(roomy)
    s = apply(s, roomy, { kind: 'merge', from: 'd0', into: 'd2' }) // an orange, mass 2
    s = apply(s, roomy, { kind: 'join', id: 'd2' })
    expect(s.takes).toBe(0)
    s = apply(s, roomy, { kind: 'merge', from: 'd1', into: 'd3' }) // and another
    expect(refuse(s, roomy, { kind: 'join', id: 'd3' })).toMatch(/will not open/)
  })
})
