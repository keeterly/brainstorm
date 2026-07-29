// ⚡ — point it at one drop and it goes and does the legwork.
//
// What comes back is not a paragraph. The steps become real thoughts hanging
// off the subject, so a loose idea turns into a pool with actual work in it and
// the sky shows you that happened. The research is kept as a brief you can go
// back to. Whatever it worked out about you goes into memory, so the next ⚡
// starts from further along than this one did.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import type { DeepenOutput } from '@shared/ai/actions/deepen'
import type { PromptImage } from '@shared/ai/types'

export type DeepenResult =
  | { kind: 'deepened'; note: string; added: number; output: DeepenOutput }
  | { kind: 'failed' }

export async function deepenThought(
  subjectId: string,
  opts: { intent?: string; image?: PromptImage } = {},
): Promise<DeepenResult> {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === subjectId)
  if (!subject) return { kind: 'failed' }

  // what already hangs off it, so it does not hand back what you have
  const context = s.relationships
    .filter((r) => r.type === 'part_of' && r.to_id === subjectId)
    .map((r) => s.thoughts.find((t) => t.id === r.from_id))
    .filter((t): t is NonNullable<typeof t> => !!t && t.status !== 'done')
    .map((t) => t.title || t.raw_content.slice(0, 200))
    .slice(0, 40)

  try {
    const { output } = await runAction<DeepenOutput>('deepen', {
      subject: {
        id: subject.id,
        title: subject.title || subject.raw_content.slice(0, 300),
        type: subject.type,
        summary: subject.summary,
        due: subject.due_date,
      },
      context,
      intent: opts.intent?.trim() || undefined,
      image: opts.image,
    })

    // a thing with work under it is a goal, whatever it started life as
    if (subject.type !== 'goal') s.updateThought(subject.id, { type: 'goal' })

    const made = new Map<string, string>()
    for (const step of output.steps) {
      const t = s.addThought({
        raw_content: step.title,
        title: step.title,
        summary: step.why || null,
        type: 'action',
        effort: step.effort,
      })
      made.set(step.tempId, t.id)
      s.addRelationship(t.id, subject.id, 'part_of', 'ai')
    }
    // order only where it genuinely matters
    for (const step of output.steps) {
      const from = made.get(step.tempId)
      if (!from) continue
      for (const dep of step.dependsOn) {
        const to = made.get(dep)
        if (to && to !== from) s.addRelationship(from, to, 'depends_on', 'ai')
      }
    }

    if (output.found.length || output.sources.length) {
      s.addArtifact({
        id: crypto.randomUUID(),
        thought_id: subject.id,
        title: output.read,
        content_md: briefMarkdown(output),
        sources: output.sources,
        agent_run_id: null,
      })
    }

    // it learns you — but only things it does not already know
    const known = new Set(s.memories.map((m) => m.content.trim().toLowerCase()))
    for (const fact of output.learned) {
      const key = fact.trim().toLowerCase()
      if (!key || known.has(key)) continue
      known.add(key)
      s.addMemory(fact, 'distilled')
    }

    return { kind: 'deepened', note: output.note, added: output.steps.length, output }
  } catch {
    return { kind: 'failed' }
  }
}

/** The brief, kept as something a person can read later. */
export function briefMarkdown(o: DeepenOutput): string {
  const lines = [`# ${o.read}`, '']
  if (o.found.length) {
    lines.push('## What I found', '')
    for (const f of o.found) lines.push(`- **${f.point}**${f.why ? ` — ${f.why}` : ''}`)
    lines.push('')
  }
  if (o.steps.length) {
    lines.push('## The way through', '')
    o.steps.forEach((st, i) => lines.push(`${i + 1}. **${st.title}**${st.why ? ` — ${st.why}` : ''}`))
    lines.push('')
  }
  if (o.watchOuts.length) {
    lines.push('## Where this goes wrong', '')
    for (const w of o.watchOuts) lines.push(`- ${w}`)
    lines.push('')
  }
  if (o.sources.length) {
    lines.push('## Sources', '')
    for (const src of o.sources) lines.push(`- [${src.title}](${src.url})`)
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}
