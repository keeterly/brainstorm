// A plan, out of what is already in the graph.
//
// `rain` and `deepen` return a real plan — a reading of what the thing is about,
// and steps that each carry a reason, an effort, and what they have to follow. All
// of it is written down: the reason lands in `summary`, the effort in `effort`, and
// every dependency becomes a `depends_on` relationship. And then none of it was ever
// shown. The group page listed the steps in the order they happened to be created,
// each one a tick and a title, so the shape the agent worked out — this before that,
// this one is small, this one is waiting — existed only inside the ranker.
//
// Ten identical rows is a mess. The same ten in order, with their reasons, is a plan.
// Nothing here computes anything new; it reads what is already there.
import type { Relationship, Thought } from './types'

/**
 * Who is waiting on whom.
 *
 * One rule, because two would drift: the Current hides what is blocked and a plan
 * marks it, and if those ever disagreed the app would be telling you two different
 * things about the same step on two screens. `prioritizePrepass` calls this.
 *
 * Both directions of the same fact are honoured — `a depends_on b` and `b blocks a`
 * say the same thing, and the graph has carried both since the beginning.
 *
 * Only among the things passed in: a dependency on something that has been put away
 * or is not in this set is not a reason to hold a step back for ever.
 */
export function waitingOn(byId: Map<string, Thought>, rels: Relationship[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const add = (id: string, on: string) => {
    const list = out.get(id)
    if (list) {
      if (!list.includes(on)) list.push(on)
    } else out.set(id, [on])
  }
  for (const r of rels) {
    if (r.type === 'depends_on') {
      const dep = byId.get(r.to_id)
      if (dep && dep.status === 'open' && byId.has(r.from_id)) add(r.from_id, r.to_id)
    }
    if (r.type === 'blocks') {
      const blocker = byId.get(r.from_id)
      if (blocker && blocker.status === 'open' && byId.has(r.to_id)) add(r.to_id, r.from_id)
    }
  }
  return out
}

/**
 * Is this a plan, or just a set of things?
 *
 * Most groups are not plans. A wall of references has no order and no efforts, and
 * numbering it would be the app inventing a sequence nobody meant. So the plan view
 * only appears where there is actually a plan to show, and this is the test.
 *
 * A step written by the agent carries both a reason and an effort; one you typed
 * yourself carries neither, because `addThought` leaves `effort` null. That is what
 * makes this reliable rather than a guess — and it is also why a step you added by
 * hand shows up in the plan with no reason and no effort beside it. The absence is
 * how you can tell which are yours.
 */
export function hasPlan(members: Thought[], rels: Relationship[]): boolean {
  if (members.some((m) => !!m.summary?.trim() && typeof m.effort === 'number')) return true
  const ids = new Set(members.map((m) => m.id))
  return rels.some(
    (r) => (r.type === 'depends_on' || r.type === 'blocks') && ids.has(r.from_id) && ids.has(r.to_id),
  )
}

/**
 * The order the steps should be done in.
 *
 * A stable topological sort: anything that has to follow something else does, and
 * everything else stays exactly where it was. Stability matters more than it sounds
 * — the list is on screen while you work, and a sort that reshuffles equal items
 * moves rows under your thumb between one paint and the next.
 *
 * Finished work stays at the bottom in the order it arrived, which is what the page
 * did before this and the right answer regardless: four ticked things stranded among
 * nine unfinished ones is a list you have to read twice to find your place in.
 *
 * A cycle cannot hang this. If nothing is left that can go next, whatever remains is
 * emitted in the order it came — a plan that disagrees with itself still has to be
 * readable, and dropping the steps would be worse than showing them out of order.
 */
export function planOrder(steps: Thought[], rels: Relationship[]): Thought[] {
  const open = steps.filter((s) => s.status !== 'done')
  const done = steps.filter((s) => s.status === 'done')
  const ids = new Set(open.map((s) => s.id))

  // what each step has to follow, among these steps only
  const after = new Map<string, Set<string>>()
  for (const s of open) after.set(s.id, new Set())
  for (const r of rels) {
    if (r.type === 'depends_on' && ids.has(r.from_id) && ids.has(r.to_id)) after.get(r.from_id)?.add(r.to_id)
    if (r.type === 'blocks' && ids.has(r.from_id) && ids.has(r.to_id)) after.get(r.to_id)?.add(r.from_id)
  }

  const out: Thought[] = []
  const placed = new Set<string>()
  const left = [...open]
  while (left.length) {
    const i = left.findIndex((s) => [...(after.get(s.id) ?? [])].every((d) => placed.has(d)))
    // nothing can go next: a cycle. Take the first one and carry on rather than
    // spinning, so the list is still a list.
    const take = i >= 0 ? i : 0
    const [s] = left.splice(take, 1)
    placed.add(s.id)
    out.push(s)
  }
  return [...out, ...done]
}

/**
 * The same order, applied down a nested list.
 *
 * The group page walks what a group holds depth-first, so a sub-group's contents
 * sit under it rather than at the end. That walk is right and stays; this reorders
 * each set of siblings within it, so a plan reads in order at every level without
 * the nesting coming apart.
 *
 * Generic over the row shape so it can order the page's own list without this file
 * needing to know what a row is.
 */
export function orderTree<T extends { t: Thought; parentId: string }>(
  root: string,
  nodes: T[],
  rels: Relationship[],
): T[] {
  const kids = new Map<string, T[]>()
  for (const nd of nodes) {
    const list = kids.get(nd.parentId)
    if (list) list.push(nd)
    else kids.set(nd.parentId, [nd])
  }
  const out: T[] = []
  const seen = new Set<string>([root])
  const walk = (parentId: string) => {
    const group = kids.get(parentId)
    if (!group) return
    for (const t of planOrder(
      group.map((g) => g.t),
      rels,
    )) {
      const nd = group.find((g) => g.t.id === t.id)
      // a malformed edge upstream must not drop a row or spin the walk
      if (!nd || seen.has(t.id)) continue
      seen.add(t.id)
      out.push(nd)
      walk(t.id)
    }
  }
  walk(root)
  // anything the walk could not reach still belongs on the page
  for (const nd of nodes) if (!seen.has(nd.t.id)) out.push(nd)
  return out
}

/** How much of a thing it is, at a glance. `rain` sizes every step 1–5. */
export function effortDots(effort?: number | null): string {
  if (typeof effort !== 'number') return ''
  return '•'.repeat(Math.max(1, Math.min(5, Math.round(effort))))
}
