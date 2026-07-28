import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { useGraph } from '@/store/graph'
import { SignIn } from './SignIn'

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const hydrated = useGraph((s) => s.hydrated)
  const hydrate = useGraph((s) => s.hydrate)
  const reset = useGraph((s) => s.reset)

  useEffect(() => {
    if (!supabaseConfigured) {
      setChecked(true)
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const userId = session?.user?.id
    if (userId) void hydrate(userId)
    else reset()
  }, [session?.user?.id, hydrate, reset])

  if (!supabaseConfigured) {
    return (
      <div className="page">
        <h1 className="page-title">Brainstorm</h1>
        <div className="card">
          <p style={{ marginBottom: 8 }}>
            <strong>Setup needed.</strong> Supabase isn’t configured yet.
          </p>
          <p className="muted">
            Copy <span className="mono">.env.example</span> to <span className="mono">.env</span>{' '}
            and fill in <span className="mono">VITE_SUPABASE_URL</span> and{' '}
            <span className="mono">VITE_SUPABASE_ANON_KEY</span>, then restart the dev server.
          </p>
        </div>
      </div>
    )
  }

  if (!checked) return null
  if (!session) return <SignIn />

  if (!hydrated) {
    return (
      <div className="page" aria-busy="true">
        <h1 className="page-title">Brainstorm</h1>
        <div className="skeleton" style={{ height: 96, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 56, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 56, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 56 }} />
      </div>
    )
  }

  return <>{children}</>
}
