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

interface AnswerLike {
  asked?: string
  answer?: string
  facts?: unknown[]
  sources?: unknown[]
}

interface DraftLike {
  title?: string
  body?: string
  check?: unknown[]
  blocked?: unknown[]
  done?: boolean
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
  if (action === 'answer') return answerNote(input, output, runId)
  if (action === 'draft') return draftNote(input, output, runId)
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

/**
 * The best notification this app can send.
 *
 * You asked what the fare was, put your phone in your pocket, and a minute
 * later the phone tells you the fare. Not "your research finished" — the
 * number. So the body is the answer's own opening sentence, which the prompt
 * requires to lead with the specific thing, and the whole of it is still there
 * behind the tap.
 */
function answerNote(input: unknown, output: unknown, runId: string): Note {
  const out = (output ?? {}) as AnswerLike
  const subject = ((input ?? {}) as WithSubject).subject
  const id = typeof subject?.id === 'string' ? subject.id : null

  const facts = Array.isArray(out.facts) ? out.facts.length : 0
  const sources = Array.isArray(out.sources) ? out.sources.length : 0
  const fallback =
    [facts ? plural(facts, 'figure') : '', sources ? plural(sources, 'source') : ''].filter(Boolean).join(' · ') ||
    'It came back with an answer.'

  return {
    title: clip(out.asked?.trim() || subject?.title?.trim() || 'Brainstorm', 60),
    body: clip(lead(out.answer) || fallback, 140),
    url: id ? `/?brief=${encodeURIComponent(id)}` : '/',
    tag: `run-${runId}`,
  }
}

/**
 * The one that says a piece of your work now exists.
 *
 * Different from the other two in what it is reporting. Deepen says how much
 * structure arrived; answer says the figure. This says the thing is written —
 * so the title is what it made, and the body opens with the draft's own first
 * sentence, which is as close as a lock screen gets to handing it to you.
 *
 * What is left to do goes on the end when there is any, because "written, two
 * blanks to fill" and "written, done" are different news and only one of them
 * means you can stop thinking about it.
 */
function draftNote(input: unknown, output: unknown, runId: string): Note {
  const out = (output ?? {}) as DraftLike
  const subject = ((input ?? {}) as WithSubject).subject
  const id = typeof subject?.id === 'string' ? subject.id : null

  const check = Array.isArray(out.check) ? out.check.length : 0
  const blocked = Array.isArray(out.blocked) ? out.blocked.length : 0
  const tail = blocked
    ? ` — ${plural(blocked, 'thing')} it could not do`
    : check
      ? ` — ${plural(check, 'thing')} to check`
      : out.done
        ? ' — done'
        : ''

  const opening = lead(plainFirst(out.body))
  return {
    title: clip(out.title?.trim() || subject?.title?.trim() || 'Brainstorm', 60),
    body: clip((opening || 'It wrote it.') + tail, 140),
    url: id ? `/?brief=${encodeURIComponent(id)}` : '/',
    tag: `run-${runId}`,
  }
}

/**
 * The first line of a markdown body that is worth reading sideways.
 *
 * Headings are stepped over rather than stripped. A draft opens with one as
 * often as not, and it is almost always the title again — which is already the
 * line above it on the lock screen. The first *sentence* is the thing that
 * tells you what you now have. A heading is only used when there is nothing
 * else at all, which beats sending "It wrote it."
 *
 * A bullet is kept: the first line of a shortlist is a bullet, and it is the
 * content rather than a label for it.
 */
function plainFirst(md: unknown): string {
  if (typeof md !== 'string') return ''
  let heading = ''
  for (const raw of md.split('\n')) {
    const t = raw.trim()
    if (!t) continue
    const plain = t
      .replace(/^#+\s*/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/[*_`>]/g, '')
      .trim()
    if (!plain || /^[|–—]/.test(plain)) continue
    if (t.startsWith('#')) {
      heading ||= plain
      continue
    }
    return plain
  }
  return heading
}

/**
 * The opening sentence of an answer.
 *
 * Kept in step with firstSentence() on the client — same rule, because the
 * lock screen and the sky should not disagree about what the answer was. A
 * full stop only ends a sentence when what follows it is whitespace and then
 * something that is not a lowercase letter or a digit, so $1,214.50 and AF65.
 * survive intact.
 */
function lead(s: unknown): string {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  if (!t) return ''
  const m = t.match(/^[\s\S]*?[.!?](?=\s+[^a-z0-9]|\s*$)/)
  const one = (m?.[0] ?? t).trim()
  return one.length < 12 ? t : one
}
