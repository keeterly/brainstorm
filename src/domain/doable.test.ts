import { describe, expect, it } from 'vitest'
import { alreadyDrafted, canAgentDo, isMakeableStep } from './doable'
import { nameOf } from './row'
import type { Relationship, Thought } from './types'

let n = 0
function th(p: Partial<Thought> & { id: string }): Thought {
  return {
    user_id: 'u',
    raw_content: p.title ?? p.id,
    title: p.title ?? p.id,
    type: 'action',
    status: 'open',
    extra: {},
    created_at: new Date(Date.UTC(2026, 0, 1, 0, n++)).toISOString(),
    ...p,
  } as Thought
}
const partOf = (child: string, parent: string): Relationship =>
  ({ id: `r${n++}`, user_id: 'u', from_id: child, to_id: parent, type: 'part_of' }) as Relationship

describe('whether the agent could write this one', () => {
  it('takes the model at its word when the model gave one', () => {
    /*
     * `rain` writes the step and says whether it could draft it. That judgement
     * used to be thrown away and reconstructed from the wording, which missed
     * "Linesheet copy for the Lyon mill" because it begins with a noun — and the
     * thing that wrote it knew.
     */
    const yes = th({ id: 'a', title: 'Linesheet copy for the Lyon mill', extra: { canDraft: true } })
    const no = th({ id: 'b', title: 'Write something', extra: { canDraft: false } })
    expect(isMakeableStep(yes, nameOf)).toBe(true)
    expect(isMakeableStep(no, nameOf), 'it overrode the model saying no').toBe(false)
  })

  it('falls back to the wording for a step you typed yourself', () => {
    // no `canDraft` at all: your own steps, and every step written before the
    // model was asked
    expect(isMakeableStep(th({ id: 'c', title: 'Draft the buyer note' }), nameOf)).toBe(true)
    expect(isMakeableStep(th({ id: 'd', title: 'Fly to Paris' }), nameOf)).toBe(false)
  })

  it('does not offer to shoot a roll of film for you', () => {
    // the half that matters more: an app offering to do what has to be gone and
    // done is an app you stop believing
    const t = th({ id: 'e', title: 'Shoot one roll of the expired stock', extra: { canDraft: false } })
    expect(canAgentDo(t, [partOf('e', 'goal')], nameOf)).toBe(false)
  })

  it('will not draft a thing that has work under it, because that is a goal', () => {
    const t = th({ id: 'g', title: 'Write the campaign', extra: { canDraft: true } })
    const rels = [partOf('g', 'top'), partOf('kid', 'g')]
    expect(canAgentDo(t, rels, nameOf), 'it offered to draft a goal').toBe(false)
  })

  it('will not draft a loose idea at the top of the sky', () => {
    // the answer to an idea is to grow it, not to write it up
    const t = th({ id: 'loose', title: 'Write a manifesto', extra: { canDraft: true } })
    expect(canAgentDo(t, [], nameOf)).toBe(false)
  })

  it('says yes to a makeable leaf under something', () => {
    const t = th({ id: 'leaf', title: 'Write the wax-letter copy', extra: { canDraft: true } })
    expect(canAgentDo(t, [partOf('leaf', 'goal')], nameOf)).toBe(true)
  })

  it('knows what it has already written', () => {
    expect(alreadyDrafted(th({ id: 'x' }))).toBe(false)
    expect(alreadyDrafted(th({ id: 'y', extra: { drafted_at: '2026-03-01T09:00:00.000Z' } }))).toBe(true)
  })
})
