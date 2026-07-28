// Origin gate — defense in depth on top of real JWT auth.
// Browsers always send Origin on cross-origin POSTs; same-origin calls carry
// Sec-Fetch-Site. Requests with a foreign Origin are rejected outright.
export function originAllowed(req: Request): boolean {
  const allowed = new Set(
    (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  const deployUrl = process.env.URL // Netlify's primary site URL
  if (deployUrl) allowed.add(deployUrl)
  const deployPrime = process.env.DEPLOY_PRIME_URL
  if (deployPrime) allowed.add(deployPrime)

  const o = req.headers.get('origin')
  if (o) return allowed.has(o)
  const site = (req.headers.get('sec-fetch-site') || '').toLowerCase()
  return site === 'same-origin' || site === 'same-site'
}

export function corsHeaders(req: Request): Record<string, string> {
  const o = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': o && originAllowed(req) ? o : process.env.URL || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}
