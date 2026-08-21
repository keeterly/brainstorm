// What is on the roadmap, gathered out of the graph.
//
// Nothing here is a new model of the work. A roadmap in this app is a *view* of
// `part_of` and `depends_on` — the same thoughts the sky draws and the group
// page ticks — because the last time it was anything else, it was a second
// parallel record that nothing could tick and that drifted from the real one
// within a week. See the note over `roadmaps` in `store/graph.ts`.
import { hasPlan } from '@/domain/plan'
import type { Relationship, Thought } from '@/domain/types'
import { isPursuing } from './pursue'

/** A group whose contents the agent has actually planned. */
export interface Pursued {
  goal: Thought
  /** the leaves — the things you would tick, not the groups holding them */
  steps: Thought[]
  /** you said you were doing this one, rather than it merely having a plan */
  chosen: boolean
}

const kidsOf = (id: string, rels: Relationship[]) =>
  rels.filter((r) => r.type === 'part_of' && r.to_id === id).map((r) => r.from_id)

const parentOf = (id: string, rels: Relationship[]) =>
  rels.find((r) => r.type === 'part_of' && r.from_id === id)?.to_id ?? null

/**
 * Everything that is being pursued, with the work under it.
 *
 * Roots only — a group nested inside another is part of that one's plan, not a
 * plan of its own, and listing both would put every step on the roadmap twice.
 *
 * Only leaves are steps. A sub-group is a heading; the work is what is inside
 * it. Scheduling the heading as well as its contents would book the same
 * afternoon twice over.
 */
export function pursued(thoughts: Thought[], rels: Relationship[]): Pursued[] {
  const byId = new Map(thoughts.map((t) => [t.id, t] as const))
  const out: Pursued[] = []
  for (const t of thoughts) {
    if (t.status !== 'open') continue
    if (parentOf(t.id, rels)) continue
    const inside = descend(t.id, rels, byId)
    if (!inside.length) continue
    if (!hasPlan(inside, rels)) continue
    const steps = inside
      .filter((m) => !kidsOf(m.id, rels).some((k) => byId.get(k)?.status === 'open'))
      .filter(isWork)
    if (steps.length) out.push({ goal: t, steps, chosen: isPursuing(t) })
  }
  /*
   * What you said you were doing, if you have said.
   *
   * A group is on the roadmap because you decided to do it, not because it
   * happens to have been planned — half the value of a second tab is that the
   * things on it are the things you actually chose.
   *
   * But an empty screen is a worse teacher than a full one. Until anything has
   * been taken up, this shows everything with a plan in it and the page says so:
   * here is what you could be doing, mark the ones you are. The moment you mark
   * one, it narrows to what you marked.
   */
  const chosen = out.filter((g) => g.chosen)
  return chosen.length ? chosen : out
}

/**
 * Is this a thing to do, or a thing to look at?
 *
 * A moodboard lives inside the campaign it is for, and its photographs are
 * leaves of that group exactly like the steps are. They are not work. Measured
 * on the demo world before this existed: four reference photographs took the
 * whole of a week's capacity and pushed every real step past the weekend —
 * a roadmap that books four afternoons to look at pictures you have already
 * seen.
 *
 * Not by `type`: a photograph is a `note`, and so is a step you typed yourself,
 * so the type cannot tell them apart. The picture can. `reference` goes too —
 * a link you saved is material, not an afternoon.
 */
const isWork = (t: Thought): boolean =>
  t.type !== 'reference' && !(t.extra as Record<string, unknown> | null)?.img

/** Everything under a group, however deep, cycle-safe. */
function descend(root: string, rels: Relationship[], byId: Map<string, Thought>): Thought[] {
  const out: Thought[] = []
  const seen = new Set<string>([root])
  const walk = (id: string, depth: number) => {
    if (depth > 6) return
    for (const kid of kidsOf(id, rels)) {
      if (seen.has(kid)) continue
      seen.add(kid)
      const t = byId.get(kid)
      if (!t || t.status !== 'open') continue
      out.push(t)
      walk(kid, depth + 1)
    }
  }
  walk(root, 0)
  return out
}

/** Which goal a step belongs to, for saying where a day's work comes from. */
export function goalOf(stepId: string, rels: Relationship[], byId: Map<string, Thought>): Thought | null {
  let at: string | null = stepId
  for (let i = 0; i < 8 && at; i++) {
    const up: string | null = parentOf(at, rels)
    if (!up) return at === stepId ? null : (byId.get(at) ?? null)
    at = up
  }
  return at ? (byId.get(at) ?? null) : null
}
