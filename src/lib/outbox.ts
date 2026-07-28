// Offline write queue. Mutations apply to the in-memory store immediately;
// the network write happens here — straight through when online, queued in
// IndexedDB and replayed on reconnect when not.
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
}

const KEY = 'brainstorm-outbox-v1'
let queue: OutboxEntry[] = []
let loaded = false
let flushing = false
const listeners = new Set<(pending: number) => void>()

export function onOutboxChange(fn: (pending: number) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() {
  listeners.forEach((fn) => fn(queue.length))
}

async function load() {
  if (loaded) return
  loaded = true
  try {
    queue = ((await idbGet(KEY)) as OutboxEntry[] | undefined) ?? []
  } catch {
    queue = [] // no IndexedDB (private mode, tests) — queue lives in memory only
  }
  notify()
}
async function persist() {
  try {
    await idbSet(KEY, queue)
  } catch {
    /* memory-only fallback */
  }
  notify()
}

async function execute(e: OutboxEntry): Promise<boolean> {
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
    if (!error) return true
    // Permanent errors (constraint, RLS) will never succeed — drop, don't loop.
    const transient = /fetch|network|timeout|503|502|failed/i.test(error.message)
    if (!transient) {
      console.warn('outbox: dropping permanent failure', e.table, e.op, error.message)
      return true
    }
    return false
  } catch {
    return false // network error — keep queued
  }
}

/** Write-through: try now; queue on failure. */
export async function write(entry: Omit<OutboxEntry, 'id' | 'queuedAt'>): Promise<void> {
  await load()
  const full: OutboxEntry = {
    ...entry,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  }
  if (queue.length === 0 && navigator.onLine) {
    const ok = await execute(full)
    if (ok) return
  }
  queue.push(full)
  await persist()
}

/** Replay everything queued, in order. Stops at the first failure. */
export async function flush(): Promise<void> {
  await load()
  if (flushing || !queue.length) return
  flushing = true
  try {
    while (queue.length) {
      const ok = await execute(queue[0])
      if (!ok) break
      queue.shift()
      await persist()
    }
  } finally {
    flushing = false
  }
}

export async function pendingCount(): Promise<number> {
  await load()
  return queue.length
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush()
  })
}
