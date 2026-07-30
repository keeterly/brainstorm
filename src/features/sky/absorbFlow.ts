// Absorb, as a store-level flow: send the open inventory + new text, apply
// the returned adjustments. Callers fall back to plain capture on 'empty'
// or 'failed' — absorbed or not, the user's words are never lost.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import { absorbIsEmpty, type AbsorbOutput } from '@shared/ai/actions/absorb'
import type { OrganizeOutput } from '@shared/ai/actions/organize'
import type { NamePoolOutput } from '@shared/ai/actions/name-pool'
import type { ClusterOutput } from '@shared/ai/actions/cluster'
import type { Thought } from '@/domain/types'
import { learn } from '@/ai/memoryFlow'

export type AbsorbResult = { kind: 'absorbed'; note: string } | { kind: 'empty' } | { kind: 'failed' }

export async function absorbText(text: string): Promise<AbsorbResult> {
  const s = useGraph.getState()
  const open = s.thoughts.filter((t) => t.status === 'open')
  try {
    const { output } = await runAction<AbsorbOutput>('absorb', {
      text,
      thoughts: open.slice(0, 200).map((t) => ({
        id: t.id,
        title: t.title || t.raw_content.slice(0, 200),
        type: t.type,
        summary: t.summary,
        due: t.due_date,
      })),
    })
    if (absorbIsEmpty(output)) return { kind: 'empty' }
    const known = new Set(open.map((t) => t.id))
    for (const u of output.updates) {
      if (!known.has(u.id)) continue
      const patch: Partial<Thought> = {}
      if (u.title) patch.title = u.title
      if (u.summary !== undefined) patch.summary = u.summary
      if (u.due_date !== undefined) patch.due_date = u.due_date
      s.updateThought(u.id, patch)
    }
    for (const id of output.completions) {
      if (known.has(id)) s.updateThought(id, { status: 'done', completed_at: new Date().toISOString() })
    }
    for (const sn of output.snoozes) {
      if (known.has(sn.id)) s.updateThought(sn.id, { status: 'snoozed', snooze_until: sn.until })
    }
    const tempIds = new Map<string, string>()
    for (const a of output.additions) {
      const created = s.addThought({ raw_content: a.title, title: a.title, type: a.type, due_date: a.due_date ?? null })
      tempIds.set(a.tempId, created.id)
    }
    for (const a of output.additions) {
      if (!a.part_of) continue
      const parent = known.has(a.part_of) ? a.part_of : tempIds.get(a.part_of)
      const childId = tempIds.get(a.tempId)
      if (parent && childId && parent !== childId) s.addRelationship(childId, parent, 'part_of')
    }
    learnQuietly(text)
    return { kind: 'absorbed', note: output.note }
  } catch {
    return { kind: 'failed' }
  }
}

// Passive memory — fire and forget, never blocking, never loud.
//
// It used to extract facts and push every one of them, which is how the same
// belief ended up in the list three times in three phrasings. It now proposes,
// and the reconciler decides; most of the time the decision is that it already
// knew, and nothing happens at all.
export function learnQuietly(text: string, from = 'something you wrote') {
  if (text.length < 120) return
  void learn(text, { from })
}

// Organize — a brain dump (typed or spoken) becomes structure in the sky:
// atomic drops, named pools around real themes, threads between the ideas
// that speak to each other. Returns what to say and where to splash.
export type OrganizeResult =
  | { kind: 'organized'; note: string; drops: number; pools: number; links: number; source?: string }
  | { kind: 'nothing' }
  | { kind: 'failed' }

