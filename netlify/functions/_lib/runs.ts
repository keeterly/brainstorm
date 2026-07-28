// agent_runs bookkeeping — all writes go through Supabase REST *as the user*
// (their JWT is forwarded), so RLS applies and no service-role key exists here.

function rest(path: string): string {
  return `${process.env.SUPABASE_URL}/rest/v1/${path}`
}

function headers(userToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: process.env.SUPABASE_ANON_KEY || '',
    Authorization: `Bearer ${userToken}`,
    Prefer: 'return=representation',
  }
}

export async function insertRun(
  userToken: string,
  row: {
    user_id: string
    action: string
    action_version: number
    model: string
    input: unknown
  },
): Promise<string | null> {
  try {
    const r = await fetch(rest('agent_runs'), {
      method: 'POST',
      headers: headers(userToken),
      body: JSON.stringify({ ...row, status: 'running' }),
    })
    if (!r.ok) return null
    const rows = (await r.json()) as { id: string }[]
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}

export async function finishRun(
  userToken: string,
  runId: string,
  patch: {
    status: 'succeeded' | 'failed' | 'invalid_output'
    output?: unknown
    error?: string
    input_tokens?: number
    output_tokens?: number
    cost_usd?: number
    latency_ms?: number
  },
): Promise<void> {
  try {
    await fetch(rest(`agent_runs?id=eq.${runId}`), {
      method: 'PATCH',
      headers: headers(userToken),
      body: JSON.stringify({ ...patch, finished_at: new Date().toISOString() }),
    })
  } catch {
    /* observability is best-effort */
  }
}

/** Daily per-user cap — cheap guard against runaway spend. */
export async function runsToday(userToken: string, userId: string): Promise<number> {
  try {
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const r = await fetch(
      rest(
        `agent_runs?user_id=eq.${userId}&created_at=gte.${since.toISOString()}&select=id`,
      ),
      {
        method: 'HEAD',
        headers: { ...headers(userToken), Prefer: 'count=exact' },
      },
    )
    const range = r.headers.get('content-range') // e.g. "0-24/25"
    const total = range?.split('/')[1]
    return total ? parseInt(total, 10) : 0
  } catch {
    return 0
  }
}
