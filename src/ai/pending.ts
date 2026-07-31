// Work the agent still owes you.
//
// ⚡ runs in a background function for the best part of a minute. The function
// has no way to answer the page, so the page names the run and watches the row.
// Lock the phone, switch apps for long enough that the tab is discarded, or
// simply pull to refresh, and that watcher is gone — while the work carries on
// and finishes and writes its result, and nobody ever comes for it. You waited
// a minute, came back, and the sky was exactly as you left it.
//
// This is the coming back for it. On load it asks what is unfinished or
// finished-and-unclaimed, hands each one to whoever knows how to apply it, and
// marks it claimed so a second device does not apply it twice.
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { supabase } from '@/lib/supabase'
import { write } from '@/lib/outbox'
import { whyItFailed } from './why'

/**
 * Runs this device has already folded in.
 *
 * `applied_at` is the real answer and it lives on the server, but the PATCH
 * that sets it can fail — and it used to be sent as a bare `void` with no
 * retry, so a dropped connection at that exact moment left the row saying
 * "nobody has claimed this" while its output was already in your graph. The
 * next load picked it up and applied it a second time: duplicate tasks,
 * duplicate briefs, duplicate memories, no way to tell which was which.
 *
 * So two locks rather than one. The write goes through the outbox, which does
 * not give up; and until it lands, this local list is enough on its own to
 * stop the same device doing the work twice.
 */
const CLAIMED_KEY = 'brainstorm-applied-runs-v1'
/** Enough to cover any plausible backlog; runs older than 15 minutes are gone anyway. */
const CLAIMED_MAX = 200
let claimed: string[] | null = null

async function claimedIds(): Promise<string[]> {
  if (claimed) return claimed
  try {
    claimed = ((await idbGet(CLAIMED_KEY)) as string[] | undefined) ?? []
  } catch {
    claimed = [] // no IndexedDB — the in-memory list still covers this session
  }
  return claimed
}

export interface PendingRun {
  id: string
  action: string
  status: 'running' | 'succeeded' | 'failed' | 'invalid_output'
  /** what it was asked, which is where the subject of the work is named */
  input: Record<string, unknown> | null
  output: unknown
  error: string | null
  createdAt: number
}

/**
 * How long a run is still worth waiting for.
 *
 * Past this it is not coming: the background function is long dead, and a row
 * still marked `running` is a crash, not a job. Picking those up on every load
 * would mean a glowing drop forever.
 */
export const STALE_AFTER_MS = 15 * 60 * 1000

/** Everything the agent has not yet handed back, newest first. */
export async function pendingRuns(): Promise<PendingRun[]> {
  const since = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  const { data, error } = await supabase
    .from('agent_runs')
    .select('id,action,status,input,output,error,created_at')
    .is('applied_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(8)
  if (error || !data) return []
  const mine = await claimedIds()
  return data
    .filter((r) => r.status !== 'failed' && r.status !== 'invalid_output')
    .filter((r) => !mine.includes(r.id as string))
    .map((r) => ({
      id: r.id as string,
      action: r.action as string,
      status: r.status as PendingRun['status'],
      input: (r.input ?? null) as Record<string, unknown> | null,
      output: r.output,
      error: (r.error ?? null) as string | null,
      createdAt: new Date(r.created_at as string).getTime(),
    }))
}

/** Say this one has been dealt with, so nothing deals with it again. */
export async function markApplied(runId: string): Promise<void> {
  const mine = await claimedIds()
  if (!mine.includes(runId)) {
    mine.push(runId)
    if (mine.length > CLAIMED_MAX) mine.splice(0, mine.length - CLAIMED_MAX)
    try {
      await idbSet(CLAIMED_KEY, mine)
    } catch {
      /* memory-only fallback */
    }
  }
  await write({
    table: 'agent_runs',
    op: 'update',
    pk: { id: runId },
    payload: { applied_at: new Date().toISOString() },
  })
}

/** Tests only — the claim list is process-wide by design. */
export function __resetClaimed(): void {
  claimed = null
}

/**
 * Watch a run that is still going, and answer when it lands.
 *
 * The same polling the original caller was doing, with the same backoff — this
 * is simply a second chance at it from a page that did not start the work.
 */
export async function awaitRun(
  runId: string,
  opts: { signal?: AbortSignal; startedAt?: number } = {},
): Promise<{ ok: true; output: unknown } | { ok: false; why: string }> {
  const deadline = (opts.startedAt ?? Date.now()) + STALE_AFTER_MS
  let wait = 2000
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) return { ok: false, why: 'cancelled' }
    await new Promise((r) => setTimeout(r, wait))
    wait = Math.min(wait * 1.4, 3000)
    const { data } = await supabase.from('agent_runs').select('status,output,error').eq('id', runId).maybeSingle()
    if (!data || data.status === 'running') continue
    if (data.status === 'succeeded') return { ok: true, output: data.output }
    // the row's own words are for the record; this is what a person is told
    return { ok: false, why: whyItFailed(data.status as string, (data.error as string) ?? null) }
  }
  return { ok: false, why: 'it never came back' }
}

/** The thought a run was about, dug out of what it was asked. */
export function subjectOf(run: PendingRun): string | null {
  const subject = run.input?.subject as { id?: string } | undefined
  return typeof subject?.id === 'string' ? subject.id : null
}
