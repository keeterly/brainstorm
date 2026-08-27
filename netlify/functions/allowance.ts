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
import {
  capForUser,
  capWithInvite,
  inviteFor,
  invitesRule,
  letIn,
  onTheList,
  totalCap,
  type Invite,
} from './_lib/who'
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

  /*
   * The same decision the gate makes, made the same way.
   *
   * It was not. This asked `onTheList` and `capForUser` and knew nothing about
   * invites, while allowRun (see _lib/runs.ts) asked `letIn` and
   * `capWithInvite` — so with AI_INVITES on, the two disagreed in both
   * directions at once. A tester who had not redeemed anything was told
   * `allowed: true` and then had every action refused with no explanation on
   * the page that exists to explain; and one who *had* redeemed was quoted the
   * deployment's $6 rather than the $1.50 their code actually bought. Worse,
   * the one pointer in the app to the redeem box is drawn on `!allowed`, so it
   * never appeared in the exact configuration it was written for.
   *
   * Four helpers, one source of truth, and if the rule ever changes it changes
   * in who.ts for both of them.
   */
  let invite: Invite | null = null
  // Whether we managed to ask at all. The gate fails *closed* on this and
  // should; a report must not, or a tester whose invite could not be read this
  // second is told they are not on the list — which is both wrong and the most
  // discouraging thing this page can say. So we fall back to the answer that
  // does not involve invites and let the action itself be the authority.
  let asked = true
  if (invitesRule()) {
    try {
      invite = await inviteFor(user.token, user.id)
    } catch {
      asked = false
    }
  }
  const allowed = asked ? letIn(user.email, invite) : onTheList(user.email)
  const capUSD = asked ? capWithInvite(user.email, invite, DAILY_USD_CAP) : capForUser(user.email, DAILY_USD_CAP)

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
