// Telling one part of the map something new, and having it change.
//
// The rest of the app only ever adds. This is the one that can also rename and
// retire, which means it is the one that can be wrong in a way you would mind —
// so everything it does comes back as a single reversible move, and the caller
// is expected to offer it. Nothing is deleted: retiring is a status change, and
// putting it back is putting the status back.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import type { ReshapeOutput } from '@shared/ai/actions/reshape'
import type { PromptImage } from '@shared/ai/types'
import type { Thought } from '@/domain/types'

export interface ReshapeChange {
  /** what happened, in the user's terms */
  note: string
  added: number
  reworded: number
  retired: number
  grouped: number
  renamed: boolean
  /** put the map back exactly as it was */
  undo: () => void
}

export type ReshapeResult =
  | { kind: 'reshaped'; change: ReshapeChange }
  /** it read the news and the map already said all of it */
  | { kind: 'unchanged'; note: string }
  | { kind: 'failed'; why?: string }

export async function reshapeThought(
  subjectId: string,
  news: string,
  opts: { image?: PromptImage; spoken?: boolean } = {},
): Promise<ReshapeResult> {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === subjectId)
  if (!subject) return { kind: 'failed' }

  const kids = s.relationships
    .filter((r) => r.type === 'part_of' && r.to_id === subjectId)
    .map((r) => s.thoughts.find((t) => t.id === r.from_id))
    .filter((t): t is Thought => !!t && t.status === 'open')

  const brief = s.artifacts.find((a) => a.thought_id === subjectId)

  let output: ReshapeOutput
  try {
    ;({ output } = await runAction<ReshapeOutput>('reshape', {
      subject: {
        id: subject.id,
        title: subject.title || subject.raw_content.slice(0, 300),
        type: subject.type,
        summary: subject.summary,
      },
      inside: kids.slice(0, 80).map((t) => ({
        id: t.id,
        title: t.title || t.raw_content.slice(0, 200),
        type: t.type,
        summary: t.summary,
      })),
      news,
      spoken: opts.spoken || undefined,
      image: opts.image,
      // what it already went and found out, so new information is weighed
      // against the research rather than against nothing
      brief: brief?.content_md.slice(0, 4000),
    }))
  } catch (e) {
    const why = (e as Error)?.message
    return { kind: 'failed', why: why && why.length < 90 ? why.toLowerCase() : undefined }
  }

  // Only ever touch what was actually on the table. A model that invents an id
  // would otherwise rename or retire something the user was not looking at.
  const known = new Set(kids.map((t) => t.id))
  const g = useGraph.getState()
  const undos: (() => void)[] = []

  // --- rename the subject ---
  let renamed = false
  const newName = output.rename?.trim()
  if (newName && newName !== (subject.title || '').trim()) {
    const was = { title: subject.title, raw: subject.raw_content }
    g.updateThought(subject.id, { title: newName })
    undos.push(() => useGraph.getState().updateThought(subject.id, { title: was.title }))
    renamed = true
  }

  // --- reword what is already there ---
  let reworded = 0
  for (const r of output.reword) {
    if (!known.has(r.id)) continue
    const was = kids.find((t) => t.id === r.id)
    const next = r.title.trim()
    if (!was || !next || next === (was.title || '').trim()) continue
    g.updateThought(r.id, { title: next })
    undos.push(() => useGraph.getState().updateThought(r.id, { title: was.title }))
    reworded++
  }

  // --- add what the news brought ---
  const made = new Map<string, string>()
  for (const a of output.add) {
    const t = g.addThought({
      raw_content: a.title,
      title: a.title,
      summary: a.why || null,
      type: a.type,
      source: 'text',
    })
    made.set(a.tempId, t.id)
    g.addRelationship(t.id, subject.id, 'part_of', 'ai')
    undos.push(() => useGraph.getState().deleteThought(t.id))
  }

  // --- gather what now clearly belongs together ---
  let grouped = 0
  for (const grp of output.group) {
    const ids = grp.members.map((m) => made.get(m) ?? m).filter((id) => known.has(id) || [...made.values()].includes(id))
    if (ids.length < 2) continue
    const hub = g.addThought({ raw_content: grp.name, title: grp.name, type: 'goal', source: 'text' })
    g.addRelationship(hub.id, subject.id, 'part_of', 'ai')
    undos.push(() => useGraph.getState().deleteThought(hub.id))
    for (const id of ids) {
      // out of the subject, into the new group inside it
      const old = useGraph.getState().relationships.find((r) => r.type === 'part_of' && r.from_id === id && r.to_id === subject.id)
      if (old) {
        useGraph.getState().deleteRelationship(old.id)
        undos.push(() => useGraph.getState().addRelationship(id, subject.id, 'part_of', 'ai'))
      }
      const rel = g.addRelationship(id, hub.id, 'part_of', 'ai')
      if (rel) undos.push(() => useGraph.getState().deleteRelationship(rel.id))
    }
    grouped++
  }

  // --- retire what the news settles ---
  // Last, so that anything retired has already been reworded or regrouped if
  // the model asked for both, and the undo stack unwinds in the right order.
  let retired = 0
  for (const r of output.retire) {
    if (!known.has(r.id)) continue
    const was = kids.find((t) => t.id === r.id)
    if (!was) continue
    g.updateThought(r.id, { status: 'done', completed_at: new Date().toISOString(), summary: r.why })
    undos.push(() =>
      useGraph.getState().updateThought(r.id, { status: was.status, completed_at: was.completed_at, summary: was.summary }),
    )
    retired++
  }

  const touched = output.add.length + reworded + retired + grouped + (renamed ? 1 : 0)
  if (!touched) return { kind: 'unchanged', note: output.note || 'nothing here needed to change' }

  return {
    kind: 'reshaped',
    change: {
      note: output.note,
      added: output.add.length,
      reworded,
      retired,
      grouped,
      renamed,
      // in reverse, so a thought that was regrouped and then retired comes back
      // to the group it left rather than to nowhere
      undo: () => {
        for (let i = undos.length - 1; i >= 0; i--) undos[i]()
      },
    },
  }
}

/** What changed, short enough for the bar at the foot of the sky. */
export function reshapeTally(c: ReshapeChange): string {
  const bits: string[] = []
  if (c.added) bits.push(`${c.added} new`)
  if (c.reworded) bits.push(`${c.reworded} reworded`)
  if (c.grouped) bits.push(`${c.grouped} gathered`)
  if (c.retired) bits.push(`${c.retired} settled`)
  if (c.renamed) bits.push('renamed')
  return bits.join(' · ')
}
