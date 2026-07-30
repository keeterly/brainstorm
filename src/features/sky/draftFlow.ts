// Having the thing done.
//
// The sibling of answerFlow and deepenFlow, and the same shape as both: run it,
// land it separately, because a background run outlives the page that started
// it. What is different is what comes back. deepen turns a thing into a path
// with work under it; answer writes down what is true; this one makes the work
// itself and keeps it where everything else the agent produced is kept.
//
// Which is the point of it. An idea funnels into a path, a path rains into
// actions, and until now the funnel ended at a tick box: the agent could plan
// your work and research your work and never once do any of it.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import type { DraftOutput } from '@shared/ai/actions/draft'
import { markApplied } from '@/ai/pending'
import type { Sizing } from './gaugeFlow'

export type DraftResult =
  | { kind: 'drafted'; line: string; title: string; done: boolean; output: DraftOutput }
  | { kind: 'failed'; why?: string }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/** The first sentence, which is what the app says out loud when it lands. */
export function firstLine(md: string): string {
  const plain = md
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const first = plain.find((l) => !/^[-–—|]/.test(l)) ?? plain[0] ?? ''
  const stop = first.search(/[.!?](\s|$)/)
  return clip(stop > 24 ? first.slice(0, stop + 1) : first, 150)
}

export async function draftThought(
  subjectId: string,
  opts: { intent?: string; sizing?: Sizing } = {},
): Promise<DraftResult> {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === subjectId)
  if (!subject) return { kind: 'failed' }

  const name = (t: { title: string | null; raw_content: string }) => t.title || t.raw_content.slice(0, 200)

  // The goal this step belongs to, and the other steps of it. Both matter: the
  // goal is most of the brief, and the neighbours are how it knows to write the
  // summary and not also file the forms.
  const parentId = s.relationships.find((r) => r.type === 'part_of' && r.from_id === subjectId)?.to_id
  const parent = parentId ? s.thoughts.find((t) => t.id === parentId) : null
  const alongside = parentId
    ? s.relationships
        .filter((r) => r.type === 'part_of' && r.to_id === parentId && r.from_id !== subjectId)
        .map((r) => s.thoughts.find((t) => t.id === r.from_id))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map(name)
    : []

  // Everything you have told it yourself, which is the part no amount of
  // searching would ever turn up.
  const extra = (subject.extra ?? {}) as Record<string, unknown>
  const known = ((extra.answers as string[] | undefined) ?? []).slice(-8)

  // …and whatever the agent already found out about the goal, so a draft
  // written under a researched goal does not start from nothing.
  const found = parentId ? s.artifacts.find((a) => a.thought_id === parentId)?.content_md : undefined

  try {
    const { output, runId } = await runAction<DraftOutput>(
      'draft',
      {
        subject: { id: subject.id, title: name(subject), summary: subject.summary, due: subject.due_date },
        under: parent ? name(parent) : undefined,
        alongside: alongside.slice(0, 40),
        known,
        found: found ? found.slice(0, 4000) : undefined,
        intent: opts.intent?.trim() || undefined,
      },
      opts.sizing ? { searches: opts.sizing.searches, background: !opts.sizing.quick } : {},
    )
    return applyDraft(subjectId, output, runId)
  } catch (e) {
    const why = (e as Error)?.message
    return { kind: 'failed', why: why && why.length < 90 ? why.toLowerCase() : undefined }
  }
}

/**
 * The draft, in markdown, as the brief reader already renders it.
 *
 * The body first and whole, because the body is the thing. Everything else is
 * apparatus and goes underneath, in the order you would want it: what to change
 * before you use it, what it assumed, what it could not do at all.
 */
export function draftMarkdown(o: DraftOutput): string {
  const out: string[] = [`# ${o.title}`, '', o.body.trim()]
  if (o.check.length) {
    out.push('', '## Before you use it')
    for (const c of o.check) out.push(`- ${c.what}${c.why ? ` — ${c.why}` : ''}`)
  }
  if (o.assumed.length) {
    out.push('', '## It assumed')
    for (const a of o.assumed) out.push(`- ${a}`)
  }
  if (o.blocked.length) {
    out.push('', '## It could not')
    for (const b of o.blocked) out.push(`- ${b}`)
  }
  return out.join('\n')
}

/** Fold a finished draft into the graph. */
export function applyDraft(subjectId: string, output: DraftOutput, runId: string | null): DraftResult {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === subjectId)
  if (!subject) return { kind: 'failed' }

  s.updateThought(subject.id, {
    // the sky reads a summary under the title; say what was made
    summary: clip(output.title, 280),
    extra: { ...(subject.extra ?? {}), drafted_at: new Date().toISOString(), draft_done: output.done },
  })

  // Kept as a brief, which is the one place in this app where something the
  // agent produced already lives, can be reopened weeks later, and is already
  // deep-linked from a notification.
  s.addArtifact({
    id: crypto.randomUUID(),
    thought_id: subject.id,
    title: output.title,
    content_md: draftMarkdown(output),
    sources: output.sources,
    agent_run_id: runId,
  })

  const seen = new Set(s.memories.map((m) => m.content.trim().toLowerCase()))
  for (const fact of output.learned) {
    const key = fact.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    s.addMemory(fact, 'distilled')
  }

  if (runId) void markApplied(runId)
  return { kind: 'drafted', line: firstLine(output.body), title: output.title, done: output.done, output }
}
