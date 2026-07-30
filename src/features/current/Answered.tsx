// The answer, where the question was.
//
// The sky can afford to hand you a brief and let you open it. The Current
// cannot: there is one thing on this screen and you are looking straight at it,
// so when the one thing is a question the answer belongs right underneath it,
// already open. Nobody waits a minute for a number and then wants to go and
// find where the number was filed.
import type { AnswerOutput } from '@shared/ai/actions/answer'

export function Answered({ out, onDone }: { out: AnswerOutput; onDone?: () => void }) {
  return (
    <div className="card" style={{ marginTop: 18, textAlign: 'left' }}>
      <p style={{ fontSize: 17, lineHeight: 1.5, fontWeight: 400 }}>{out.answer}</p>

      {out.facts.length > 0 && (
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {out.facts.map((f, i) => (
            <div key={i}>
              <div style={{ fontSize: 'var(--fs-label)' }}>
                <span className="muted">{f.label}</span>{' '}
                <strong style={{ fontWeight: 560 }}>{f.value}</strong>
              </div>
              {/* muted, not faint: this line carries the thing that makes the
                  figure usable — which flight, which cabin, which fare rules —
                  and faint measures 2.2:1 against the card, which is decoration
                  contrast, not reading contrast */}
              {f.note && (
                <div className="muted" style={{ fontSize: 'var(--fs-caption)', marginTop: 2 }}>
                  {f.note}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* What it could not settle, and the one thing that would. Said plainly
          and never buried — a range presented as a figure is the failure mode
          this whole feature has to avoid. */}
      {out.unknown.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 18, marginBottom: 8 }}>
            Still open
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {out.unknown.map((u, i) => (
              <div key={i} style={{ fontSize: 'var(--fs-label)' }}>
                {u.what}
                {u.toKnow && <span className="muted"> — {u.toKnow}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {out.sources.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
          {out.sources.map((s, i) => (
            <a
              key={i}
              className="chip"
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              style={{ fontSize: 'var(--fs-caption)' }}
            >
              {/* the page, not the host: two links to the same site both
                  reading "airfrance.us" tell you nothing about either */}
              {clip(s.title.trim(), 30) || hostOf(s.url) || 'source'}
            </a>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginTop: 18,
        }}
      >
        {/* how stale the number is, which is part of the answer rather than a
            footnote to it */}
        <span className="muted" style={{ fontSize: 'var(--fs-caption)', flex: 1, minWidth: 0 }}>
          {out.asOf}
        </span>
        {/* An answer that settles the matter should be able to close it from
            here. One that does not says so by not offering. */}
        {out.settled && onDone && (
          <button className="btn btn--ghost btn--sm" onClick={onDone}>
            That’s it — done
          </button>
        )}
      </div>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
