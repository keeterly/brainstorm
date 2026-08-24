// Who may spend, and how much.
//
// Everything in here exists for one situation: handing the app to a few people
// on their own phones without handing them the bill. Three separate ceilings,
// because they fail in different directions and only all three together bound
// what a day can cost.
//
//   1. **Who.** Signing in is not permission. Supabase auth is open by
//      default, so anybody who ends up with the URL can make an account, and
//      an account is a licence to spend. An allowlist makes the guest list
//      explicit and revocable in one edit.
//   2. **How much each.** A tester poking at a new app runs more actions in an
//      afternoon than the person who built it runs in a week, and none of it
//      is work. They get their own, smaller number.
//   3. **How much altogether.** The per-user cap is the one people reach for
//      and it does not bound anything: ten testers at six dollars is sixty
//      dollars a day, and the cap did its job every single time. Only a total
//      is a total.
//
// All of it is off unless configured, so nothing changes for a deployment that
// does not set any of it.

/** Split an env list into lower-cased emails. */
function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * May this person use the AI at all?
 *
 * With no `AI_ALLOWED_EMAILS` set, anybody signed in may — which is what this
 * app did before there was a guest list, and what a deployment with one user
 * wants. With it set, the list is the whole of the answer.
 *
 * An account with no email address on it — which is possible with some sign-in
 * methods — is refused whenever a list exists, because a guest list you cannot
 * check somebody against is not a guest list.
 */
export function onTheList(email: string | null, allowed = process.env.AI_ALLOWED_EMAILS): boolean {
  const names = list(allowed)
  if (!names.length) return true
  return !!email && names.includes(email.trim().toLowerCase())
}

/**
 * The day's budget for one person.
 *
 * `AI_OWNER_EMAILS` get the full `DAILY_USD_CAP`; everybody else gets
 * `AI_GUEST_USD_CAP` if one is set. With no owners named, everybody is
 * treated as the owner — a single-user deployment should not have to say so.
 */
export function capForUser(
  email: string | null,
  full: number,
  env: { owners?: string; guest?: string } = {
    owners: process.env.AI_OWNER_EMAILS,
    guest: process.env.AI_GUEST_USD_CAP,
  },
): number {
  const owners = list(env.owners)
  if (!owners.length) return full
  const isOwner = !!email && owners.includes(email.trim().toLowerCase())
  if (isOwner) return full
  const guest = Number(env.guest)
  return Number.isFinite(guest) && guest > 0 ? Math.min(guest, full) : full
}

/**
 * …and the ceiling over everybody together, if one is set.
 *
 * Returns `null` when there is none, which is the default: a total cap that
 * cannot be read has to fail *closed* — see allowRun — and failing closed on a
 * limit nobody asked for would take the app down for the one person using it.
 */
export function totalCap(v = process.env.AI_TOTAL_USD_CAP): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The invite this person redeemed, if they redeemed one.
 *
 * The guest list used to be `AI_ALLOWED_EMAILS` and nothing else, which works
 * and costs a redeploy per tester — you cannot add somebody from a phone while
 * they are standing in front of you. An invite is a row instead: minting one is
 * a row, revoking one is a row, and the cap that came with it rides along.
 *
 * Read with the *user's own* token. They may select the invite they redeemed
 * and nothing else (see migration 0008), so this cannot be used to enumerate
 * anybody else's, and — the part that matters — they cannot UPDATE it. A cap
 * you can raise yourself is not a cap, which is exactly why this does not live
 * on `profiles`, where the owner has `for all`.
 */
export interface Invite {
  code: string
  usd_cap: number | null
  expires_at: string | null
}

export async function inviteFor(userToken: string): Promise<Invite | null> {
  const url =
    `${process.env.SUPABASE_URL}/rest/v1/invites` +
    `?select=code,usd_cap,expires_at&used_by=not.is.null&limit=1`
  const r = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY || '',
      Authorization: `Bearer ${userToken}`,
    },
  })
  // Throw rather than return null: "no invite" and "could not ask" are
  // different answers, and the gate has to fail closed on the second one.
  if (!r.ok) throw new Error(`invite read failed (${r.status})`)
  const rows = (await r.json()) as Invite[]
  const hit = rows[0]
  if (!hit) return null
  // an invite that has run out is not an invite
  if (hit.expires_at && new Date(hit.expires_at).getTime() <= Date.now()) return null
  return hit
}

/**
 * Whether invites are the guest list on this deployment.
 *
 * Off unless asked for, like everything else in here. With it off, nothing
 * about this deployment changes: the email list is the whole answer and a
 * deployment with one user still needs no configuration at all.
 */
export function invitesRule(v = process.env.AI_INVITES): boolean {
  return String(v ?? '').trim() === '1'
}

/**
 * May this person use the AI at all, once invites are in play?
 *
 * The email list still wins outright — that is how you let yourself in without
 * minting yourself a code, and how you keep a deployment that never turns
 * invites on working exactly as it did. Failing that, a live invite is the
 * other way in.
 */
export function letIn(email: string | null, invite: Invite | null, allowed = process.env.AI_ALLOWED_EMAILS): boolean {
  if (onTheList(email, allowed)) {
    // …unless the list is empty *and* invites are the rule, in which case
    // "no list" must not mean "everybody", or turning invites on would have
    // let in exactly the people it was meant to keep out.
    if (!list(allowed).length && invitesRule()) return !!invite
    return true
  }
  return !!invite
}

/**
 * …and what that person may spend.
 *
 * An invite's own number beats the deployment's guest default, so one tester
 * can be given more rope than another without touching config. It can only
 * ever lower the full cap — `Math.min` — for the same reason `capForUser`
 * does: a guest list is not a way to hand somebody a bigger budget than the
 * deployment has.
 */
export function capWithInvite(email: string | null, invite: Invite | null, full: number): number {
  const base = capForUser(email, full)
  const own = Number(invite?.usd_cap)
  return Number.isFinite(own) && own > 0 ? Math.min(own, full) : base
}
