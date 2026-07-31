import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetOutbox,
  discardFailed,
  failedWrites,
  flush,
  pendingCount,
  retryFailed,
  verdictFor,
  write,
} from './outbox'

// Every call the outbox makes, and what the server said back to it. `replies`
// is drained in order so a test can say "refuse, refuse, then take it".
const sent: { table: string; op: string; payload?: unknown; pk: Record<string, unknown> }[] = []
let replies: ({ code?: string; message?: string } | null | Error)[] = []

function answer() {
  const r = replies.length > 1 ? replies.shift() : replies[0]
  if (r instanceof Error) throw r
  return Promise.resolve({ error: r ?? null })
}

function chain(table: string) {
  const rec = { table, op: '', payload: undefined as unknown, pk: {} as Record<string, unknown> }
  const self: Record<string, unknown> = {}
  for (const k of ['insert', 'upsert', 'update', 'delete']) {
    self[k] = (a?: unknown) => {
      rec.op = k
      rec.payload = a
      sent.push(rec)
      return self
    }
  }
  self.eq = (c: string, v: unknown) => {
    rec.pk[c] = v
    return self
  }
  self.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    try {
      return answer().then(res, rej)
    } catch (e) {
      return rej ? Promise.resolve(rej(e)) : Promise.reject(e)
    }
  }
  return self
}

vi.mock('./supabase', () => ({ supabase: { from: (t: string) => chain(t) } }))
// no IndexedDB in the test environment; the queue lives in memory, which is
// exactly the fallback the real thing takes in private browsing
vi.mock('idb-keyval', () => ({
  get: () => Promise.reject(new Error('no idb')),
  set: () => Promise.reject(new Error('no idb')),
}))

const row = () => ({ table: 'thoughts', op: 'insert' as const, payload: { id: 't1' } })

beforeEach(() => {
  __resetOutbox()
  sent.length = 0
  replies = [null]
  vi.useFakeTimers()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

describe('what the server said, and what that means', () => {
  it('takes silence for success', () => {
    expect(verdictFor(null)).toBe('done')
  })

  it('counts a row that is already there as done, not as a failure', () => {
    // replaying an insert that landed just before the connection dropped is
    // the commonest duplicate there is, and the row existing is the whole ask
    expect(verdictFor({ code: '23505' })).toBe('done')
  })

  it('gives up only on payloads no amount of waiting will fix', () => {
    expect(verdictFor({ code: '23514' })).toBe('dead') // check constraint
    expect(verdictFor({ code: '42703' })).toBe('dead') // no such column
    expect(verdictFor({ code: '23503' })).toBe('dead') // parent never landed
  })

  it('keeps trying the two that look permanent and are not', () => {
    // This is the bug that used to delete your work: come back online, the
    // queue flushes a moment before the token refreshes, everything 401s.
    expect(verdictFor({ code: 'PGRST301' })).toBe('retry') // JWT expired
    expect(verdictFor({ code: '42501' })).toBe('retry') // RLS refused it
  })

  it('retries anything it has never seen before', () => {
    // the old code did the opposite: unrecognised meant "drop it"
    expect(verdictFor({ code: 'WHO-KNOWS' })).toBe('retry')
    expect(verdictFor({})).toBe('retry')
  })
})

describe('the offline write queue', () => {
  it('keeps a refused write instead of throwing it away', async () => {
    replies = [{ code: '42501', message: 'row-level security' }]
    await write(row())
    expect(await pendingCount()).toBe(1)
    expect(await failedWrites()).toHaveLength(0)
  })

  it('comes back on its own while you stay online', async () => {
    // Nothing used to do this. `flush` ran on `online`, on `visibilitychange`
    // and on hydrate — so one failure parked every write after it until you
    // switched apps and came back, which could be days on an installed PWA.
    replies = [{ code: '42501' }, null]
    await write(row())
    expect(await pendingCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await pendingCount()).toBe(0)
  })

  it('parks a poison write and lets everything behind it through', async () => {
    replies = [{ code: '23514', message: 'violates check constraint' }]
    await write(row())
    replies = [null]
    await write({ table: 'thoughts', op: 'insert', payload: { id: 't2' } })
    await flush()
    expect(await pendingCount()).toBe(0)
    const dead = await failedWrites()
    expect(dead).toHaveLength(1)
    expect(dead[0].why).toContain('check constraint')
  })

  it('gives up on a write the server keeps refusing, rather than blocking forever', async () => {
    replies = [{ code: '42501', message: 'no' }]
    await write(row())
    // six refusals is the bound; each retry is scheduled further out
    for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(70_000)
    expect(await pendingCount()).toBe(0)
    expect(await failedWrites()).toHaveLength(1)
  })

  it('does not spend a life on being offline', async () => {
    // a socket that never answers costs the entry nothing — a week in a
    // basement must not park a single write
    replies = [new Error('Failed to fetch')]
    await write(row())
    for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(70_000)
    expect(await failedWrites()).toHaveLength(0)
    expect(await pendingCount()).toBe(1)
  })

  it('holds the line on order for an ordinary failure', async () => {
    // a thought's insert has to land before its update; a retryable failure
    // stops the run rather than skipping ahead
    replies = [{ code: '42501' }]
    await write(row())
    await write({ table: 'thoughts', op: 'update', pk: { id: 't1' }, payload: { title: 'x' } })
    sent.length = 0
    await flush()
    expect(sent).toHaveLength(1)
    expect(sent[0].op).toBe('insert')
  })

  it('does not go to the network at all when the phone says there is none', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    replies = [null]
    await write(row())
    expect(sent).toHaveLength(0)
    expect(await pendingCount()).toBe(1)
  })

  it('can be asked again for what it gave up on', async () => {
    replies = [{ code: '23514' }]
    await write(row())
    await flush()
    expect(await failedWrites()).toHaveLength(1)
    replies = [null]
    await retryFailed()
    expect(await failedWrites()).toHaveLength(0)
    expect(await pendingCount()).toBe(0)
  })

  it('can be told to stop asking', async () => {
    replies = [{ code: '23514' }]
    await write(row())
    await flush()
    await discardFailed()
    expect(await failedWrites()).toHaveLength(0)
  })
})
