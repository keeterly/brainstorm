// agent_runs bookkeeping — all writes go through Supabase REST *as the user*
// (their JWT is forwarded), so RLS applies and no service-role key exists here.
import { DAILY_RUN_CAP, DAILY_USD_CAP, estimateUSD } from '../../../shared/ai/pricing'
import { capWithInvite, inviteFor, invitesRule, letIn, totalCap, type Invite } from './who'

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
  | { ok: false; status: 403 | 429 | 503; error: string }

const money = (n: number) => `$${n.toFixed(2)}`

/**
 * The whole of the decision, in one place, so both endpoints make it the same
 * way. They did not: the synchronous one measured the gate and the background
 * one did not, and any change to the rule had to be made twice.
 *
 * Four ways to be refused, and they are four different things:
 *
 *  - Not on the guest list → 403. Signing in is not permission; see who.ts.
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
  input: { chars: number; images: number },
  searchMaxUses?: number,
  email: string | null = null,
): Promise<Gate> {
  /*
   * Before anything is measured: signing in is not permission. See who.ts.
   *
   * Two ways in — the email list, and an invite somebody redeemed. The read
   * fails *closed*: a guest list that cannot be checked is not a guest list,
   * and this is the one moment it is worth the most.
   */
  let invite: Invite | null = null
  if (invitesRule()) {
    try {
      invite = await inviteFor(userToken, userId)
    } catch {
      return { ok: false, status: 503, error: 'Could not check the guest list. Try again in a moment.' }
    }
  }
  if (!letIn(email, invite)) {
    return { ok: false, status: 403, error: 'This account is not on the list for AI actions.' }
  }

  let spend: Spend
  try {
    spend = await spentToday(userToken, userId)
  } catch {
    return { ok: false, status: 503, error: 'Could not check today’s usage. Try again in a moment.' }
  }
  const cost = estimateUSD(
    { maxTokens: def.maxTokens, searchMaxUses: searchMaxUses ?? def.searchMaxUses },
    model,
    input.chars,
    input.images,
  )

  const mine = capWithInvite(email, invite, DAILY_USD_CAP)
  if (spend.usd + cost > mine) {
    return {
      ok: false,
      status: 429,
      error: `Daily AI limit reached — ${money(spend.usd)} of ${money(mine)} used today. It resets at midnight UTC.`,
    }
  }
  if (spend.runs >= DAILY_RUN_CAP) {
    return { ok: false, status: 429, error: `Daily AI limit reached (${DAILY_RUN_CAP} runs). Try again tomorrow.` }
  }

  /*
   * …and the ceiling over everybody together.
   *
   * Last, because it is the only one that costs a second round trip, and it is
   * asked only when there is a total to compare against. It fails closed for
   * the same reason the per-user meter does: the moment the total cannot be
   * read is the moment it is worth the most.
   */
  const all = totalCap()
  if (all !== null) {
    let used: number
    try {
      used = await spentTodayEverybody(userToken)
    } catch {
      return { ok: false, status: 503, error: 'Could not check today’s usage. Try again in a moment.' }
    }
    if (used + cost > all) {
      return {
        ok: false,
        status: 429,
        error: `Everyone’s AI budget for today is used up (${money(used)} of ${money(all)}). It resets at midnight UTC.`,
      }
    }
  }
  return { ok: true, cost, spend }
}

/**
 * What everybody has spent today, across every account.
 *
 * Through a `security definer` function rather than a service-role key: there
 * is no service-role key anywhere in this app and there is not going to be
 * one. RLS means a user's own token can only ever see their own runs, so a sum
 * across all of them has to be computed by something that is allowed to — and
 * `public.ai_spend_today()` hands back exactly one number and nothing else.
 * See supabase/migrations/0007.
 */
export async function spentTodayEverybody(userToken: string): Promise<number> {
  const r = await fetch(rest('rpc/ai_spend_today'), {
    method: 'POST',
    headers: headers(userToken),
    body: '{}',
  })
  if (!r.ok) throw new Error(`total usage read failed (${r.status})`)
  const n = Number(await r.json())
  if (!Number.isFinite(n)) throw new Error('total usage read was not a number')
  return n
}
