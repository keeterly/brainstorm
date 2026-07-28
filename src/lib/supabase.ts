import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anon)

// A single shared client; when unconfigured (fresh checkout without .env) the
// app still boots and shows a setup notice instead of crashing.
export const supabase = createClient(
  url || 'https://unconfigured.supabase.co',
  anon || 'unconfigured',
  {
    auth: { persistSession: true, autoRefreshToken: true },
  },
)
