// Offline write queue. Mutations apply to the in-memory store immediately;
// the network write happens here — straight through when online, queued in
// IndexedDB and replayed on reconnect when not.
//
// The rule it now keeps, which it did not keep before: **nothing leaves this
// queue unless the server accepted it or a person was told.** What was here
// tested the error message against `/fetch|network|timeout|503|502|failed/`
// and treated everything else as a success, which is exactly backwards — an
// expired token, an RLS refusal and a check-constraint violation all miss that
// regex, so the commonest real failure (come back online, the queue flushes a
// moment before supabase-js refreshes the token, every row 401s) silently
// deleted every edit you had made offline. The store still showed them, so you
// found out on the next reload, if ever.
//
// So: retry by default, drop only on a class of error that provably cannot
// ever succeed, and park anything hopeless where the app can say so out loud.
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { supabase } from './supabase'

export interface OutboxEntry {
  id: string
  table: string
  op: 'insert' | 'upsert' | 'update' | 'delete'
  /** For update/delete: primary-key filter columns. */
  pk?: Record<string, string>
  /** Row (insert/upsert) or field-level patch (update). */
  payload?: Record<string, unknown>
  queuedAt: string
  /** How many times the *server* has refused it. Network trouble is free. */
  tries?: number
  /** The server's words, kept only on the parked list. */
  why?: string
}

export interface OutboxStatus {
  /** Waiting to go out. These will land. */
  pending: number
  /** Given up on. These will not land unless someone asks again. */
  failed: number
}

const KEY = 'brainstorm-outbox-v1'
const DEAD_KEY = 'brainstorm-outbox-failed-v1'

/**
 * How many server refusals before a write is parked.
 *
 * Only refusals count — being offline, or a socket dying mid-flight, does not,
 * so a week in a basement costs an entry nothing. What this bounds is the
 * other case: one write the server will never take, sitting at the head of the
 * queue, holding up every write behind it forever.
 */
const MAX_TRIES = 6
/** The most parked writes worth keeping around to show and retry. */
const MAX_FAILED = 100

let queue: OutboxEntry[] = []
let failed: OutboxEntry[] = []
let loaded = false
let flushing = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
let backoff = 0
const listeners = new Set<(s: OutboxStatus) => void>()

export function onOutboxChange(fn: (s: OutboxStatus) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() {
  const s: OutboxStatus = { pending: queue.length, failed: failed.length }
  listeners.forEach((fn) => fn(s))
}

async function load() {
  if (loaded) return
  loaded = true
  try {
    queue = ((await idbGet(KEY)) as OutboxEntry[] | undefined) ?? []
    failed = ((await idbGet(DEAD_KEY)) as OutboxEntry[] | undefined) ?? []
  } catch {
    // no IndexedDB (private mode, tests) — the queue lives in memory only
    queue = []
    failed = []
  }
  notify()
}
async function persist() {
  try {
    await idbSet(KEY, queue)
    await idbSet(DEAD_KEY, failed)
  } catch {
    /* memory-only fallback */
  }
  notify()
}

export type Verdict = 'done' | 'retry' | 'dead'

/**
 * Errors that will read the same way on the thousandth attempt as the first.
 *
 * Every one of these says the *payload* is wrong — a column that does not
 * exist, a parent row that never made it, a date that is not a date. No amount
 * of waiting changes any of that, so retrying is just a queue that never
 * drains. Note what is deliberately absent: 42501 (RLS refused it) and
 * PGRST301 (JWT expired), which look permanent and are very often a token that
 * had not refreshed yet.
 */
const DEAD_CODES = new Set([
  '22P02', // invalid text representation — a malformed uuid or timestamp
  '23502', // not-null violation
  '23503', // foreign key — whatever this hangs off never landed
  '23514', // check constraint
  '42703', // undefined column — the client and the table disagree
  '42P01', // undefined table
  'PGRST204', // column not found in the schema cache
])

/** What to do about what the server said. Pure, so it can be tested honestly. */
export function verdictFor(error: { code?: string } | null | undefined): Verdict {
  if (!error) return 'done'
  const code = error.code ?? ''
  // Already there. Replaying an insert that landed just before the connection
  // dropped is the commonest way this happens, and it is a success, not a
  // failure: the row exists, which is all the write ever wanted.
  if (code === '23505') return 'done'
  if (DEAD_CODES.has(code)) return 'dead'
  // Everything else — a stale token, a 502, a socket cut halfway — is worth
  // another go. Being wrong in this direction costs a retry. Being wrong the
  // other way costs the work.
  return 'retry'
}

interface Attempt {
  verdict: Verdict
  /** false when the request never got an answer — costs the entry nothing */
  reached: boolean
  why?: string
}

async function execute(e: OutboxEntry): Promise<Attempt> {
  try {
    let q
    const payload = (e.payload ?? {}) as Record<string, unknown>
    if (e.op === 'insert') q = supabase.from(e.table).insert(payload)
    else if (e.op === 'upsert') q = supabase.from(e.table).upsert(payload)
    else if (e.op === 'update') {
      let u = supabase.from(e.table).update(payload)
      for (const [k, v] of Object.entries(e.pk ?? {})) u = u.eq(k, v)
      q = u
    } else {
      let d = supabase.from(e.table).delete()
      for (const [k, v] of Object.entries(e.pk ?? {})) d = d.eq(k, v)
      q = d
    }
    const { error } = await q
    return { verdict: verdictFor(error), reached: true, why: error?.message }
  } catch (err) {
    // Never got an answer. Free.
    return { verdict: 'retry', reached: false, why: (err as Error)?.message }
  }
}

async function park(e: OutboxEntry, why?: string) {
  failed.push({ ...e, why: why ?? 'the server refused it' })
  if (failed.length > MAX_FAILED) failed.splice(0, failed.length - MAX_FAILED)
}

/**
 * Come back and try again, later and later.
 *
 * Nothing used to do this. `flush` ran on `online`, on `visibilitychange` and
 * on hydrate, and nowhere else — so a single failed write while you stayed
 * online parked every write after it until you switched apps and came back.
 */
function scheduleRetry() {
  if (retryTimer) return
  const wait = Math.min(60_000, 2000 * 2 ** Math.min(backoff, 5))
  backoff++
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flush()
  }, wait)
}

