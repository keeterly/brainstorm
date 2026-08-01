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
