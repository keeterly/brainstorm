// Client for the AI Action Engine (/api/ai). Buffered actions return JSON;
// streamed actions emit SSE events which we surface via onDelta.
import { supabase } from '@/lib/supabase'
import { useGraph } from '@/store/graph'

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

export async function runAction<O = unknown>(
  action: string,
  input: unknown,
  opts: RunOptions = {},
): Promise<{ runId: string | null; output: O }> {
  const auth = await authHeader()
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
  if (!res.ok) throw new AIError(body.error ?? `HTTP ${res.status}`, body.runId ?? null, res.status)
  return { runId: body.runId ?? null, output: body.output as O }
}
