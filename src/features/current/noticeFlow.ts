// The app's read on you, across everything at once.
//
// Cached in your profile rather than re-run on every glance: this is a slow,
// expensive look at the whole sky, and it should feel like something that
// settles rather than something that flickers. It goes stale on its own when
// enough has changed, and you can always ask for it again.
import { useGraph } from '@/store/graph'
import { runAction } from '@/ai/client'
import type { NoticeOutput } from '@shared/ai/actions/notice'
import { learnFacts } from '@/ai/memoryFlow'
import { isQuestion } from '@/domain/question'
import type { Thought } from '@/domain/types'

export interface Noticed extends NoticeOutput {
  /** when it looked, and at how much — so it can tell it has gone stale */
  atISO: string
  sawCount: number
}

const KEY = 'noticed'
/** enough has changed to be worth another look */
const DRIFT = 4
const AGE_MS = 20 * 60 * 60 * 1000

export function readNoticed(): Noticed | null {
  const raw = useGraph.getState().profile?.settings?.[KEY]
  return raw && typeof raw === 'object' ? (raw as Noticed) : null
}

/** Has the sky moved on enough that the old read no longer describes it? */
export function noticedIsStale(n: Noticed | null, openCount: number): boolean {
  if (!n) return true
  if (Math.abs(openCount - n.sawCount) >= DRIFT) return true
  return Date.now() - new Date(n.atISO).getTime() > AGE_MS
}

/**
 * Take one of its suggestions, into the graph.
 *
 * Three of `notice`'s four output fields were write-only. Its suggestions are
 * "moves worth making now — a thing to do, a connection they have not drawn, a
 * question worth answering" and there was no button on any of them: an agent
 * that says what you should do and cannot help you do it, on the surface you
 * look at every day. Every other action in this app lands its output as real
 * thoughts; this one wrote prose into a private blob.
 *
 * Taking it also removes it from the read, so the same suggestion is not still
 * sitting there being suggested after you have acted on it.
 */
export function keepSuggestion(i: number): Thought | null {
  const s = useGraph.getState()
  const n = readNoticed()
  const g = n?.suggestions[i]
  if (!n || !g) return null
  const t = s.addThought({
    raw_content: g.title,
    title: g.title,
    summary: g.why || null,
    // it decides what kind of thing it is the same way the rest of the app
    // does, rather than by having its own opinion
    type: isQuestion(g.title) ? 'question' : 'action',
  })
  // the thought it came off, if it came off one — a suggestion about the SS27
  // campaign belongs in the SS27 campaign
  if (g.from && s.thoughts.some((x) => x.id === g.from && x.status === 'open')) {
    s.addRelationship(t.id, g.from, 'part_of', 'ai')
  }
  s.updateProfileSettings({
    [KEY]: { ...n, suggestions: n.suggestions.filter((_, j) => j !== i) },
  })
  return t
}

export async function lookAgain(): Promise<Noticed | null> {
  const s = useGraph.getState()
  const open = s.thoughts.filter((t) => t.status === 'open')
  if (!open.length) return null

  const kids = new Map<string, string[]>()
  for (const r of s.relationships) {
    if (r.type !== 'part_of') continue
    const child = s.thoughts.find((t) => t.id === r.from_id)
    if (!child) continue
    if (!kids.has(r.to_id)) kids.set(r.to_id, [])
    ;(kids.get(r.to_id) as string[]).push(child.title || child.raw_content.slice(0, 160))
  }
  const pools = [...kids.entries()]
    .map(([id, members]) => {
      const parent = s.thoughts.find((t) => t.id === id)
      return parent ? { name: parent.title || parent.raw_content.slice(0, 80), members: members.slice(0, 20) } : null
    })
    .filter((p): p is { name: string; members: string[] } => !!p)
    .slice(0, 40)

  const recentlyDone = s.thoughts
    .filter((t) => t.status === 'done' && t.completed_at)
    .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)))
    .slice(0, 20)
    .map((t) => t.title || t.raw_content.slice(0, 200))

  try {
    const { output } = await runAction<NoticeOutput>('notice', {
      thoughts: open.slice(0, 200).map((t) => ({
        id: t.id,
        title: t.title || t.raw_content.slice(0, 300),
        type: t.type,
        summary: t.summary,
        due: t.due_date,
      })),
      pools,
      recentlyDone,
    })
    // it only points at things that exist
    const alive = new Set(open.map((t) => t.id))
    const noticed: Noticed = {
      ...output,
      pressing: output.pressing.filter((p) => alive.has(p.id)).slice(0, 3),
      suggestions: output.suggestions.map((g) => ({ ...g, from: g.from && alive.has(g.from) ? g.from : undefined })),
      atISO: new Date().toISOString(),
      sawCount: open.length,
    }
    // what it learned about you outlives this particular read
    void learnFacts(output.learned, 'looking over what is open')
    s.updateProfileSettings({ [KEY]: noticed })
    return noticed
  } catch {
    return null
  }
}
