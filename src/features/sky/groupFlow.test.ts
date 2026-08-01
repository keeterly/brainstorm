import { beforeEach, describe, expect, it } from 'vitest'
import { useGraph } from '@/store/graph'
import { addTo, bin, complete, groupInto, membersOf, rename, takeOut, ungroup } from './groupFlow'

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

describe('naming a thing yourself', () => {
  it('was impossible: the only way to rename anything was to tell the agent about it', () => {
    const { g } = seed()
    const u = rename(g.id, 'PFW Travel Booking')!
    expect(S().thoughts.find((t) => t.id === g.id)?.title).toBe('PFW Travel Booking')
    u.undo()
    expect(S().thoughts.find((t) => t.id === g.id)?.title).toBe('Travel')
  })

  it('does nothing at all for a name that is blank or unchanged', () => {
    const { g } = seed()
    expect(rename(g.id, '   ')).toBeNull()
    expect(rename(g.id, 'Travel')).toBeNull()
  })

  it('moves the raw text with the title, so nothing reads the old name back', () => {
    const { g } = seed()
    rename(g.id, 'PFW Travel')
    const t = S().thoughts.find((x) => x.id === g.id)!
    expect(t.raw_content).toBe('PFW Travel')
  })
})

describe('taking one thing out', () => {
  it('moves it up one level, not out of everything', () => {
    // "Fares" is in "Travel", which is in "SS27". Out of Travel means into
    // SS27. It used to mean into open sky — so a small correction inside one
    // collection threw the thing clean out of the collection, and putting it
    // back where it obviously belonged was a second drag, every time.
    const { top, g, a } = seed()
    const u = takeOut(a.id)!
    expect(partOf(a.id)).toBe(top.id)
    expect(membersOf(g.id).map((m) => m.id)).not.toContain(a.id)
    u.undo()
    expect(partOf(a.id)).toBe(g.id)
  })

  it('leaves it in the sky when there is nowhere up to go', () => {
    // out of a top-level group — the one case that was always right
    const { top, g } = seed()
    const u = takeOut(g.id)!
    expect(partOf(g.id)).toBeUndefined()
    expect(openIds()).toContain(g.id)
    u.undo()
    expect(partOf(g.id)).toBe(top.id)
  })

  it('puts back exactly one edge, not two', () => {
    // the undo has to lift the new home as well as restore the old one, or
    // taking a thing out and changing your mind leaves it in two groups
    const { top, g, a } = seed()
    takeOut(a.id)!.undo()
    const homes = S().relationships.filter((r) => r.type === 'part_of' && r.from_id === a.id)
    expect(homes).toHaveLength(1)
    expect(homes[0].to_id).toBe(g.id)
    expect(membersOf(top.id).map((m) => m.id)).not.toContain(a.id)
  })

  it('says which one, and where it ended up', () => {
    // three rows of "removed" tell you nothing, and "loose again" is a lie
    // when it is not loose
    const { a, g } = seed()
    expect(takeOut(a.id)!.note).toContain('Fares')
    expect(takeOut(g.id)!.note).toContain('loose again')
  })

  it('names the group it moved up into, so it does not read as lost', () => {
    const { a } = seed()
    expect(takeOut(a.id)!.note).toContain('SS27')
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
    expect(rename('nope', 'x')).toBeNull()
    expect(takeOut('nope')).toBeNull()
    expect(ungroup('nope')).toBeNull()
    expect(bin('nope')).toBeNull()
  })
})

describe('putting something new straight into a group', () => {
  it('saves closing the page, finding the sky, writing, and dragging it back', () => {
    const { g } = seed()
    const u = addTo(g.id, '  Confirm the room block  ')!
    const inside = membersOf(g.id).map((m) => m.title)
    expect(inside).toContain('Confirm the room block')
    u.undo()
    expect(membersOf(g.id).map((m) => m.title)).not.toContain('Confirm the room block')
  })

  it('really removes it on undo, because it never existed before', () => {
    // the one case where undoing is a delete rather than an archive: nothing
    // else has ever pointed at this id
    const { g } = seed()
    const before = S().thoughts.length
    addTo(g.id, 'A thing')!.undo()
    expect(S().thoughts).toHaveLength(before)
  })

  it('ignores an empty one rather than making a nameless drop', () => {
    const { g } = seed()
    expect(addTo(g.id, '   ')).toBeNull()
    expect(addTo('nope', 'x')).toBeNull()
  })
})

