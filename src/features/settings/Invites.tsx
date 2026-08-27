/*
 * Handing the app to somebody, without handing them the bill.
 *
 * The guest list before this was `AI_ALLOWED_EMAILS`, a comma-separated string
 * in Netlify config. It works. Adding tester number four means editing that
 * variable and rebuilding the site, which is not something you do from a phone
 * while the person is standing in front of you — and it was the reason this
 * app had exactly one user.
 *
 * A code is a row. Minting one is a row, revoking one is deleting it, and the
 * dollar cap that comes with it rides along, so one tester can be given more
 * rope than another without touching config at all.
 *
 * The cap lives on the invite rather than on the person's profile on purpose:
 * `profiles` is `for all` to its owner, so a cap kept there is a cap they can
 * raise. Nobody can write their own invite — see migration 0009.
 *
 * Two halves, and only one of them is yours:
 *
 *   <Invites />    minting and revoking. Owner only. Until 0009 this rendered
 *                  for everybody, and the button *worked* for everybody, which
 *                  meant the way into the AI was: sign up, mint, paste. The
 *                  database is what stops that now (`app_owners`); this is
 *                  only about not showing a tester a control for handing out
 *                  access they do not have.
 *   <RedeemCode /> pasting the code you were given. Everybody who has not.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Invite {
  code: string
  note: string | null
  usd_cap: number | null
  used_by: string | null
  used_at: string | null
  created_at: string
}

/*
 * Codes you can read down a phone line.
 *
 * No 0/O, no 1/I/L — the four characters people mishear and mistype, and a
 * tester who cannot get in is a tester who does not test. Three groups of
 * three, because that is how anybody reads a code aloud anyway.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function mintCode(): string {
  const n = new Uint32Array(9)
  crypto.getRandomValues(n)
  const s = [...n].map((v) => ALPHABET[v % ALPHABET.length]).join('')
  return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6, 9)}`
}

/*
 * Am I the one who hands out access?
 *
 * A row or no row. `app_owners` is readable only where `id = auth.uid()`
 * (migration 0009), so this asks about the asker and cannot be used to find out
 * who else is one. `null` while we are still asking, which both callers treat
 * as "not yet" — a card that flashes into view and then disappears is worse
 * than one that arrives a beat late.
 *
 * An error counts as no. The likely cause is the migration not having been run,
 * and hiding a card beats showing one whose button cannot work.
 */
function useIsOwner(): boolean | null {
  const [owner, setOwner] = useState<boolean | null>(null)
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('app_owners').select('id').limit(1)
      setOwner(!error && (data ?? []).length > 0)
    })()
  }, [])
  return owner
}

