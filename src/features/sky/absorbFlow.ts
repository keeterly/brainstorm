// Absorb, as a store-level flow: send the open inventory + new text, apply
// the returned adjustments. Callers fall back to plain capture on 'empty'
// or 'failed' — absorbed or not, the user's words are never lost.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import { absorbIsEmpty, type AbsorbOutput } from '@shared/ai/actions/absorb'
import type { OrganizeOutput } from '@shared/ai/actions/organize'
import type { DistillOutput } from '@shared/ai/actions/distill-memory'
import type { Thought } from '@/domain/types'

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

// passive memory — fire and forget, never blocking, never loud
export function learnQuietly(text: string) {
  if (text.length < 120) return
  const s = useGraph.getState()
  void runAction<DistillOutput>('distill_memory', {
    text,
    existing: s.memories.map((m) => m.content).slice(0, 100),
  })
    .then(({ output }) => output.facts.forEach((f) => s.addMemory(f, 'distilled')))
    .catch(() => {})
}

// Organize — a brain dump (typed or spoken) becomes structure in the sky:
// atomic drops, named pools around real themes, threads between the ideas
// that speak to each other. Returns what to say and where to splash.
export type OrganizeResult =
  | { kind: 'organized'; note: string; drops: number; pools: number; links: number }
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
    return { kind: 'organized', note: output.note, drops: output.drops.length, pools, links }
  } catch {
    return { kind: 'failed' }
  }
}