describe('gathering some of a group into one of their own', () => {
  it('is the move a list can make and a drag cannot: five at once', () => {
    const { g, a, b, c } = seed()
    const res = groupInto(g.id, [a.id, b.id, c.id], 'Travel')!
    expect(membersOf(res.groupId).map((m) => m.id).sort()).toEqual([a.id, b.id, c.id].sort())
    // and the new group is inside the one you were looking at
    expect(partOf(res.groupId)).toBe(g.id)
  })

  it('hands back what is in it, so it can be given a real name afterwards', () => {
    const { g, a, b } = seed()
    expect(groupInto(g.id, [a.id, b.id], 'x')!.texts).toEqual(['Fares', 'Seat map'])
  })

  it('puts every one of them back where it came from', () => {
    const { g, a, b, c } = seed()
    const res = groupInto(g.id, [a.id, b.id], 'Travel')!
    res.undone.undo()
    for (const m of [a, b, c]) expect(partOf(m.id)).toBe(g.id)
    expect(openIds()).not.toContain(res.groupId)
  })

  it('refuses to make a group of one, which is just a rename with extra steps', () => {
    const { g, a } = seed()
    expect(groupInto(g.id, [a.id], 'Travel')).toBeNull()
    expect(groupInto(g.id, [], 'Travel')).toBeNull()
  })

  it('ignores ids that are not really there', () => {
    const { g, a } = seed()
    expect(groupInto(g.id, [a.id, 'ghost'], 'Travel')).toBeNull()
  })

  it('falls back to a name rather than making an unnamed group', () => {
    const { g, a, b } = seed()
    const res = groupInto(g.id, [a.id, b.id], '   ')!
    expect(S().thoughts.find((t) => t.id === res.groupId)?.title).toBeTruthy()
  })
})

describe('ticking something off', () => {
  it('was the verb this page did not have, on the page most obviously wanting it', () => {
    const { a } = seed()
    const u = complete(a.id)!
    expect(S().thoughts.find((t) => t.id === a.id)?.status).toBe('done')
    u.undo()
    expect(S().thoughts.find((t) => t.id === a.id)?.status).toBe('open')
  })

  it('is done, not archived — the ocean is built on the difference', () => {
    // archived is "I do not want to look at this"; done is "this happened"
    const { a } = seed()
    complete(a.id)
    expect(S().thoughts.find((t) => t.id === a.id)?.status).not.toBe('archived')
    expect(S().thoughts.find((t) => t.id === a.id)?.completed_at).toBeTruthy()
  })

  it('un-ticks, because a mis-tap is not a decision', () => {
    const { a } = seed()
    complete(a.id)
    expect(complete(a.id)!.note).toContain('open again')
    expect(S().thoughts.find((t) => t.id === a.id)?.status).toBe('open')
  })

  it('leaves the sky, so the list is the only place it lingers', () => {
    const { g, a } = seed()
    complete(a.id)
    expect(membersOf(g.id).map((m) => m.id)).not.toContain(a.id)
    // …and the list keeps it, struck through, so it does not vanish under a finger
    expect(membersOf(g.id, true).map((m) => m.id)).toContain(a.id)
  })
})

function nested() {
  const s = S()
  const campaign = s.addThought({ raw_content: 'SS27 campaign', title: 'SS27 campaign', type: 'goal' })
  const wall = s.addThought({ raw_content: 'References', title: 'References', type: 'goal' })
  s.addRelationship(wall.id, campaign.id, 'part_of')
  const pics = [1, 2, 3].map((i) => s.addThought({ raw_content: `Photo ${i}`, title: `Photo ${i}` }))
  for (const pic of pics) s.addRelationship(pic.id, wall.id, 'part_of')
  return { campaign, wall, pics }
}
const statusOf = (id: string) => S().thoughts.find((t) => t.id === id)?.status

describe('ticking a group off', () => {
  it('takes what was inside it', () => {
    // It marked only the group. Everything under it stayed open — and the sky
    // draws what is open — so the three references inside a finished wall
    // popped straight back out as loose drops with nothing to say where they
    // had come from.
    const { wall, pics } = nested()
    complete(wall.id)
    expect(statusOf(wall.id)).toBe('done')
    for (const pic of pics) expect(statusOf(pic.id)).toBe('done')
  })

  it('goes all the way down, not one level', () => {
    const { campaign, wall, pics } = nested()
    complete(campaign.id)
    expect(statusOf(wall.id)).toBe('done')
    for (const pic of pics) expect(statusOf(pic.id)).toBe('done')
  })

  it('says how many went with it', () => {
    const { wall } = nested()
    expect(complete(wall.id)?.note).toContain('3 inside it')
  })

  it('puts every one of them back', () => {
    const { campaign, wall, pics } = nested()
    complete(campaign.id)?.undo()
    expect(statusOf(campaign.id)).toBe('open')
    expect(statusOf(wall.id)).toBe('open')
    for (const pic of pics) expect(statusOf(pic.id)).toBe('open')
  })

  it('leaves alone what was already finished before you ticked the group', () => {
    // it was done for its own reasons; undoing the group must not reopen it
    const { wall, pics } = nested()
    useGraph.getState().toggleDone(pics[0].id)
    const undone = complete(wall.id)
    expect(statusOf(pics[0].id)).toBe('done')
    undone?.undo()
    expect(statusOf(pics[0].id)).toBe('done')
    expect(statusOf(pics[1].id)).toBe('open')
  })

  it('reopens only the thing itself when you untick it', () => {
    const { wall, pics } = nested()
    complete(wall.id)
    const again = complete(wall.id)
    expect(statusOf(wall.id)).toBe('open')
    expect(again?.note).toContain('open again')
    // its contents stay where the tick put them — unticking is one act, and
    // the offer to put the whole thing back is the undo on the tick
    expect(statusOf(pics[0].id)).toBe('done')
  })

  it('behaves as it always did for a thing with nothing inside it', () => {
    const { pics } = nested()
    expect(complete(pics[0].id)?.note).toBe('“Photo 1” is done')
  })
})
