import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anon)

// Read before the client below consumes the URL and clears it. A recovery
// link signs you straight in, which is convenient and also means nothing ever
// asks you to actually choose a new password — so we remember how you arrived.
export const arrivedViaRecovery =
  typeof window !== 'undefined' && /type=recovery/.test(window.location.hash + window.location.search)

// A single shared client; when unconfigured (fresh checkout without .env) the
// app still boots and shows a setup notice instead of crashing.
export const supabase = createClient(
  url || 'https://unconfigured.supabase.co',
  anon || 'unconfigured',
  {
    auth: { persistSession: true, autoRefreshToken: true },
  },
)
