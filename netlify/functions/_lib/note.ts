// What to put on a lock screen.
//
// A notification is read in one glance, sideways, by someone doing something
// else. "Brainstorm — a task completed" is worth nothing: it tells you a thing
// happened without telling you whether to care. So the title is what you asked
// about and the body is what came back, in numbers, and tapping it lands you on
// the brief rather than on the front door.

export interface Note {
  title: string
  body: string
  url?: string
  tag?: string
}

interface DeepenLike {
  read?: string
  steps?: unknown[]
  found?: unknown[]
  sources?: unknown[]
  note?: string
}

interface WithSubject {
  subject?: { id?: string; title?: string }
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/**
 * The notification for a finished run, or null if this action is not something
 * a person would want waking their phone.
 */
export function runNote(action: string, input: unknown, output: unknown, runId: string): Note | null {
  if (action !== 'deepen') return null
  const out = (output ?? {}) as DeepenLike
  const subject = ((input ?? {}) as WithSubject).subject
  const id = typeof subject?.id === 'string' ? subject.id : null

  const steps = Array.isArray(out.steps) ? out.steps.length : 0
  const found = Array.isArray(out.found) ? out.found.length : 0
  const sources = Array.isArray(out.sources) ? out.sources.length : 0
  const bits = [
    steps ? plural(steps, 'step') : '',
    found ? `${found} found` : '',
    sources ? plural(sources, 'source') : '',
  ].filter(Boolean)

  return {
    // what you pointed it at, so you know which of them this is
    title: clip(subject?.title?.trim() || out.read?.trim() || 'Brainstorm', 60),
    body: clip(out.note?.trim() || bits.join(' · ') || 'It came back.', 140),
    // straight to what it wrote, not to the front door
    url: id ? `/?brief=${encodeURIComponent(id)}` : '/',
    tag: `run-${runId}`,
  }
}
