// Reading a wall of references, and where the reading lands.
//
// The result is a brief on the group, deliberately — the same shape ⚡ leaves
// behind. Three things follow from that and all three are the point:
//
//   1. It is readable later, on the page that already exists for reading, from
//      the moon that already exists for reaching it.
//   2. The group wears the mark, so a wall you have read looks different from
//      one you have not.
//   3. `rain` passes an existing brief in as `found` — so a moodboard can be
//      read, and then rained into the work that follows from what it turned
//      out to be about. That composition is the whole product: concept to
//      execution, on pictures.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import type { LookOutput } from '@shared/ai/actions/look'
import type { PromptImage } from '@shared/ai/types'
import { markApplied } from '@/ai/pending'
import { learnFacts } from '@/ai/memoryFlow'
import type { Thought } from '@/domain/types'

export type LookResult =
  | { kind: 'read'; note: string; output: LookOutput }
  /** fewer than two pictures in there — there is no *across* to read */
  | { kind: 'thin' }
  | { kind: 'failed'; why?: string }

const name = (t: { title: string | null; raw_content: string }) => t.title || t.raw_content.slice(0, 200)
const ex = (t: Thought) => (t.extra ?? {}) as Record<string, unknown>

/** The stored face of a photo drop, if it is one. */
export function faceOf(t: Thought): PromptImage | null {
  const img = ex(t).img
  if (typeof img !== 'string') return null
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(img)
  if (!m) return null
  return { mediaType: m[1], dataB64: m[2] }
}

/** Everything in this group that is a picture. */
export function referencesIn(groupId: string): Thought[] {
  const s = useGraph.getState()
  return s.relationships
    .filter((r) => r.type === 'part_of' && r.to_id === groupId)
    .map((r) => s.thoughts.find((t) => t.id === r.from_id))
    .filter((t): t is Thought => !!t && t.status === 'open' && !!faceOf(t))
}

/** Two or more pictures in a group is a wall, and a wall can be read. */
export function isWall(groupId: string): boolean {
  return referencesIn(groupId).length >= 2
}

export async function lookAtWall(groupId: string): Promise<LookResult> {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === groupId)
  if (!subject) return { kind: 'failed' }

  const refs = referencesIn(groupId)
  if (refs.length < 2) return { kind: 'thin' }

  // Twelve at most, and the faces rather than the full-size copies. Twelve
  // 320px thumbnails is a few thousand tokens; twelve full ones would be a
  // request that fails on size and tells you nothing more, because what this
  // asks about is palette, light and framing rather than anything you would
  // need to zoom in to see.
  const images = refs
    .map(faceOf)
    .filter((i): i is PromptImage => !!i)
    .slice(0, 12)

  const kids = s.relationships
    .filter((r) => r.type === 'part_of' && r.to_id === groupId)
    .map((r) => s.thoughts.find((t) => t.id === r.from_id))
    .filter((t): t is Thought => !!t && t.status === 'open')
  const alongside = kids.filter((t) => !faceOf(t)).map(name).slice(0, 30)
  const known = [subject, ...kids].flatMap((t) => (ex(t).answers as string[] | undefined) ?? []).slice(-20)

  try {
    const { output, runId } = await runAction<LookOutput>('look', {
      name: name(subject),
      images,
      alongside,
      known,
    })
    return applyLook(groupId, output, runId)
  } catch (e) {
    const why = (e as Error)?.message
    return { kind: 'failed', why: why && why.length < 90 ? why.toLowerCase() : undefined }
  }
}

/** Fold a reading into the graph, as something readable rather than a toast. */
export function applyLook(groupId: string, output: LookOutput, runId: string | null): LookResult {
  const s = useGraph.getState()
  const subject = s.thoughts.find((t) => t.id === groupId)
  if (!subject) return { kind: 'failed' }

  const read = output.read.trim()
  const patch: Partial<Thought> = { summary: read.slice(0, 280) }
  // A wall it has read is a name it has earned. Only when theirs is a
  // placeholder — renaming something a person deliberately called "SS27" out
  // from under them is the app overreaching.
  const theirs = name(subject).trim()
  const better = output.name?.trim()
  if (better && placeholder(theirs)) {
    patch.title = better
    patch.raw_content = better
  }
  s.updateThought(subject.id, {
    ...patch,
    extra: { ...(subject.extra ?? {}), looked_at: new Date().toISOString() },
  })

  s.addArtifact({
    id: crypto.randomUUID(),
    thought_id: subject.id,
    title: read || `What ${theirs} is about`,
    content_md: lookMarkdown(output, theirs),
    sources: [],
    agent_run_id: runId,
  })

  void learnFacts(output.learned, `looking at the references in ${theirs}`, runId)
  if (runId) void markApplied(runId)
  return { kind: 'read', note: output.note, output }
}

/** A name nobody chose — worth replacing with one the pictures earned. */
function placeholder(s: string): boolean {
  const t = s.trim().toLowerCase()
  return !t || t === 'together' || t === 'photo' || t === 'photos' || /^untitled/.test(t)
}

/** The reading, as something a person can read later — and `rain` can use. */
export function lookMarkdown(o: LookOutput, groupName: string): string {
  const lines = [`# ${o.read}`, '']
  if (o.threads.length) {
    lines.push('## What runs through it', '')
    for (const t of o.threads) lines.push(`- **${t.what}**${t.where ? ` — ${t.where}` : ''}`)
    lines.push('')
  }
  if (o.missing.length) {
    // Its own heading, because it is the half of the answer you cannot get by
    // looking at the wall yourself.
    lines.push('## What is not here', '')
    for (const m of o.missing) lines.push(`- ${m}`)
    lines.push('')
  }
  lines.push(`_Read from the references in ${groupName}._`)
  return lines.join('\n').trimEnd() + '\n'
}
