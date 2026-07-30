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
import { supabase } from '@/lib/supabase'
import { whyItFailed } from './why'

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
  return data
    .filter((r) => r.status !== 'failed' && r.status !== 'invalid_output')
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

/** Say this one has been dealt with, so no other device deals with it again. */
export async function markApplied(runId: string): Promise<void> {
  await supabase.from('agent_runs').update({ applied_at: new Date().toISOString() }).eq('id', runId)
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
