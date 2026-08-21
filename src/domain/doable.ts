// Can the agent do this one?
//
// One rule, in one place, because two surfaces now ask it. The group page asks
// it of the step you are standing in front of, to decide whether the verb says
// "do it"; the roadmap asks it of a whole week at once, to say how much of it it
// could take off your hands. If those ever disagreed, the app would offer to
// write something on one screen and refuse to on the other.
//
// It was inlined in `getOnWithIt` until the roadmap needed it — see the note
// there about the fifteen English verbs it used to be.
import { isMakeable } from './question'
import type { Relationship, Thought } from './types'

const ex = (t: Thought) => (t.extra ?? {}) as Record<string, unknown>

/**
 * Whether a first version of this could be written from what is in front of it.
 *
 * The model's own answer where there is one. `rain` writes these steps and says
 * of each whether it could draft it — that judgement used to be thrown away and
 * reconstructed here by matching the title's opening against a list of verbs.
 * It is a good list and its instinct is right, but it only ever fired on steps
 * that *began* with one of those words: "Linesheet copy for the Lyon mill"
 * begins with a noun, "Ask the mill for lead times" is an email, neither was
 * offered, and the thing that wrote them both knew.
 *
 * The list remains the fallback for the two cases with no answer: a step you
 * typed yourself, and every step written before `canDraft` existed.
 */
export function isMakeableStep(t: Thought, nameOf: (t: Thought) => string): boolean {
  const said = ex(t).canDraft
  return typeof said === 'boolean' ? said : isMakeable(nameOf(t))
}

/**
 * …and whether it is the kind of thing to ask that of at all.
 *
 * Three conditions and it needs all three. Makeable, so the agent is not
 * offering to write an aeroplane ticket. A **leaf**, because a thing with work
 * under it is a goal, and goals get planned rather than drafted. And **under
 * something**, because a leaf at the top of the sky is a loose idea, and the
 * answer to an idea is to grow it, not to write it up.
 */
export function canAgentDo(
  t: Thought,
  rels: Relationship[],
  nameOf: (t: Thought) => string,
): boolean {
  if (!isMakeableStep(t, nameOf)) return false
  const hasWorkUnder = rels.some((r) => r.type === 'part_of' && r.to_id === t.id)
  if (hasWorkUnder) return false
  return rels.some((r) => r.type === 'part_of' && r.from_id === t.id)
}

/** Whether the agent has already written this one. */
export function alreadyDrafted(t: Thought): boolean {
  return typeof ex(t).drafted_at === 'string'
}
