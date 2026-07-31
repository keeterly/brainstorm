// What falls out of a full cloud, and where it lands.
//
// The sibling of deepenFlow, and deliberately the same shape at the end: the
// steps become real thoughts, `part_of` the goal, with the order between them
// where the order matters. That is the whole point of the rewrite. Rain used
// to write its plan into `extra.plan` — a blob read by exactly one place in
// the codebase, the page that wrote it — so nothing it produced could be
// ticked, focused, drafted, answered or counted, and "it rains into the
// Current" was a sentence about a thing that never happened.
//
// What is different from deepen is what it costs. Deepen goes out to the web
// for a minute on a background job. This reads material that is already here,
// so it is one ordinary call that lands while you are still looking at the
// splash — which is what lets rain stay the instant gesture it looks like.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import type { RainOutput } from '@shared/ai/actions/rain'
import { markApplied } from '@/ai/pending'
import { learnFacts } from '@/ai/memoryFlow'

export type RainResult =
  | { kind: 'rained'; note: string; added: number; output: RainOutput }
  /** it read the cloud and found nothing that follows yet — an honest answer */
  | { kind: 'thin'; missing: string[] }
  | { kind: 'failed'; why?: string }

export async function rainThought(subjectId: string): Promise<RainResult> {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === subjectId)
  if (!subject) return { kind: 'failed' }

  const name = (t: { title: string | null; raw_content: string }) => t.title || t.raw_content.slice(0, 200)
  const byId = new Map(s.thoughts.map((t) => [t.id, t]))
  const parts = s.relationships.filter((r) => r.type === 'part_of' && r.to_id === subjectId)

  // Everything in it. All of it — the template took the first three and threw
  // the rest away without saying so, which on a seven-member cloud meant the
  // majority of what you had gathered never reached the thing reading it.
  const members = parts
    .map((r) => byId.get(r.from_id))
    .filter((t): t is NonNullable<typeof t> => !!t)
  const inside = members.filter((t) => t.status !== 'done').map(name).slice(0, 60)
  // …and what is already hanging under it as work, so nothing arrives twice.
  const already = members.filter((t) => t.type === 'action').map(name).slice(0, 40)

  // What you have told these things yourself: the part no amount of thinking
  // about the titles would recover.
  const ex = (t: { extra: Record<string, unknown> | null }) => (t.extra ?? {}) as Record<string, unknown>
  const known = [subject, ...members]
    .flatMap((t) => ((ex(t).answers as string[] | undefined) ?? []).map((a) => a))
    .slice(-20)

  const found = s.artifacts.find((a) => a.thought_id === subjectId)?.content_md

  try {
    const { output, runId } = await runAction<RainOutput>('rain', {
      name: name(subject),
      inside,
      known,
      found: found ? found.slice(0, 3000) : undefined,
      already,
    })
    return applyRain(subjectId, output, runId)
  } catch (e) {
    const why = (e as Error)?.message
    return { kind: 'failed', why: why && why.length < 90 ? why.toLowerCase() : undefined }
  }
}

/** Fold what fell into the graph, as work rather than as prose. */
export function applyRain(subjectId: string, output: RainOutput, runId: string | null): RainResult {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === subjectId)
  if (!subject) return { kind: 'failed' }

  // A cloud that rains is a goal, whatever it started life as — the same rule
  // deepen follows, and what makes the third moon offer `do it` on the leaves.
  if (subject.type !== 'goal') s.updateThought(subject.id, { type: 'goal' })
  // What it turned out to be, said under the name they gave it.
  if (output.read.trim() && output.read.trim() !== (subject.title ?? '').trim()) {
    s.updateThought(subject.id, { summary: output.read.trim().slice(0, 280) })
  }

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
    s.addRelationship(t.id, subject.id, 'part_of', 'ai', runId)
  }
  for (const step of output.steps) {
    const from = made.get(step.tempId)
    if (!from) continue
    for (const dep of step.dependsOn) {
      const to = made.get(dep)
      if (to && to !== from) s.addRelationship(from, to, 'depends_on', 'ai', runId)
    }
  }

  // What it could not get from the material is kept on the cloud rather than
  // shown once and lost: it is the thing to say next time you open this.
  s.updateThought(subject.id, {
    extra: {
      ...(subject.extra ?? {}),
      rained_at: new Date().toISOString(),
      missing: output.missing,
      // The template's leftovers. A path that was "kept" was kept in this blob,
      // and it is neither readable nor reachable now that the steps are real
      // thoughts — leaving it would mean the old page could resurrect a plan
      // that has since been superseded by actual work.
      plan: null,
      planSig: null,
      kept: true,
    },
  })

  void learnFacts(output.learned, `raining ${subject.title || subject.raw_content.slice(0, 80)}`, runId)
  if (runId) void markApplied(runId)

  if (!output.steps.length) return { kind: 'thin', missing: output.missing }
  return { kind: 'rained', note: output.note, added: output.steps.length, output }
}
