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
import { between, ordered, rankOf, spread } from '@/domain/rank'
import { wouldCircle } from '@/domain/finished'
import { MAX_DEPTH } from './arrange'
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
  return s.length > 26 ? s.slice(0, 25).trimEnd() + '…' : s
}

/**
 * Give a thing the name you chose, rather than the one it was given.
 *
 * Any thing: the group at the top of its own page, and every row inside it.
 * "I should be able to edit here" is the only sane response to a list of your
 * own words that you are allowed to look at and not to fix.
 */
export function rename(id: string, name: string): Undone | null {
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

/**
 * Tick it off.
 *
 * The verb the group page was missing, on the one screen where it is most
 * obviously wanted: twenty-five actions in a list and no way to say you had
 * done any of them. Everywhere else in the app completion exists — a button on
 * the Current, dragging a drop into the sea — and neither is reachable from
 * here without leaving.
 *
 * `done` rather than `archived`, because these are different claims. Archived
 * is "I do not want to look at this"; done is "this happened", and the ocean,
 * the light it throws, and every count of what you have finished are built on
 * the difference.
 */
export function complete(id: string): Undone | null {
  const t = S().thoughts.find((x) => x.id === id)
  if (!t) return null
  const wasDone = t.status === 'done'
  S().toggleDone(id)
  /*
   * And whatever was inside it.
   *
   * A group ticked off used to mark only the group. Everything under it stayed
   * open — and the sky draws what is open, so the four references inside a
   * finished wall popped straight back out as loose drops, orphaned, with
   * nothing to say where they had come from. It has always been possible to
   * write that; it only became *reachable* when a group could be a member of
   * another group and so appear as a row with a tick beside it.
   *
   * Down the whole tree, not one level: a wall inside a wall is still inside
   * the thing you just finished.
   */
  const swept: string[] = []
  if (!wasDone) {
    const seen = new Set<string>([id])
    let front = [id]
    while (front.length) {
      const next: string[] = []
      for (const parent of front) {
        for (const r of S().relationships) {
          if (r.type !== 'part_of' || r.to_id !== parent || seen.has(r.from_id)) continue
          seen.add(r.from_id)
          const kid = S().thoughts.find((x) => x.id === r.from_id)
          if (!kid || kid.status !== 'open') continue
          swept.push(kid.id)
          next.push(kid.id)
        }
      }
      front = next
    }
    for (const kid of swept) S().toggleDone(kid)
  }
  const note = wasDone
    ? `“${label(t)}” is open again`
    : swept.length
      ? `“${label(t)}” is done — and the ${swept.length} inside it`
      : `“${label(t)}” is done`
  return {
    note,
    undo: () => {
      S().toggleDone(id)
      for (const kid of swept) S().toggleDone(kid)
    },
  }
}

/**
 * Put something new straight into the group.
 *
 * The group page is where you are when you notice the thing that is missing
 * from it, and having to close it, find the sky, hold it, write, and then drag
 * the result back in is five moves for one thought.
 */
export function addTo(groupId: string, text: string): Undone | null {
  const body = text.trim()
  if (!body || !S().thoughts.some((t) => t.id === groupId)) return null
  const t = S().addThought({ raw_content: body, title: body })
  S().addRelationship(t.id, groupId, 'part_of')
  return {
    note: `“${label(t)}” is in there now`,
    // a thing that never existed before this is the one case where taking it
    // away again really is taking it away
    undo: () => S().deleteThought(t.id),
  }
}

/**
 * Gather several of the things in a group into one of their own.
 *
 * The sky does this by dragging one thing onto another, which works beautifully
 * for two and not at all for five. A list is the right shape for picking out
 * five, and this was the only organising move the list could not make.
 */
export function groupInto(
  parentId: string,
  memberIds: string[],
  name: string,
): { undone: Undone; groupId: string; texts: string[] } | null {
  const ids = memberIds.filter((id) => S().thoughts.some((t) => t.id === id && t.status === 'open'))
  if (ids.length < 2) return null
  const title = name.trim() || 'Together'
  const g = S().addThought({ raw_content: title, title, type: 'goal' })
  // the new group stands where its contents stood
  if (parentId) S().addRelationship(g.id, parentId, 'part_of')

  const moved: { id: string; from: string | null }[] = []
  for (const id of ids) {
    const old = S().relationships.find((r) => r.type === 'part_of' && r.from_id === id)
    moved.push({ id, from: old ? old.to_id : null })
    if (old) S().deleteRelationship(old.id)
    S().addRelationship(id, g.id, 'part_of')
  }

  const texts = ids
    .map((id) => S().thoughts.find((t) => t.id === id))
    .filter((t): t is Thought => !!t)
    .map((t) => t.title || t.raw_content)

  return {
    groupId: g.id,
    texts,
    undone: {
      note: `${ids.length} gathered into “${title}”`,
      undo: () => {
        for (const m of moved) {
          const made = S().relationships.find((r) => r.type === 'part_of' && r.from_id === m.id && r.to_id === g.id)
          if (made) S().deleteRelationship(made.id)
          if (m.from) S().addRelationship(m.id, m.from, 'part_of')
        }
        S().deleteThought(g.id)
      },
    },
  }
}

/**
 * What is inside a group right now, in the order the sky shows them.
 *
 * Optionally including what has just been finished. Ticking something off and
 * watching the row disappear from under your finger is unnerving and gives you
 * nowhere to un-tick — so the list you are looking at keeps them, struck
 * through, and the sky does not.
 */
export function membersOf(groupId: string, withDone = false): Thought[] {
  const s = S()
  return ordered(
    s.relationships
      .filter((r) => r.type === 'part_of' && r.to_id === groupId)
      .map((r) => s.thoughts.find((t) => t.id === r.from_id))
      .filter((t): t is Thought => !!t && (t.status === 'open' || (withDone && t.status === 'done'))),
  )
}

/** One line of the list: what it is, and how far in it sits. */
export interface Branch {
  t: Thought
  /** 0 for a direct member of the group whose page this is */
  depth: number
  /** what it is currently part of */
  parentId: string
}

/**
 * A group's contents as a list you can see the shape of.
 *
 * The list used to show direct members only, which was fine while the only way
 * to nest something was to drag one drop onto another out in the sky. The
 * moment you can nest *here*, direct-members-only means the row you have just
 * tucked under another one vanishes from the page — and a rearrangement that
 * makes things disappear is indistinguishable from having deleted them.
 *
 * So it is a tree, walked depth-first, each row carrying how far in it is.
 * Finished work sinks within its own set of siblings rather than to the bottom
 * of everything: a done thing three deep belongs beside the things it is with,
 * not stranded at the foot of some other branch.
 */
export function branchesOf(groupId: string, withDone = false, maxDepth = MAX_DEPTH): Branch[] {
  const out: Branch[] = []
  // a bad edge upstream must not hang the page that draws it
  const seen = new Set<string>([groupId])
  const walk = (parentId: string, depth: number) => {
    if (depth > maxDepth) return
    const kids = [...membersOf(parentId, withDone)].sort((a, b) => {
      const da = a.status === 'done' ? 1 : 0
      const db = b.status === 'done' ? 1 : 0
      if (da !== db) return da - db
      return da ? String(a.completed_at ?? '').localeCompare(String(b.completed_at ?? '')) : 0
    })
    for (const t of kids) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      out.push({ t, depth, parentId })
      walk(t.id, depth + 1)
    }
  }
  walk(groupId, 0)
  return out
}

