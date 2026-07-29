// Absorb, as a store-level flow: send the open inventory + new text, apply
// the returned adjustments. Callers fall back to plain capture on 'empty'
// or 'failed' — absorbed or not, the user's words are never lost.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import { absorbIsEmpty, type AbsorbOutput } from '@shared/ai/actions/absorb'
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