/** Write-through: try now; queue on failure. */
export async function write(entry: Omit<OutboxEntry, 'id' | 'queuedAt'>): Promise<void> {
  if (import.meta.env.VITE_DEMO === '1') return // demo mode: in-memory only
  await load()
  const full: OutboxEntry = {
    ...entry,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  }
  if (queue.length === 0 && navigator.onLine) {
    const r = await execute(full)
    if (r.verdict === 'done') return
    if (r.verdict === 'dead') {
      await park(full, r.why)
      await persist()
      return
    }
    if (r.reached) full.tries = 1
  }
  queue.push(full)
  await persist()
  scheduleRetry()
}

/**
 * Replay everything queued, in order.
 *
 * Order is kept for the ordinary case — a thought's insert must land before
 * its update — so a retryable failure stops the run and comes back later. What
 * does not stop it is a write the server will never take: that one is parked
 * and the queue carries on, because a poison entry that blocks the head of the
 * queue forever is how every edit made after it is quietly lost.
 */
export async function flush(): Promise<void> {
  await load()
  if (flushing || !queue.length) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  flushing = true
  try {
    while (queue.length) {
      const e = queue[0]
      const r = await execute(e)
      if (r.verdict === 'done') {
        queue.shift()
        backoff = 0
        await persist()
        continue
      }
      if (r.verdict === 'dead') {
        queue.shift()
        await park(e, r.why)
        await persist()
        continue
      }
      if (r.reached) {
        e.tries = (e.tries ?? 0) + 1
        if (e.tries >= MAX_TRIES) {
          queue.shift()
          await park(e, r.why)
          await persist()
          continue
        }
      }
      await persist()
      scheduleRetry()
      return
    }
  } finally {
    flushing = false
  }
}

export async function pendingCount(): Promise<number> {
  await load()
  return queue.length
}

/** What was given up on, and what the server said about it. */
export async function failedWrites(): Promise<OutboxEntry[]> {
  await load()
  return failed.slice()
}

/** Ask again for everything that was parked. */
export async function retryFailed(): Promise<void> {
  await load()
  if (!failed.length) return
  for (const e of failed) queue.push({ ...e, tries: 0, why: undefined })
  failed = []
  backoff = 0
  await persist()
  await flush()
}

/** Stop asking. Used when a person has looked at them and said so. */
export async function discardFailed(): Promise<void> {
  await load()
  if (!failed.length) return
  failed = []
  await persist()
}

/** Tests only — the module holds process-wide state by design. */
export function __resetOutbox(): void {
  queue = []
  failed = []
  loaded = false
  flushing = false
  backoff = 0
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    backoff = 0
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    void flush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush()
  })
}
