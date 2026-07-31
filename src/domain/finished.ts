import type { Relationship, Thought } from './types'

/**
 * The group that has just run out of open work.
 *
 * A goal could never finish. The sky draws only what is open, so ticking the
 * last action under a cloud made its members vanish — correctly — and left the
 * goal itself open with zero members, which stops being a pool and is redrawn
 * as an orphan drop: a thing you completed, sitting in the sky looking exactly
 * like a thought nobody has done anything with. Nothing marked it finished,
 * nothing sank, and the app never once said you had completed something.
 *
 * This is deliberately only a question. Closing a goal is a claim about your
 * work — "that whole thing is done" — and the agent does not get to make it.
 * The answer is offered; you say yes.
 */
export function emptiedGroup(
  justCompleted: string,
  thoughts: Thought[],
  relationships: Relationship[],
): Thought | null {
  const parentId = relationships.find((r) => r.type === 'part_of' && r.from_id === justCompleted)?.to_id
  if (!parentId) return null
  const parent = thoughts.find((t) => t.id === parentId)
  if (!parent || parent.status !== 'open') return null
  const stillOpen = relationships.some(
    (r) =>
      r.type === 'part_of' &&
      r.to_id === parentId &&
      thoughts.find((t) => t.id === r.from_id)?.status === 'open',
  )
  return stillOpen ? null : parent
}