/**
 * Put something at a particular place, under a particular parent.
 *
 * One operation rather than two, because a drag in the list is one act: you
 * pick a row up and put it down, and where you put it down says both what it is
 * part of now and what it sits after. Splitting that into "reparent" and
 * "reorder" would make an ordinary drag two entries in the undo bar, and leave
 * a moment where it has moved but not landed.
 *
 * Refuses to put a thing inside itself or inside its own descendant. `rebuild`
 * survives a cycle, but only by silently dropping whatever caused it — which
 * from the outside is indistinguishable from the app having eaten your work.
 */
function setRank(id: string, rank: number | null) {
  const t = S().thoughts.find((x) => x.id === id)
  if (t) S().updateThought(id, { extra: { ...t.extra, rank: rank ?? undefined } })
}

/**
 * Give something a rank that puts it after `afterId` among `parentId`'s
 * contents, numbering the whole list first if it has to.
 *
 * Two reasons it has to. Nobody has ever arranged this group, so there are no
 * ranks to sit between — the common one, since a list carries no order at all
 * until the first time you touch it. Or there are ranks, and the gap between
 * these two particular neighbours has finally been halved down to nothing.
 * Both are occasional, and both are far cheaper here than renumbering the list
 * on every single move would be.
 *
 * Returns the ranks it overwrote on the way, so a caller can put them back.
 */
