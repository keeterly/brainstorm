// Verify the caller's Supabase session by asking Supabase Auth itself.
// One HTTPS call per request; works for both legacy HS256 and new asymmetric
// signing keys without holding any secret here (the anon key is public).
//
// One HTTPS call *per request* was the problem. Capturing five thoughts fires
// five actions, each of which stopped to ask Supabase who you were before it
// would start — a couple of hundred milliseconds on top of a model call that
// takes under a second, paid five times over, for an answer that could not
// have changed in between. So a token that verified moments ago is taken at its
// word for a short while.
//
// This caches the *result of a check that already passed*, never a decision the
// check did not make: an unknown token is still verified over the wire, a
// rejected one is never cached at all, and the window is short enough that a
// signed-out session cannot outlive it in any way a person would notice.
export interface AuthedUser {
  id: string
  email: string | null
  token: string
}

/** How long a passed check stands without being asked again. */
const GRACE_MS = 60_000
/** A bound, so a long-lived warm container cannot grow this without limit. */
const MAX_REMEMBERED = 32

const seen = new Map<string, { user: AuthedUser; at: number }>()

export async function verifyUser(req: Request): Promise<AuthedUser | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null

  const hit = seen.get(token)
  if (hit && Date.now() - hit.at < GRACE_MS) return hit.user

  const url = process.env.SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY
  if (!url || !anon) return null
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) {
      // a refusal is never remembered — only a pass is
      seen.delete(token)
      return null
    }
    const u = (await r.json()) as { id?: string; email?: string }
    if (!u.id) return null
    const user: AuthedUser = { id: u.id, email: u.email ?? null, token }
    if (seen.size >= MAX_REMEMBERED) seen.clear()
    seen.set(token, { user, at: Date.now() })
    return user
  } catch {
    return null
  }
}

/** Test seam: forget everything that was taken at its word. */
export function forgetVerified(): void {
  seen.clear()
}
