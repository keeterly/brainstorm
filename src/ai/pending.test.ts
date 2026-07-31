import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STALE_AFTER_MS, __resetClaimed, awaitRun, markApplied, pendingRuns, subjectOf } from './pending'

// One fluent chain per call, so a test can say what the query came back with
// and then assert on how the query was built.
const calls: { table: string; select?: string; filters: Record<string, unknown>; update?: unknown }[] = []
let reply: { data: unknown; error?: unknown } = { data: [] }

function chain(table: string) {
  const rec: (typeof calls)[number] = { table, filters: {} }
  calls.push(rec)
  const self: Record<string, unknown> = {}
  for (const k of ['select', 'is', 'gte', 'order', 'limit', 'eq', 'update']) {
    self[k] = (a: unknown, b?: unknown) => {
      if (k === 'select') rec.select = a as string
      else if (k === 'update') rec.update = a
      else rec.filters[`${k}:${String(a)}`] = b === undefined ? true : b
      return self
    }
  }
  self.maybeSingle = () => Promise.resolve(reply)
  // awaiting the chain itself is how a list query resolves
  self.then = (res: (v: unknown) => unknown) => Promise.resolve(reply).then(res)
  return self
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => chain(t) } }))

beforeEach(() => {
  calls.length = 0
  reply = { data: [] }
})

const row = (o: Record<string, unknown> = {}) => ({
  id: 'r1',
  action: 'deepen',
  status: 'succeeded',
  input: { subject: { id: 'th1', title: 'Get an SBA loan' } },
  output: { note: 'done' },
  error: null,
  created_at: new Date().toISOString(),
  ...o,
})

describe('what the agent still owes you', () => {
  it('asks only for runs nobody has claimed, and only recent ones', async () => {
    await pendingRuns()
    const q = calls[0]
    expect(q.table).toBe('agent_runs')
    expect(q.filters['is:applied_at']).toBe(null)
    const since = new Date(q.filters['gte:created_at'] as string).getTime()
    expect(Date.now() - since).toBeGreaterThan(STALE_AFTER_MS - 5000)
    expect(Date.now() - since).toBeLessThan(STALE_AFTER_MS + 5000)
  })

  it('hands back what is still running and what finished unwatched', async () => {
    reply = { data: [row({ id: 'a', status: 'running' }), row({ id: 'b', status: 'succeeded' })] }
    const runs = await pendingRuns()
    expect(runs.map((r) => `${r.id}:${r.status}`)).toEqual(['a:running', 'b:succeeded'])
  })

  it('does not offer up a run that already failed — there is nothing to land', async () => {
    reply = { data: [row({ status: 'failed' }), row({ id: 'c', status: 'invalid_output' })] }
    expect(await pendingRuns()).toEqual([])
  })

  it('says nothing is owed rather than throwing, when the query cannot be made', async () => {
    reply = { data: null, error: { message: 'offline' } }
    expect(await pendingRuns()).toEqual([])
  })

  it('finds the thought a run was about, and admits when it cannot', async () => {
    reply = { data: [row()] }
    const [run] = await pendingRuns()
    expect(subjectOf(run)).toBe('th1')
    expect(subjectOf({ ...run, input: null })).toBeNull()
    expect(subjectOf({ ...run, input: { text: 'no subject here' } })).toBeNull()
  })
})

describe('claiming one', () => {
  it('stamps it, so a second device does not land the same work twice', async () => {
    await markApplied('r9')
    const q = calls[0]
    expect(q.table).toBe('agent_runs')
    expect((q.update as { applied_at: string }).applied_at).toBeTruthy()
    expect(q.filters['eq:id']).toBe('r9')
  })

  it('does not hand the same run back to this device, stamp or no stamp', async () => {
    // The stamp is the server's answer, and the server may not have heard yet:
    // the PATCH used to go out as a bare `void` with no retry, so one dropped
    // connection at that moment left `applied_at` null while the output was
    // already folded into the graph — and the next load applied it again.
    // Duplicate tasks, duplicate briefs, duplicate memories, no telling which.
    __resetClaimed()
    await markApplied('r1')
    reply = { data: [row()] } // the server still says nobody has claimed it
    expect(await pendingRuns()).toHaveLength(0)
  })
})

describe('taking over the watch', () => {
  it('answers with the output once the run lands', async () => {
    vi.useFakeTimers()
    reply = { data: { status: 'succeeded', output: { note: 'here' }, error: null } }
    const p = awaitRun('r1')
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p).toEqual({ ok: true, output: { note: 'here' } })
    vi.useRealTimers()
  })

  it('gives up on a run that started long enough ago to be dead', async () => {
    vi.useFakeTimers()
    reply = { data: { status: 'running', output: null, error: null } }
    const p = awaitRun('r1', { startedAt: Date.now() - STALE_AFTER_MS - 1 })
    await vi.advanceTimersByTimeAsync(100)
    expect(await p).toEqual({ ok: false, why: 'it never came back' })
    vi.useRealTimers()
  })

  it('passes on the reason when the agent failed, in the reader’s words', async () => {
    // the row keeps the engine's own account of it; what comes back here is
    // what goes on screen, and "output failed schema validation after repair
    // retry" went on screen once already
    vi.useFakeTimers()
    reply = { data: { status: 'failed', output: null, error: 'rate limited' } }
    const p = awaitRun('r1')
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p).toEqual({ ok: false, why: 'the thinking engine is busy right now — give it a minute' })
    vi.useRealTimers()
  })

  it('never hands the schema error to the person holding the phone', async () => {
    vi.useFakeTimers()
    reply = {
      data: {
        status: 'invalid_output',
        output: null,
        error: 'Output failed validation after a repair retry — steps: Array must contain at most 10 element(s)',
      },
    }
    const p = awaitRun('r1')
    await vi.advanceTimersByTimeAsync(3000)
    const res = (await p) as { ok: false; why: string }
    expect(res.why).not.toMatch(/schema|validation|Array/i)
    expect(res.why).toMatch(/one more go/)
    vi.useRealTimers()
  })

  it('stops when told to, rather than polling a page that is gone', async () => {
    vi.useFakeTimers()
    const ac = new AbortController()
    ac.abort()
    const p = awaitRun('r1', { signal: ac.signal })
    await vi.advanceTimersByTimeAsync(10)
    expect(await p).toEqual({ ok: false, why: 'cancelled' })
    vi.useRealTimers()
  })
})
