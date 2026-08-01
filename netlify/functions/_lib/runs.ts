// agent_runs bookkeeping — all writes go through Supabase REST *as the user*
// (their JWT is forwarded), so RLS applies and no service-role key exists here.
import { DAILY_RUN_CAP, DAILY_USD_CAP, estimateUSD } from '../../../shared/ai/pricing'

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
    /** the caller may name the run, so a background job can be watched */
    id?: string
    user_id: string
    action: string
    action_version: number
    model: string
    input: unknown
    /** what it might cost, charged now and corrected when it finishes — see
     *  estimateUSD. A run in flight is not free, and one that never finishes
     *  is not free either. */
    cost_usd?: number
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
    /** phase breakdown, and on a failure the evidence for it */
    timings?: Record<string, unknown>
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

/** What today has cost, and how many runs it took. */
export interface Spend {
  usd: number
  runs: number
}

/**
 * The day's spend so far.
 *
 * Two things about this are deliberate and both of them were wrong before.
 *
 * **It is dollars.** It used to be a count of rows, which is a cap on nothing:
 * see DAILY_USD_CAP. The count is still returned, because a runaway loop is a
 * different failure from an expensive day and wants a different ceiling.
 *
 * **It throws.** It used to `catch { return 0 }` — so the one condition under
 * which the meter cannot be read was also the condition under which everything
 * was permitted. A spend cap that fails open is a spend cap in name only, and
 * the failure it fails open on is exactly the one an attacker would arrange.
 * The caller stops, and says it could not check rather than pretending the
 * answer was zero.
 *
 * The sum is done here rather than in the database. PostgREST can aggregate,
 * but whether it may is a project setting that can be turned off underneath
 * us, and a cap that silently starts returning nothing is worse than one more
 * round trip. The row count is bounded by DAILY_RUN_CAP by construction, so
 * the page this pulls has a known ceiling.
 */
export async function spentToday(userToken: string, userId: string): Promise<Spend> {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const r = await fetch(
    rest(
      `agent_runs?user_id=eq.${userId}&created_at=gte.${since.toISOString()}` +
        `&select=cost_usd&limit=5000`,
    ),
    { headers: headers(userToken) },
  )
  if (!r.ok) throw new Error(`usage read failed (${r.status})`)
  const rows = (await r.json()) as { cost_usd: number | string | null }[]
  let usd = 0
  for (const row of rows) {
    // numeric(10,6) comes back as a string from PostgREST, and Number(null) is
    // 0 rather than NaN — a run with no figure on it yet is charged nothing
    // here, which is why one is written at insert time instead.
    const n = Number(row.cost_usd ?? 0)
    if (Number.isFinite(n)) usd += n
  }
  return { usd, runs: rows.length }
}

/** May this run start, and what shall we charge it while it is going. */
export type Gate =
  | { ok: true; cost: number; spend: Spend }
  | { ok: false; status: 429 | 503; error: string }

const money = (n: number) => `$${n.toFixed(2)}`

/**
 * The whole of the decision, in one place, so both endpoints make it the same
 * way. They did not: the synchronous one measured the gate and the background
 * one did not, and any change to the rule had to be made twice.
 *
 * Three ways to be refused, and they are three different things:
 *
 *  - The meter cannot be read → 503. Not the user's fault and not their
 *    limit; the app should say it could not check and let them try again,
 *    rather than telling them they are out of something they are not.
 *  - Today's spend plus what this might cost is over the cap → 429. The
 *    estimate is what makes this a cap rather than a report: without it the
 *    run that crosses the line is unbounded, and the most expensive action in
 *    the app is the one most likely to be the one that crosses it.
 *  - Too many runs, whatever they cost → 429. A different failure.
 */
export async function allowRun(
  userToken: string,
  userId: string,
  def: { maxTokens: number; searchMaxUses?: number },
  model: string,
  inputChars: number,
  searchMaxUses?: number,
): Promise<Gate> {
  let spend: Spend
  try {
    spend = await spentToday(userToken, userId)
  } catch {
    return { ok: false, status: 503, error: 'Could not check today’s usage. Try again in a moment.' }
  }
  const cost = estimateUSD(
    { maxTokens: def.maxTokens, searchMaxUses: searchMaxUses ?? def.searchMaxUses },
    model,
    inputChars,
  )
  if (spend.usd + cost > DAILY_USD_CAP) {
    return {
      ok: false,
      status: 429,
      error:
        `Daily AI limit reached — ${money(spend.usd)} of ${money(DAILY_USD_CAP)} used today. ` +
        `It resets at midnight UTC.`,
    }
  }
  if (spend.runs >= DAILY_RUN_CAP) {
    return { ok: false, status: 429, error: `Daily AI limit reached (${DAILY_RUN_CAP} runs). Try again tomorrow.` }
  }
  return { ok: true, cost, spend }
}
