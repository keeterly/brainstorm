// What this person is allowed today, according to the server.
//
// The caps live in server configuration — a guest's day is smaller than the
// owner's, and neither number is in the client bundle. The activity page used
// to read `DAILY_USD_CAP` out of the bundle and show it to everybody, which
// told a guest on a dollar fifty that they had six. A meter reporting somebody
// else's limit is worse than no meter.
import { supabase } from '@/lib/supabase'
import { DEMO } from '@/lib/demo'

export interface Allowance {
  allowed: boolean
  capUSD: number
  /** null when the meter could not be read — show nothing rather than a zero */
  spentUSD: number | null
  runs: number | null
  everyoneUSD?: number
  everyoneCapUSD?: number
}

export async function readAllowance(): Promise<Allowance | null> {
  if (DEMO) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  try {
    const r = await fetch('/api/allowance', { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return null
    return (await r.json()) as Allowance
  } catch {
    return null
  }
}

/** What is left of the day, or null when there is no figure to be had. */
export function leftOf(a: Allowance | null): number | null {
  if (!a || a.spentUSD === null) return null
  return Math.max(0, a.capUSD - a.spentUSD)
}
