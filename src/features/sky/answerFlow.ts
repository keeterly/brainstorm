// Asking one thing on the map, and being told.
//
// The sibling of deepenFlow, and deliberately the same shape — run it, and land
// it separately, because a background run outlives the page that started it and
// the answer has to be able to arrive at a sky nobody was watching. What is
// different is what comes back. deepen turns a drop into a pool with work under
// it; this leaves the shape of your map alone and writes down what is true.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import type { AnswerOutput } from '@shared/ai/actions/answer'
import type { PromptImage } from '@shared/ai/types'
import { markApplied } from '@/ai/pending'
import type { Sizing } from './gaugeFlow'

export type AnswerResult =
  | { kind: 'answered'; line: string; added: number; settled: boolean; output: AnswerOutput }
  | { kind: 'failed'; why?: string }

export async function answerThought(
  subjectId: string,
  opts: { intent?: string; image?: PromptImage; sizing?: Sizing } = {},
): Promise<AnswerResult> {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === subjectId)
  if (!subject) return { kind: 'failed' }

  const title = (t: { title: string | null; raw_content: string }) => t.title || t.raw_content.slice(0, 200)

  // What stands around the question is most of the question. "Fares for
  // LAX→CDG" under "SS27 Lookbook & Collection Prep, arrive by fashion week"
  // is a different question from the same words on their own, and the model
  // has no way to know that unless the neighbours come with it.
  const parentId = s.relationships.find((r) => r.type === 'part_of' && r.from_id === subjectId)?.to_id
  const parent = parentId ? s.thoughts.find((t) => t.id === parentId) : null
  const siblings = parentId
    ? s.relationships
        .filter((r) => r.type === 'part_of' && r.to_id === parentId && r.from_id !== subjectId)
        .map((r) => s.thoughts.find((t) => t.id === r.from_id))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map(title)
    : []
  // and whatever hangs under the question itself
  const inside = s.relationships
    .filter((r) => r.type === 'part_of' && r.to_id === subjectId)
    .map((r) => s.thoughts.find((t) => t.id === r.from_id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map(title)

  try {
    const { output, runId } = await runAction<AnswerOutput>(
      'answer',
      {
        subject: {
          id: subject.id,
          title: title(subject),
          type: subject.type,
          summary: subject.summary,
          due: subject.due_date,
        },
        context: [...inside, ...siblings].slice(0, 40),
        under: parent ? title(parent) : undefined,
        intent: opts.intent?.trim() || undefined,
        image: opts.image,
      },
      // a question whose answer needs nothing looked up comes back in seconds
      opts.sizing ? { searches: opts.sizing.searches, background: !opts.sizing.quick } : {},
    )
    return applyAnswer(subjectId, output, runId)
  } catch (e) {
    const why = (e as Error)?.message
    return { kind: 'failed', why: why && why.length < 90 ? why.toLowerCase() : undefined }
  }
}

/**
 * Fold a finished answer into the graph.
 *
 * The answer is kept as a brief, which is the one place in this app where
 * something researched already lives and can already be reopened, deep-linked
 * from a notification and read weeks later. A question that has been answered
 * also carries the answer on its own summary, so the thing on the map says what
 * it now knows rather than still only asking.
 */
export function applyAnswer(subjectId: string, output: AnswerOutput, runId: string | null): AnswerResult {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === subjectId)
  if (!subject) return { kind: 'failed' }

  s.updateThought(subject.id, {
    // the drop now knows something; say so where the drop is read
    summary: clip(output.answer, 280),
    extra: { ...(subject.extra ?? {}), answered_at: new Date().toISOString(), answer_settled: output.settled },
  })

  // Only what the answer genuinely created. Usually nothing — and nothing is
  // the correct outcome for a question, however much a task list wants filling.
  let added = 0
  for (const step of output.next) {
    const t = s.addThought({
      raw_content: step.title,
      title: step.title,
      summary: step.why || null,
      type: 'action',
      effort: step.effort,
    })
    // hung off the same goal the question hangs off, not off the question —
    // work that came out of an answer is not part of asking it
    const parentId = s.relationships.find((r) => r.type === 'part_of' && r.from_id === subjectId)?.to_id
    s.addRelationship(t.id, parentId ?? subject.id, 'part_of', 'ai', runId)
    added++
  }

  s.addArtifact({
    id: crypto.randomUUID(),
    thought_id: subject.id,
    title: output.asked,
    content_md: answerMarkdown(output),
    sources: output.sources,
    agent_run_id: runId,
  })

  const known = new Set(s.memories.map((m) => m.content.trim().toLowerCase()))
  for (const fact of output.learned) {
    const key = fact.trim().toLowerCase()
    if (!key || known.has(key)) continue
    known.add(key)
    s.addMemory(fact, 'distilled')
  }

  if (runId) void markApplied(runId)
  return {
    kind: 'answered',
    line: firstSentence(output.answer),
    added,
    settled: output.settled,
    output,
  }
}

/** The answer, written down as something a person reads later. */
export function answerMarkdown(o: AnswerOutput): string {
  const lines = [`# ${o.asked}`, '', o.answer.trim(), '']
  if (o.facts.length) {
    lines.push('## The specifics', '')
    for (const f of o.facts) lines.push(`- **${f.label}: ${f.value}**${f.note ? ` — ${f.note}` : ''}`)
    lines.push('')
  }
  if (o.asOf.trim()) lines.push('## As of', '', o.asOf.trim(), '')
  if (o.unknown.length) {
    lines.push('## Still open', '')
    for (const u of o.unknown) lines.push(`- ${u.what}${u.toKnow ? ` — ${u.toKnow}` : ''}`)
    lines.push('')
  }
  if (o.next.length) {
    lines.push('## What this makes', '')
    o.next.forEach((n, i) => lines.push(`${i + 1}. **${n.title}**${n.why ? ` — ${n.why}` : ''}`))
    lines.push('')
  }
  if (o.sources.length) {
    lines.push('## Sources', '')
    for (const src of o.sources) lines.push(`- [${src.title}](${src.url})`)
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

/**
 * The one line of it worth putting where only one line fits.
 *
 * The first sentence, because the prompt requires the answer to open with the
 * specific thing — the figure, the name, the date. If that sentence runs long,
 * it is clipped rather than swapped for a count of how many facts came back:
 * "$1,180–$1,420 round trip…" is worth more at a glance than "6 facts".
 */
export function firstSentence(s: string): string {
  const t = s.trim()
  // a decimal point, an initial and "Sept 28" are not ends of sentences
  const m = t.match(/^[\s\S]*?[.!?](?=\s+[^a-z0-9]|\s*$)/)
  const one = (m?.[0] ?? t).trim()
  return clip(one.length < 12 ? t : one, 160)
}

const clip = (s: string, n: number) => {
  const t = s.trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}
