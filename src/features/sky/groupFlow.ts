// Taking things apart.
//
// Every gesture in the sky adds. You can write a drop, grow it, pool two of
// them, gather more in, hand the group to the agent and watch it fill up — and
// there is no gesture anywhere that renames the group, empties it, or throws it
// away. A map you can only add to is not a map you can think in; it is a pile
// with good typography. The one delete in the whole app lives on a route the
// sky never links to.
//
// So this is the other half of the grammar, and the shape of it matters:
//
// **Nothing is destroyed.** Archiving, not deleting. The sky draws thoughts
// whose status is `open`, so flipping a thing to `archived` makes it vanish
// from the map instantly while keeping its id, its text, its threads to
// everything else, and its place in every brief that ever mentioned it. Undo
// is one field going back. A real delete would take the id with it, and an id
// is what a saved position, a relationship and a run all point at.
//
// **Emptying and throwing away are different acts.** "I do not want these five
// things gathered under this name any more" and "these five things are done
// with" are not the same wish, and an app that offers only the second forces
// you to rebuild what you meant. So: ungroup keeps the contents and loses only
// the name; bin takes the lot.
//
// **Every one of them comes back.** Each returns an undo that restores exactly
// what it changed, in reverse, and nothing else.
import { useGraph } from '@/store/graph'
import type { Thought } from '@/domain/types'

export interface Undone {
  /** what happened, in the fewest words that are still true */
  note: string
  undo: () => void
}

const S = () => useGraph.getState()
/** Short enough for the one line at the foot of the sky that has to hold it. */
const label = (t: Thought) => {
  const s = (t.title || t.raw_content).trim()
  return s.length > 34 ? s.slice(0, 33).trimEnd() + '…' : s
}

/** Give a group a name you chose, rather than the one it was given. */
export function renameGroup(id: string, name: string): Undone | null {
  const t = S().thoughts.find((x) => x.id === id)
  const next = name.trim()
  if (!t || !next || next === (t.title ?? '')) return null
  const wasTitle = t.title
  const wasRaw = t.raw_content
  S().updateThought(id, { title: next, raw_content: next })
  return {
    note: `renamed to “${next}”`,
    undo: () => S().updateThought(id, { title: wasTitle, raw_content: wasRaw }),
  }
}

/** Take one thing out of the group it is in, and leave it in the sky. */
export function takeOut(memberId: string): Undone | null {
  const rel = S().relationships.find((r) => r.type === 'part_of' && r.from_id === memberId)
  const t = S().thoughts.find((x) => x.id === memberId)
  if (!rel || !t) return null
  const to = rel.to_id
  S().deleteRelationship(rel.id)
  return {
    note: `“${label(t)}” is loose again`,
    undo: () => S().addRelationship(memberId, to, 'part_of'),
  }
}

/**
 * Lose the grouping, keep the things.
 *
 * The common case by a distance: the name turned out to be wrong, or the
 * gathering was the agent's idea rather than yours. The five things inside were
 * never the problem.
 */
export function ungroup(groupId: string): Undone | null {
  const s = S()
  const group = s.thoughts.find((x) => x.id === groupId)
  if (!group) return null
  const held = s.relationships.filter((r) => r.type === 'part_of' && r.to_id === groupId)
  // and whatever the group itself was inside, so the contents land where the
  // group stood rather than at the top of the world
  const up = s.relationships.find((r) => r.type === 'part_of' && r.from_id === groupId)
  const upTo = up ? up.to_id : null

  for (const r of held) S().deleteRelationship(r.id)
  if (upTo) for (const r of held) S().addRelationship(r.from_id, upTo, 'part_of')
  S().updateThought(groupId, { status: 'archived' })

  return {
    note: held.length ? `${held.length} loose again — “${label(group)}” is gone` : `“${label(group)}” is gone`,
    undo: () => {
      S().updateThought(groupId, { status: 'open' })
      if (upTo) {
        for (const r of held) {
          const made = S().relationships.find(
            (x) => x.type === 'part_of' && x.from_id === r.from_id && x.to_id === upTo,
          )
          if (made) S().deleteRelationship(made.id)
        }
      }
      for (const r of held) S().addRelationship(r.from_id, groupId, 'part_of')
    },
  }
}

/**
 * Put a thing away, and everything under it.
 *
 * Archived rather than deleted, so this is a thing you can be wrong about. The
 * whole subtree goes, because a group whose contents survived it would leave
 * five orphans in the sky and no name to explain them.
 */
export function bin(rootId: string): Undone | null {
  const s = S()
  const root = s.thoughts.find((x) => x.id === rootId)
  if (!root) return null

  // everything under it, however deep
  const under: string[] = []
  const walk = (id: string) => {
    for (const r of S().relationships) {
      if (r.type !== 'part_of' || r.to_id !== id) continue
      const child = S().thoughts.find((x) => x.id === r.from_id)
      if (!child || child.status !== 'open' || under.includes(child.id)) continue
      under.push(child.id)
      walk(child.id)
    }
  }
  walk(rootId)

  const all = [rootId, ...under]
  for (const id of all) S().updateThought(id, { status: 'archived' })

  const n = under.length
  return {
    note: n ? `“${label(root)}” and ${n} inside it — put away` : `“${label(root)}” — put away`,
    undo: () => {
      for (const id of all) S().updateThought(id, { status: 'open' })
    },
  }
}

/** What is inside a group right now, in the order the sky shows them. */
export function membersOf(groupId: string): Thought[] {
  const s = S()
  return s.relationships
    .filter((r) => r.type === 'part_of' && r.to_id === groupId)
    .map((r) => s.thoughts.find((t) => t.id === r.from_id))
    .filter((t): t is Thought => !!t && t.status === 'open')
}