export default function Invites() {
  const [rows, setRows] = useState<Invite[] | null>(null)
  const owner = useIsOwner()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  const [note, setNote] = useState('')
  const [cap, setCap] = useState('1.50')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('invites')
      .select('code,note,usd_cap,used_by,used_at,created_at')
      .order('created_at', { ascending: false })
    // The table does not exist until migration 0008 has been applied, and a
    // settings page that throws because of that is worse than one that says so.
    if (error) setRows([])
    else setRows((data ?? []) as Invite[])
  }, [])

  useEffect(() => {
    if (owner) void load()
  }, [owner, load])

  async function mint() {
    setBusy(true)
    setSaid('')
    const code = mintCode()
    const usd = Number(cap)
    const { error } = await supabase.from('invites').insert({
      code,
      note: note.trim() || null,
      usd_cap: Number.isFinite(usd) && usd > 0 ? usd : null,
    })
    setBusy(false)
    if (error) {
      setSaid(error.message.slice(0, 90))
      return
    }
    setNote('')
    await load()
    await share(code)
  }

  /*
   * Getting the code to them.
   *
   * The share sheet where there is one, which on the phone this is built for
   * means it lands in Messages in two taps. The clipboard otherwise, and if
   * both are refused the code is on screen to read out — it was written to be
   * read out.
   */
  async function share(code: string) {
    const text = `${location.origin} — your code is ${code}`
    try {
      if (navigator.share) {
        await navigator.share({ text })
        return
      }
    } catch {
      /* they closed the sheet; the code is still on the list */
    }
    try {
      await navigator.clipboard.writeText(text)
      setSaid('copied')
    } catch {
      setSaid(code)
    }
  }

  async function revoke(code: string) {
    await supabase.from('invites').delete().eq('code', code)
    await load()
  }

  const live = rows?.filter((r) => !r.used_by) ?? []
  const taken = rows?.filter((r) => r.used_by) ?? []

  // …and nothing at all for anybody else, including while we are still asking.
  if (!owner) return null

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Invite someone</h2>
      <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 12 }}>
        A code, good once. They paste it the first time they sign in. Whatever you put in the
        limit is the most their day can cost you.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          className="field"
          placeholder="who is it for"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Who this code is for — only you see this"
        />
        <input
          className="field mono"
          inputMode="decimal"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          style={{ width: 78 }}
          aria-label="Most this person may spend in a day, in dollars"
        />
      </div>

      <button className="btn btn--ghost" onClick={() => void mint()} disabled={busy}>
        {busy ? 'minting…' : '＋ Mint a code and share it'}
      </button>
      {said && (
        <p className="muted mono" style={{ fontSize: 'var(--fs-label)', marginTop: 8 }} role="status">
          {said}
        </p>
      )}

      {rows === null ? null : !rows.length ? (
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginTop: 12 }}>
          No codes yet.
        </p>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          {live.map((r) => (
            <div key={r.code} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="mono" style={{ flex: 1, minWidth: 0 }}>
                {r.code}
              </span>
              <span className="muted" style={{ fontSize: 'var(--fs-label)' }}>
                {r.note || 'unused'}
                {r.usd_cap ? ` · $${Number(r.usd_cap).toFixed(2)}/day` : ''}
              </span>
              <button className="btn btn--sm btn--ghost" onClick={() => void share(r.code)}>
                share
              </button>
              <button className="btn btn--sm btn--ghost" onClick={() => void revoke(r.code)}>
                revoke
              </button>
            </div>
          ))}
          {taken.map((r) => (
            // Still revocable. Deleting a used code does not delete their
            // account or their thoughts — it takes away the AI, which is the
            // only thing it ever granted.
            <div key={r.code} style={{ display: 'flex', alignItems: 'baseline', gap: 10, opacity: 0.6 }}>
              <span className="mono" style={{ flex: 1, minWidth: 0 }}>
                {r.code}
              </span>
              <span className="muted" style={{ fontSize: 'var(--fs-label)' }}>
                {r.note ? `${r.note} · ` : ''}in use
              </span>
              <button className="btn btn--sm btn--ghost" onClick={() => void revoke(r.code)}>
                revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/*
 * The other end of it: pasting the code you were given.
 *
 * Not a wall in front of the app. An invite grants the AI, not the door —
 * signing in already worked, their thoughts are already their own, and a
 * tester who cannot get past a code box has nothing to test. So this is a row
 * in settings that goes away the moment it is used, and the sky points at it
 * when an action is refused for being off the list.
 *
 * `redeem_invite` is a security-definer function because the whole point is a
 * write the caller may not make: before redemption the row is not theirs by
 * any policy, so they cannot even see it to claim it. It answers true or
 * false and never says *why* a code did not work — the difference between
 * wrong, expired and already used is only useful to somebody guessing.
 */
export function RedeemCode() {
  const [has, setHas] = useState<boolean | null>(null)
  const owner = useIsOwner()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')

  useEffect(() => {
    void (async () => {
      const { data: s } = await supabase.auth.getSession()
      const me = s.session?.user?.id
      if (!me) return
      /*
       * `used_by = me`, not `used_by is not null`.
       *
       * Two policies can hand back a row here — the one you redeemed, and the
       * ones you minted (0009) — so "any invite with somebody on it" is the
       * wrong question for exactly one person: whoever hands out the codes
       * would be answering it about their testers.
       */
      const { data, error } = await supabase.from('invites').select('code').eq('used_by', me).limit(1)
      // before the migration is applied there is no table; say nothing rather
      // than showing a box that cannot work
      if (error) setHas(true)
      else setHas((data ?? []).length > 0)
    })()
  }, [])

  // …and not to the person handing the codes out, who is on the email list and
  // will never redeem one. Without this they get "Have a code?" sitting on top
  // of their own mint card for ever — which is what asking `used_by is not
  // null` used to hide by accident, for the wrong reason.
  if (has !== false || owner !== false) return null

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Have a code?</h2>
      <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
        Everything here works without one. A code is what turns the AI on.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field mono"
          placeholder="ABC-DEF-GHJ"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Your invite code"
        />
        <button
          className="btn btn--ghost"
          disabled={busy || !code.trim()}
          onClick={async () => {
            setBusy(true)
            setSaid('')
            const { data, error } = await supabase.rpc('redeem_invite', { code: code.trim() })
            setBusy(false)
            if (error) setSaid('could not check that just now')
            else if (data === true) setHas(true)
            else setSaid('that code does not work')
          }}
        >
          {busy ? '…' : 'Use it'}
        </button>
      </div>
      {said && (
        <p className="muted" style={{ fontSize: 'var(--fs-label)', marginTop: 8 }} role="status">
          {said}
        </p>
      )}
    </section>
  )
}
