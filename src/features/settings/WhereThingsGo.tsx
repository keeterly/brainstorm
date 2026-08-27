/*
 * Where your thoughts go.
 *
 * Before a link goes out to anybody, this app has to be able to answer one
 * question in words a person would use: I am about to type the thing I have
 * not told anybody — where does it end up?
 *
 * It is not a privacy policy. A privacy policy is a document written so that
 * nobody reads it, and asking a friend to accept one before they try your app
 * is a strange thing to do to a friend. This is four short facts, all of them
 * true of the code as it stands:
 *
 *   - thoughts live in rows keyed to one account, and every table is RLS'd to
 *     `auth.uid()` — see migration 0001. Not even the person who deployed the
 *     app can read them without the database in front of them.
 *   - the only thing that ever leaves is the text of what you run an action
 *     on, and only when you run it. Capturing, grouping and tidying are all
 *     local-and-Supabase; nothing calls out until you tap ⚡ or ✦.
 *   - Anthropic's API does not train on what is sent through it.
 *   - and the honest one: there is no delete-my-account button yet.
 *
 * The same words in both places on purpose — one constant, two renderings —
 * because the version somebody sees before they sign up and the version they
 * can find afterwards being subtly different is its own kind of lie.
 */

/** The whole of it. Kept as data so the two renderings cannot drift. */
export const WHERE_THINGS_GO: string[] = [
  'What you write here is yours. It is stored in rows keyed to your account, and the database will not hand them to anybody else — including me.',
  'When you tap ⚡ or ✦, the text of that thought is sent to Anthropic to be thought about, and the answer comes back. That is the only time anything leaves.',
  'It is not used to train anything, and it is not sold or handed on.',
  'You can export the lot as Markdown from this page. There is no delete-my-account button yet — ask me and I will do it by hand.',
]

/** The Settings card: always there, never in the way. */
export function WhereThingsGo() {
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 8 }}>Where your thoughts go</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {WHERE_THINGS_GO.map((line) => (
          <p key={line} className="muted" style={{ fontSize: 'var(--fs-label)' }}>
            {line}
          </p>
        ))}
      </div>
    </section>
  )
}

/*
 * …and the same thing on the way in.
 *
 * Folded, because the sign-in screen is four fields and a button and it should
 * stay that way — but present, because "you should have read the settings
 * page" is not an answer to somebody who has already typed the thing.
 */
export function WhereThingsGoBrief() {
  return (
    <details style={{ marginTop: 24 }}>
      <summary className="muted" style={{ fontSize: 'var(--fs-label)', cursor: 'pointer' }}>
        Where your thoughts go
      </summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {WHERE_THINGS_GO.map((line) => (
          <p key={line} className="muted" style={{ fontSize: 'var(--fs-label)' }}>
            {line}
          </p>
        ))}
      </div>
    </details>
  )
}