export async function organizeText(
  text: string,
  spoken: boolean,
  place: (id: string, i: number, total: number) => void,
  image?: { mediaType: string; dataB64: string },
): Promise<OrganizeResult> {
  const s = useGraph.getState()
  const open = s.thoughts.filter((t) => t.status === 'open')
  try {
    const { output } = await runAction<OrganizeOutput>('organize', {
      text,
      spoken,
      image,
      thoughts: open.slice(0, 200).map((t) => ({
        id: t.id,
        title: t.title || t.raw_content.slice(0, 200),
        type: t.type,
        summary: t.summary,
        due: t.due_date,
      })),
    })
    if (!output.drops.length) return { kind: 'nothing' }

    const known = new Set(open.map((t) => t.id))
    const real = new Map<string, string>() // tempId -> real id
    output.drops.forEach((d, i) => {
      const created = s.addThought({ raw_content: d.text, title: d.text, type: d.type })
      real.set(d.tempId, created.id)
      place(created.id, i, output.drops.length)
    })
    const resolve = (ref: string) => (known.has(ref) ? ref : real.get(ref))

    let pools = 0
    for (const p of output.pools) {
      const members = p.members.map(resolve).filter((x): x is string => !!x)
      // a pool of one is just a thought wearing a hat
      if (members.length < 2) continue
      const goal = s.addThought({ raw_content: p.name, title: p.name, type: 'goal' })
      place(goal.id, pools, Math.max(1, output.pools.length))
      for (const m of members) s.addRelationship(m, goal.id, 'part_of')
      pools++
    }

    let links = 0
    for (const l of output.links) {
      const a = resolve(l.a)
      const b = resolve(l.b)
      if (a && b && a !== b) {
        s.addRelationship(a, b, 'relates_to', 'ai')
        links++
      }
    }
    learnQuietly(text)
    return { kind: 'organized', note: output.note, drops: output.drops.length, pools, links, source: output.source }
  } catch {
    return { kind: 'failed' }
  }
}

// Name a pool properly, a moment after it forms. The drag stays instant — the
// local guess appears at once and the real name replaces it when it lands.
export function nameThePool(goalId: string, members: string[]) {
  if (members.length < 2) return
  const s = useGraph.getState()
  if (s.offline) return
  void runAction<NamePoolOutput>('name_pool', { members: members.slice(0, 20).map((m) => m.slice(0, 300)) })
    .then(({ output }) => {
      const name = output.name.trim().replace(/^["'“”]|["'“”.]$/g, '')
      if (name) s.updateThought(goalId, { title: name, raw_content: name })
    })
    .catch(() => {
      /* the local guess stands */
    })
}

// Tidy — put the loose thoughts where they belong. Only moves what exists.
export type ClusterResult =
  | { kind: 'tidied'; note: string; joined: number; made: number; focus?: string }
  | { kind: 'nothing' }
  | { kind: 'failed' }

export async function tidySky(place: (goalId: string, i: number, total: number) => void): Promise<ClusterResult> {
  const s = useGraph.getState()
  const open = s.thoughts.filter((t) => t.status === 'open')
  const goals = open.filter((t) => t.type === 'goal')
  const memberOf = new Map<string, string>()
  for (const r of s.relationships) if (r.type === 'part_of') memberOf.set(r.from_id, r.to_id)
  const loose = open.filter((t) => t.type !== 'goal' && !memberOf.has(t.id))
  if (loose.length < 2) return { kind: 'nothing' }
  try {
    const { output } = await runAction<ClusterOutput>('cluster', {
      loose: loose.slice(0, 120).map((t) => ({
        id: t.id,
        title: t.title || t.raw_content.slice(0, 200),
        type: t.type,
        summary: t.summary,
        due: t.due_date,
      })),
      pools: goals.slice(0, 40).map((g) => ({
        id: g.id,
        name: g.title || g.raw_content.slice(0, 80),
        members: open.filter((t) => memberOf.get(t.id) === g.id).slice(0, 30).map((t) => (t.title || t.raw_content).slice(0, 200)),
      })),
    })
    const looseIds = new Set(loose.map((t) => t.id))
    const goalIds = new Set(goals.map((g) => g.id))
    const used = new Set<string>()
    let joined = 0
    for (const g of output.intoExisting) {
      if (!goalIds.has(g.poolId)) continue
      for (const m of g.members) {
        if (!looseIds.has(m) || used.has(m)) continue
        used.add(m)
        s.addRelationship(m, g.poolId, 'part_of', 'ai')
        joined++
      }
    }
    let made = 0
    for (const p of output.newPools) {
      const members = p.members.filter((m) => looseIds.has(m) && !used.has(m))
      if (members.length < 2) continue
      const goal = s.addThought({ raw_content: p.name, title: p.name, type: 'goal' })
      place(goal.id, made, Math.max(1, output.newPools.length))
      for (const m of members) {
        used.add(m)
        s.addRelationship(m, goal.id, 'part_of', 'ai')
      }
      made++
    }
    if (!joined && !made) return { kind: 'nothing' }
    return { kind: 'tidied', note: output.note, joined, made, focus: output.focus?.poolName }
  } catch {
    return { kind: 'failed' }
  }
}
