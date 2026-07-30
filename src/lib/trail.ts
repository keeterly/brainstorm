// What the app has done to your thinking lately.
//
// Everything here announces itself once and disappears: a pool formed, six
// drops gathered, the map moved, the agent came back. Four seconds later there
// is no record that any of it happened — so if you looked away, or came back
// tomorrow and found the sky rearranged, there was nothing to ask.
//
// An app that reorganises your thinking on your behalf owes you a record of
// having done so. This is that record: short, plain, and local to the device
// that saw it happen, because it is a log of what you witnessed rather than
// data about you. It is deliberately not a table — nothing else needs to read
// it, it must never fail a write, and it should not survive being cleared.

const KEY = 'brainstorm.trail.v1'
const KEEP = 40

export interface TrailEntry {
  /** what happened, in the same words the sky used at the time */
  what: string
  /** what it happened to, if it was one thing */
  subject?: string
  at: number
}

let cache: TrailEntry[] | null = null

function load(): TrailEntry[] {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    cache = Array.isArray(parsed)
      ? parsed.filter((e): e is TrailEntry => !!e && typeof e.what === 'string' && typeof e.at === 'number')
      : []
  } catch {
    // a corrupt log is not worth a broken app
    cache = []
  }
  return cache
}

/** Note that something happened. Never throws — a full or blocked store must
 *  not take down the thing it was recording. */
export function noteTrail(what: string, subject?: string): void {
  const w = what.trim()
  if (!w) return
  const list = load()
  const now = Date.now()
  // The same thing twice in a row is one thing. Repainting, retrying and
  // undo-then-redo all produce runs of identical lines, and a log made mostly
  // of duplicates is one nobody reads.
  const last = list[0]
  if (last && last.what === w && last.subject === subject && now - last.at < 60000) {
    last.at = now
  } else {
    list.unshift({ what: w, subject, at: now })
  }
  cache = list.slice(0, KEEP)
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* out of room, or private mode: the log is the least important thing here */
  }
}

/** What happened, most recent first. */
export function readTrail(): TrailEntry[] {
  return [...load()]
}

export function clearTrail(): void {
  cache = []
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

/** Only for tests, which need to forget what a previous test wrote. */
export function _resetTrailCache(): void {
  cache = null
}

/** "just now", "12 minutes ago", "yesterday" — how a person says it. */
export function trailWhen(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return m === 1 ? 'a minute ago' : `${m} minutes ago`
  const h = Math.round(m / 60)
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  const w = Math.round(d / 7)
  return w === 1 ? 'last week' : `${w} weeks ago`
}
