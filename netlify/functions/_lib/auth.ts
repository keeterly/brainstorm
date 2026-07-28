// Verify the caller's Supabase session by asking Supabase Auth itself.
// One HTTPS call per request; works for both legacy HS256 and new asymmetric
// signing keys without holding any secret here (the anon key is public).
export interface AuthedUser {
  id: string
  email: string | null
  token: string
}

export async function verifyUser(req: Request): Promise<AuthedUser | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const url = process.env.SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY
  if (!url || !anon) return null
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return null
    const u = (await r.json()) as { id?: string; email?: string }
    if (!u.id) return null
    return { id: u.id, email: u.email ?? null, token }
  } catch {
    return null
  }
}
