import { describe, expect, it } from 'vitest'
import { wouldCircle } from './finished'
import type { Relationship } from './types'

const rel = (from: string, to: string): Relationship => ({
  id: `${from}-${to}`,
  user_id: 'u1',
  from_id: from,
  to_id: to,
  type: 'part_of',
  created_by: 'user',
  agent_run_id: null,
  created_at: '2026-07-01T00:00:00Z',
})

// campaign ⊃ shoot ⊃ film
const REL = [rel('shoot', 'campaign'), rel('film', 'shoot')]

describe('putting a group inside a group', () => {
  it('allows two groups that have nothing to do with each other', () => {
    expect(wouldCircle('letters', 'campaign', REL)).toBe(false)
  })

  it('allows a group that already sits there to sit there again', () => {
    // dragging a sub-group back onto its own parent is a no-op, not a loop
    expect(wouldCircle('shoot', 'campaign', REL)).toBe(false)
  })

  it('refuses a group dropped on something it already contains', () => {
    // there is no reading of "put the campaign inside its own shoot" that is
    // not a loop, and a loop written here syncs to every other device before
    // anything notices
    expect(wouldCircle('campaign', 'shoot', REL)).toBe(true)
  })

  it('refuses it however deep the thing it contains is', () => {
    expect(wouldCircle('campaign', 'film', REL)).toBe(true)
  })

  it('refuses a thing dropped on itself', () => {
    expect(wouldCircle('campaign', 'campaign', REL)).toBe(true)
  })

  it('gives an answer even if the graph already had a loop in it', () => {
    // `rebuild` breaks these when it draws, but this runs before that
    const bad = [rel('a', 'b'), rel('b', 'a')]
    expect(wouldCircle('c', 'a', bad)).toBe(false)
  })
})
