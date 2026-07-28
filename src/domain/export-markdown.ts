// Export the whole brain (or one goal) as readable Markdown.
import type { Memory, Relationship, Roadmap, Thought } from './types'

export interface ExportData {
  thoughts: Thought[]
  relationships: Relationship[]
  roadmaps: Roadmap[]
  memories: Memory[]
}

const TYPE_ORDER = [
  'goal',
  'idea',
  'question',
  'problem',
  'decision',
  'action',
  'task',
  'note',
  'concept',
  'reference',
  'constraint',
  'inspiration',
] as const

export function exportMarkdown(data: ExportData, generatedAt: Date = new Date()): string {
  const { thoughts, relationships, roadmaps, memories } = data
  const byId = new Map(thoughts.map((t) => [t.id, t]))
  const lines: string[] = []
  lines.push(`# Brainstorm export`)
  lines.push(``)
  lines.push(`Generated ${generatedAt.toISOString().slice(0, 10)} · ${thoughts.length} thoughts`)
  lines.push(``)

  const partOf = new Map<string, string[]>() // parent goal id -> child ids
  for (const r of relationships) {
    if (r.type === 'part_of') {
      const arr = partOf.get(r.to_id) ?? []
      arr.push(r.from_id)
      partOf.set(r.to_id, arr)
    }
  }
  const childIds = new Set([...partOf.values()].flat())

  const goals = thoughts.filter((t) => t.type === 'goal' && t.status !== 'archived')
  if (goals.length) {
    lines.push(`## Goals`)
    lines.push(``)
    for (const g of goals) {
      lines.push(`### ${g.title || g.raw_content.slice(0, 80)}${g.due_date ? ` (due ${g.due_date})` : ''}`)
      if (g.summary) lines.push(g.summary)
      const kids = (partOf.get(g.id) ?? [])
        .map((id) => byId.get(id))
        .filter((t): t is Thought => !!t)
      for (const k of kids) {
        lines.push(`- [${k.status === 'done' ? 'x' : ' '}] ${k.title || k.raw_content.slice(0, 100)}`)
      }
      const rm = roadmaps.find((r) => r.goal_thought_id === g.id && r.status === 'active')
      if (rm) {
        lines.push(``)
        lines.push(`**Roadmap: ${rm.title}**`)
        for (const p of rm.phases) {
          lines.push(`- **${p.title}** — ${p.why}`)
          for (const a of p.actions) {
            const th = byId.get(a.thought_id)
            lines.push(`  - [${th?.status === 'done' ? 'x' : ' '}] ${a.title}`)
          }
        }
      }
      lines.push(``)
    }
  }

  const loose = thoughts.filter(
    (t) => t.type !== 'goal' && t.status !== 'archived' && !childIds.has(t.id),
  )
  const grouped = new Map<string, Thought[]>()
  for (const t of loose) {
    const arr = grouped.get(t.type) ?? []
    arr.push(t)
    grouped.set(t.type, arr)
  }
  for (const type of TYPE_ORDER) {
    const arr = grouped.get(type)
    if (!arr?.length || type === 'goal') continue
    lines.push(`## ${type[0].toUpperCase()}${type.slice(1)}s`)
    lines.push(``)
    for (const t of arr) {
      const mark = t.type === 'action' || t.type === 'task' ? `[${t.status === 'done' ? 'x' : ' '}] ` : ''
      lines.push(`- ${mark}${t.title || t.raw_content.slice(0, 120)}${t.due_date ? ` (due ${t.due_date})` : ''}`)
      if (t.summary && t.summary !== t.title) lines.push(`  - ${t.summary}`)
    }
    lines.push(``)
  }

  if (memories.length) {
    lines.push(`## Memory`)
    lines.push(``)
    for (const m of memories) lines.push(`- ${m.content}`)
    lines.push(``)
  }

  return lines.join('\n')
}
