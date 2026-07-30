// Client for the AI Action Engine (/api/ai). Buffered actions return JSON;
// streamed actions emit SSE events which we surface via onDelta; and the ones
// too slow to fit in a request run in the background and are watched.
import { supabase } from '@/lib/supabase'
import { useGraph } from '@/store/graph'
import { ACTION_REGISTRY } from '@shared/ai/registry'
import { DEMO, DEMO_OUTPUT } from '@/lib/demo'
import { whyItFailed } from './why'

/** Long enough for real research, short enough to give up eventually. */
const BG_GIVE_UP_MS = 4 * 60 * 1000

export class AIError extends Error {
  constructor(
    message: string,
    public runId: string | null = null,
    public status: number | null = null,
  ) {
    super(message)
  }
}

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AIError('Not signed in')
  return `Bearer ${token}`
}

function buildCtx() {
  const memory = useGraph
    .getState()
    .memories.map((m) => m.content)
    .slice(0, 60)
  return { tzOffsetMin: -new Date().getTimezoneOffset(), memory }
}

export interface RunOptions {
  onDelta?: (chunk: string) => void
  signal?: AbortSignal
}

/**
 * Actions that cannot finish inside a request.
 *
 * The work happens in a background function, which has no way to answer, so
 * the client names the run up front and then watches that row. Reading it back
 * is safe: agent_runs is the user's own under RLS.
 */
async function runInBackground<O>(
  action: string,
  input: unknown,
  auth: string,
  opts: RunOptions,
): Promise<{ runId: string | null; output: O }> {
  const runId = crypto.randomUUID()
  const res = await fetch('/.netlify/functions/ai-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ action, input, runId, ctx: buildCtx() }),
    signal: opts.signal,
  })
  // 202 is the happy path here; anything else was refused before it began
  if (res.status !== 202 && !res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new AIError(body.error ?? `HTTP ${res.status}`, runId, res.status)
  }

  const started = Date.now()
  let wait = 1500
  while (Date.now() - started < BG_GIVE_UP_MS) {
    await new Promise((r) => setTimeout(r, wait))
    // Capped at three seconds, not six. The work finishes on a server and the
    // page finds out on its next look, so half the cap is dead time added to
    // every background run — six seconds of a phone showing "still out there"
    // after the answer was already written down. The extra polls are one
    // indexed row each.
    wait = Math.min(wait * 1.4, 3000)
    if (opts.signal?.aborted) throw new AIError('Cancelled', runId)
    const { data } = await supabase
      .from('agent_runs')
      .select('status,output,error')
      .eq('id', runId)
      .maybeSingle()
    if (!data || data.status === 'running') continue
    if (data.status === 'succeeded') return { runId, output: data.output as O }
    throw new AIError(whyItFailed(data.status as string, (data.error as string) ?? null), runId)
  }
  throw new AIError('Still working — it may land on its own', runId)
}

export async function runAction<O = unknown>(
  action: string,
  input: unknown,
  opts: RunOptions = {},
): Promise<{ runId: string | null; output: O }> {
  // The demo has no key and no server. Where there is something canned to say,
  // it says it after a believable pause, so the demo shows the app working
  // rather than a row of buttons that fail.
  if (DEMO && DEMO_OUTPUT[action]) {
    await new Promise((r) => setTimeout(r, 1400))
    return { runId: null, output: DEMO_OUTPUT[action] as O }
  }
  const auth = await authHeader()
  if (ACTION_REGISTRY[action]?.background) return runInBackground<O>(action, input, auth, opts)
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ action, input, ctx: buildCtx() }),
    signal: opts.signal,
  })

  const ctype = res.headers.get('content-type') || ''

  if (ctype.includes('text/event-stream') && res.body) {
    // Streamed action: read SSE until a result or error event.
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let result: { runId: string | null; output: O } | null = null
    let errMsg: string | null = null
    let errRun: string | null = null
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        let ev: { type?: string; chunk?: string; runId?: string; output?: O; message?: string }
        try {
          ev = JSON.parse(payload)
        } catch {
          continue
        }
        if (ev.type === 'delta' && ev.chunk) opts.onDelta?.(ev.chunk)
        if (ev.type === 'result') result = { runId: ev.runId ?? null, output: ev.output as O }
        if (ev.type === 'error') {
          errMsg = ev.message ?? 'AI action failed'
          errRun = ev.runId ?? null
        }
      }
    }
    if (result) return result
    throw new AIError(errMsg ?? 'Stream ended without a result', errRun)
  }

  const body = (await res.json().catch(() => ({}))) as {
    runId?: string
    output?: O
    error?: string
  }
  // 4xx are already precise and addressed to the reader; a 502 is the engine
  // failing, and the reader should not be handed the engine's own words for it
  if (!res.ok) {
    const msg = res.status >= 500 ? whyItFailed(null, body.error ?? null) : (body.error ?? `HTTP ${res.status}`)
    throw new AIError(msg, body.runId ?? null, res.status)
  }
  return { runId: body.runId ?? null, output: body.output as O }
}