function place(child: Thought, parentId: string, afterId: string | null): { id: string; rank: number | null }[] {
  const siblings = membersOf(parentId, true).filter((m) => m.id !== child.id)
  const at = afterId ? siblings.findIndex((m) => m.id === afterId) : -1
  const gap = siblings.some((m) => rankOf(m) === null)
    ? null
    : between(at >= 0 ? rankOf(siblings[at]) : null, siblings[at + 1] ? rankOf(siblings[at + 1]) : null)

  if (gap !== null) {
    setRank(child.id, gap)
    return []
  }
  const laid = [...siblings]
  laid.splice(at + 1, 0, child)
  const fresh = spread(laid.length)
  const was: { id: string; rank: number | null }[] = []
  laid.forEach((m, i) => {
    if (m.id !== child.id) was.push({ id: m.id, rank: rankOf(m) })
    setRank(m.id, fresh[i])
  })
  return was
}

export function moveInto(childId: string, parentId: string, afterId: string | null): Undone | null {
  const s = S()
  const t = s.thoughts.find((x) => x.id === childId)
  if (!t || childId === parentId || afterId === childId) return null
  if (!s.thoughts.some((x) => x.id === parentId)) return null
  if (wouldCircle(childId, parentId, s.relationships)) return null

  const old = s.relationships.find((r) => r.type === 'part_of' && r.from_id === childId)
  const from = old ? old.to_id : null
  if (afterId && !membersOf(parentId, true).some((m) => m.id === afterId)) return null

  // Everything about to change, captured before any of it does.
  //
  // Where it *was* has to be captured as a neighbour and not only as a number:
  // if it is leaving one list for another, the list it leaves may have no ranks
  // at all, and a rank of null tells you nothing about where among them it
  // stood. Undo puts it back after the same thing it was after, which is the
  // one description that survives either case.
  const wasRank = rankOf(t)
  const oldSiblings = from ? membersOf(from, true) : []
  const wasAt = oldSiblings.findIndex((m) => m.id === childId)
  const wasAfter = wasAt > 0 ? oldSiblings[wasAt - 1].id : null

  const respread = place(t, parentId, afterId)
  if (from !== parentId) {
    if (old) S().deleteRelationship(old.id)
    S().addRelationship(childId, parentId, 'part_of')
  }

  const into = s.thoughts.find((x) => x.id === parentId)
  return {
    note: from === parentId ? `“${label(t)}” moved` : `“${label(t)}” is under “${into ? label(into) : 'it'}” now`,
    undo: () => {
      if (from !== parentId) {
        const made = S().relationships.find(
          (r) => r.type === 'part_of' && r.from_id === childId && r.to_id === parentId,
        )
        if (made) S().deleteRelationship(made.id)
        if (from) S().addRelationship(childId, from, 'part_of')
      }
      for (const r of respread) setRank(r.id, r.rank)
      setRank(childId, wasRank)
      // It came from somewhere else, and going back into that list at the end —
      // which is where an unranked thing lands — is not where it was. Put it
      // back beside what it used to sit after.
      const back = S().thoughts.find((x) => x.id === childId)
      if (back && from && from !== parentId) place(back, from, wasAfter)
    },
  }
}
