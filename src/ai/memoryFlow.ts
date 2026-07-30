// The one door into memory.
//
// There were seven of them. absorbFlow, deepenFlow, answerFlow, draftFlow,
// noticeFlow, CollectPage and MemoryPage each ran `distill_memory` or took the
// `learned` list off some other action's output, and each one then did the same
// four lines: lowercase the existing set, skip anything already in it, push the
// rest. Which is why memory only ever grew, and why the same belief could sit
// in it three times in three phrasings.
//
// Everything now goes through learn(). It recalls what is already believed near
// this, hands both to the reconciler, and applies what comes back — adding,
// correcting, or, far more often than the old code could ever manage, doing
// nothing at all because it already knew.
//
// It never throws and it never blocks. Memory is a background courtesy: an
// answer that lands should not fail because the app could not decide what it
// had learned from it, and nobody should watch a spinner for it.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import { recall } from '@/domain/recall'
import type { RememberOutput } from '@shared/ai/actions/remember'

export interface Learned {
  added: number
  updated: number
  archived: number
  /** already known — the commonest outcome, and the point of the exercise */
  knew: number
}

const NOTHING: Learned = { added: 0, updated: 0, archived: 0, knew: 0 }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/**
 * Take something in and work out what, if anything, it changes.
 *
 * `text` is the raw material: what they typed, or the facts an action said it
 * learned. `from` is one phrase for the trail — "a draft of the buyer note" —
 * so the Memory tab can say where a belief came from rather than just asserting
 * it.
 */
export async function learn(
  text: string,
  opts: { from?: string; runId?: string | null } = {},
): Promise<Learned> {
  const body = text.trim()
  const s = useGraph.getState()
  if (!body || s.offline || !s.userId) return NOTHING

  // What it already believes anywhere near this. Wider than a prompt gets —
  // the reconciler has to be able to see a near-duplicate in order to say
  // "you already know this", and a list too short is how duplicates get in.
  const live = s.memories.filter((m) => !m.archived_at)
  const near = recall(live, body, 30)
  // Standing memories are always in `near`; the rest of the corpus is not, so
  // for a small memory send all of it and let the model see the whole picture.
  const known = (live.length <= 40 ? live : near).map((m) => ({
    id: m.id,
    content: m.content,
    kind: m.kind ?? null,
  }))

  try {
    const { output, runId } = await runAction<RememberOutput>('remember', {
      text: body.slice(0, 16000),
      from: opts.from,
      known,
    })
    return applyOps(output, opts.runId ?? runId)
  } catch {
    // A memory that could not be updated is not an error anybody wants to see.
    return NOTHING
  }
}

/** Fold the reconciler's decisions into the store. Pure of network, so testable. */
export function applyOps(output: RememberOutput, runId: string | null = null): Learned {
  const s = useGraph.getState()
  const byId = new Map(s.memories.map((m) => [m.id, m]))
  const tally: Learned = { ...NOTHING }

  for (const op of output?.ops ?? []) {
    if (op.op === 'noop') {
      tally.knew++
      // it confirmed something it already believed — that is worth a point
      if (op.id && byId.has(op.id)) s.reinforceMemories([op.id])
      continue
    }

    if (op.op === 'add') {
      const content = op.content?.trim()
      if (!content) continue
      // Last line of defence. The model is told to say noop, and mostly does;
      // an exact repeat still must not get in, because a duplicate memory is
      // the one failure this whole file exists to prevent.
      const same = s.memories.find(
        (m) => !m.archived_at && m.content.trim().toLowerCase() === content.toLowerCase(),
      )
      if (same) {
        tally.knew++
        s.reinforceMemories([same.id])
        continue
      }
      const m = s.addMemory(content, 'learned', {
        kind: op.kind ?? null,
        origin: { why: op.why ?? null, run: runId },
      })
      s.noteMemory({ memory_id: m.id, op: 'add', before: null, after: content, why: op.why ?? null, agent_run_id: runId })
      tally.added++
      continue
    }

    if (op.op === 'update') {
      const old = op.id ? byId.get(op.id) : undefined
      const content = op.content?.trim()
      if (!old || old.archived_at || !content || content === old.content) continue
      // In place, keeping the id: a correction is the same belief said better,
      // and it should not lose the strength it earned or the trail behind it.
      s.reviseMemory(old.id, { content, kind: op.kind ?? old.kind ?? null })
      s.noteMemory({ memory_id: old.id, op: 'update', before: old.content, after: content, why: op.why ?? null, agent_run_id: runId })
      tally.updated++
      continue
    }

    if (op.op === 'archive') {
      const old = op.id ? byId.get(op.id) : undefined
      if (!old || old.archived_at) continue
      s.archiveMemory(old.id, null)
      s.noteMemory({ memory_id: old.id, op: 'archive', before: old.content, after: null, why: op.why ?? null, agent_run_id: runId })
      tally.archived++
    }
  }
  return tally
}

/**
 * A line for the app to say out loud, or null when nothing happened.
 *
 * Null is the usual answer and that is correct. Announcing "learned nothing
 * new" after every capture is noise, and a memory that narrates itself
 * constantly is one you stop reading.
 */
export function learnedLine(l: Learned): string | null {
  const bits = [
    l.added ? `${l.added} new` : '',
    l.updated ? `${l.updated} corrected` : '',
    l.archived ? `${l.archived} no longer true` : '',
  ].filter(Boolean)
  return bits.length ? `memory · ${bits.join(' · ')}` : null
}

/**
 * Facts an action already extracted, handed to the reconciler rather than
 * pushed straight in.
 *
 * deepen, answer and draft all end with a `learned` list, and all three used to
 * append it wholesale. They keep producing it — a model that has just spent a
 * minute on your problem is in the best position to notice something durable
 * about you — but what it notices is now a proposal, not a write.
 */
export async function learnFacts(facts: string[], from: string, runId: string | null = null): Promise<Learned> {
  const clean = facts.map((f) => f.trim()).filter(Boolean)
  if (!clean.length) return NOTHING
  return learn(clean.map((f) => `- ${f}`).join('\n'), { from: clip(from, 120), runId })
}
