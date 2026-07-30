// Telling you it finished, when the app is not open to be told.
//
// Best-effort by construction. A notification that fails must never turn a
// successful run into a failed one — the research is already written down and
// the app will find it the moment you come back. So everything here swallows
// its own errors and the caller does not wait on the outcome of any single
// send.
//
// Reads and writes go through Supabase REST as the user, with their forwarded
// JWT, exactly like the rest of the function code: no service-role key exists
// anywhere in this deployment.
import webpush from 'web-push'

interface Sub {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

const rest = (path: string) => `${process.env.SUPABASE_URL}/rest/v1/${path}`
const headers = (userToken: string) => ({
  'Content-Type': 'application/json',
  apikey: process.env.SUPABASE_ANON_KEY || '',
  Authorization: `Bearer ${userToken}`,
})

/** Is push set up on this deployment at all? */
export const pushConfigured = () =>
  !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY

function configure(): boolean {
  if (!pushConfigured()) return false
  webpush.setVapidDetails(
    // a way for a push service to contact whoever is sending, as the spec asks
    process.env.VAPID_SUBJECT || 'mailto:hello@veniacollection.com',
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  )
  return true
}

export interface Note {
  title: string
  body: string
  /** where in the app it is about */
  url?: string
  /** one notification per run — a second send replaces rather than stacks */
  tag?: string
}

/**
 * Send to every device this user has signed up, once.
 *
 * `claim` is the run this is about: it is stamped as notified *before* anything
 * is sent, so that two devices coming back at the same moment, or a retry of
 * the same background job, cannot announce the same result twice. Losing a
 * notification is a small harm; sending it four times is the kind that makes
 * people turn notifications off.
 */
export async function notifyUser(userToken: string, note: Note, claim?: { runId: string }): Promise<void> {
  try {
    if (!configure()) return
    if (claim && !(await claimRun(userToken, claim.runId))) return

    const r = await fetch(rest('push_subscriptions?select=id,endpoint,p256dh,auth&gone_at=is.null'), {
      headers: headers(userToken),
    })
    if (!r.ok) return
    const subs = (await r.json()) as Sub[]
    if (!subs.length) return

    const payload = JSON.stringify(note)
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 12 },
          )
          await stamp(userToken, s.id, { last_ok_at: new Date().toISOString() })
        } catch (e) {
          // 404 and 410 are the push service saying this address is dead —
          // the app was uninstalled, or the browser rotated it. Anything else
          // is transient and the row stays as it is.
          const code = (e as { statusCode?: number })?.statusCode
          if (code === 404 || code === 410) await stamp(userToken, s.id, { gone_at: new Date().toISOString() })
        }
      }),
    )
  } catch {
    /* a notification is never worth failing a run over */
  }
}

/** Take the right to announce this run, or find someone already has. */
async function claimRun(userToken: string, runId: string): Promise<boolean> {
  try {
    const r = await fetch(rest(`agent_runs?id=eq.${encodeURIComponent(runId)}&notified_at=is.null`), {
      method: 'PATCH',
      headers: { ...headers(userToken), Prefer: 'return=representation' },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    })
    if (!r.ok) return false
    // the filter matched nothing, so somebody else got there first
    return ((await r.json()) as unknown[]).length > 0
  } catch {
    return false
  }
}

async function stamp(userToken: string, id: string, patch: Record<string, string>): Promise<void> {
  try {
    await fetch(rest(`push_subscriptions?id=eq.${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: headers(userToken),
      body: JSON.stringify(patch),
    })
  } catch {
    /* bookkeeping only */
  }
}
