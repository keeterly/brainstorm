// GET /api/allowance — what this person is allowed, and what they have used.
//
// The last piece of letting somebody else in. The caps are server-side
// configuration, so the app had no way to know them: the activity page read
// `DAILY_USD_CAP` out of the client bundle and told everybody their ceiling was
// six dollars, which for a guest on a dollar fifty is not a rounding error, it
// is the wrong number. A meter that reports somebody else's limit is worse than
// no meter.
//
// So the server says. One call, no arguments, three facts: whether they may use
// the AI at all, what their day's budget is, and how much of it is gone.
import { corsHeaders, originAllowed } from './_lib/guard'
import { verifyUser } from './_lib/auth'
import { spentToday, spentTodayEverybody } from './_lib/runs'
import { capForUser, onTheList, totalCap } from './_lib/who'
import { DAILY_USD_CAP } from '../../shared/ai/pricing'

const json = (status: number, body: unknown, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    // Never cached. It is a number that changes every time the person uses the
    // app, and a stale one is exactly the lie this endpoint exists to stop.
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export interface Allowance {
  /** may they use the AI at all — see who.ts */
  allowed: boolean
  /** their budget for the day, in dollars */
  capUSD: number
  /** …and what is gone of it */
  spentUSD: number
  /** how many runs they have started today */
  runs: number
  /** the ceiling over everybody, when there is one, and how much of it is left */
  everyoneUSD?: number
  everyoneCapUSD?: number
}

export default async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'GET') return json(405, { error: 'Method Not Allowed' }, cors)
  if (!originAllowed(req)) return json(403, { error: 'Forbidden' }, cors)

  const user = await verifyUser(req)
  if (!user) return json(401, { error: 'Sign in first' }, cors)

  const allowed = onTheList(user.email)
  const capUSD = capForUser(user.email, DAILY_USD_CAP)

  let spentUSD = 0
  let runs = 0
  try {
    const s = await spentToday(user.token, user.id)
    spentUSD = s.usd
    runs = s.runs
  } catch {
    // Unlike the gate, this one does *not* fail closed. It refuses nothing —
    // it only reports — and a page that cannot show a figure should show no
    // figure rather than an alarming zero or an error where a number goes.
    return json(200, { allowed, capUSD, spentUSD: null, runs: null } as unknown, cors)
  }

  const out: Allowance = { allowed, capUSD, spentUSD, runs }
  const all = totalCap()
  if (all !== null) {
    out.everyoneCapUSD = all
    try {
      out.everyoneUSD = await spentTodayEverybody(user.token)
    } catch {
      /* the same again: a missing number is better than a wrong one */
    }
  }
  return json(200, out, cors)
}

export const config = { path: '/api/allowance' }
