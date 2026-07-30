// The Current — one meaningful action, large. Everything else stays folded
// until asked for. Never a task list first.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { nextAction } from '@/domain/next-action'
import { prioritizePrepass, todayISO } from '@/domain/prioritize-prepass'
import { humanDue } from '@/domain/human-date'
import { useAction } from '@/ai/useAction'
import type { PrioritizeOutput } from '@shared/ai/actions/prioritize'
import { evaporateAt } from '@/world/Atmosphere'
import { FocusOverlay } from './FocusOverlay'
import { NoticedPanel } from './Noticed'
import { Answered } from './Answered'
import { Made } from './Made'
import { isMakeable, isQuestion } from '@/domain/question'
import { answerThought } from '@/features/sky/answerFlow'
import { draftMarkdown, draftThought } from '@/features/sky/draftFlow'
import { fullDepth, sizeUp, waitingWord, type Sizing } from '@/features/sky/gaugeFlow'
import type { AnswerOutput } from '@shared/ai/actions/answer'
import type { Thought } from '@/domain/types'

export default function CurrentPage() {
  const navigate = useNavigate()
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const profile = useGraph((s) => s.profile)
  const offline = useGraph((s) => s.offline)
  const toggleDone = useGraph((s) => s.toggleDone)
  const setBucket = useGraph((s) => s.setBucket)
  const updateThought = useGraph((s) => s.updateThought)
  const updateProfileSettings = useGraph((s) => s.updateProfileSettings)

  const ai = useAction<PrioritizeOutput>('prioritize')
  const [suggestion, setSuggestion] = useState<PrioritizeOutput | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  // Asking the one thing on this screen, when the one thing is a question.
  const [asking, setAsking] = useState<string | null>(null)
  const [askedFor, setAskedFor] = useState<{ id: string; out: AnswerOutput } | null>(null)
  // …and the work itself, when the one thing is something the agent can make
  const [drafted, setDrafted] = useState<{
    id: string
    title: string
    md: string
    sources: { title: string; url: string }[]
    done: boolean
  } | null>(null)
  const [askFailed, setAskFailed] = useState<string | null>(null)
  const [waited, setWaited] = useState(0)
  const [sizing, setSizing] = useState<Sizing | null>(null)

  const today = todayISO()
  const prepass = useMemo(
    () => prioritizePrepass(thoughts, relationships, today),
    [thoughts, relationships, today],
  )

  const goalTitle = useMemo(() => {
    const partOf = new Map(
      relationships.filter((r) => r.type === 'part_of').map((r) => [r.from_id, r.to_id]),
    )
    const byId = new Map(thoughts.map((t) => [t.id, t]))
    return (t: Thought) => {
      const g = partOf.get(t.id)
      return g ? (byId.get(g)?.title ?? null) : null
    }
  }, [relationships, thoughts])

  // Exactly one primary action; the rest wait behind a fold.
  const rec = profile?.settings.recommended_action
  const recThought = rec ? prepass.visible.find((t) => t.id === rec.id) : null
  const flow = prepass.visible.filter((t) => {
    const b = prepass.buckets.get(t.id)
    return b === 'now' || b === 'next'
  })
  // The same answer the sky gives, from the same rules.
  //
  // This page used to work out its own first thing and its own reason for it,
  // which meant the sky could say "due in 4 days" about the very thought this
  // page called "due Monday — the water goes here first". One recommendation
  // told two ways is two recommendations as far as anyone reading is
  // concerned. The AI's own pick still wins when it has made one; everything
  // under that is now the one tested set of rules.
  const auto = useMemo(() => nextAction(thoughts, relationships, today), [thoughts, relationships, today])
  const primary = recThought ?? auto?.thought ?? null
  const primaryWhy = recThought && rec ? rec.why : (auto?.why ?? '')
  const rest = flow.filter((t) => t.id !== primary?.id)
  const elsewhere = prepass.visible.length - (primary ? 1 : 0) - rest.length

  async function decideFirst() {
    const candidates = prepass.visible.slice(0, 80).map((t) => ({
      id: t.id,
      title: t.title || t.raw_content.slice(0, 120),
      effort: t.effort,
      due: t.due_date,
      ageDays: Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000),
      blocked: prepass.blocked.has(t.id),
      goalTitle: goalTitle(t),
    }))
    if (!candidates.length) return
    const out = await ai.run({ actions: candidates })
    if (!out) return
    if ((profile?.settings.autonomy ?? 'suggest') === 'organize') apply(out)
    else setSuggestion(out)
  }
  function apply(out: PrioritizeOutput) {
    const ids = new Set(prepass.visible.map((t) => t.id))
    for (const b of out.buckets) if (ids.has(b.id)) setBucket(b.id, b.bucket)
    if (ids.has(out.recommended.id)) {
      updateProfileSettings({
        recommended_action: { id: out.recommended.id, why: out.recommended.why, at: new Date().toISOString() },
      })
    }
    setSuggestion(null)
  }

  const focusThought = focusId ? thoughts.find((t) => t.id === focusId) : null
  const complete = (t: Thought) => {
    toggleDone(t.id)
    evaporateAt()
    if (rec?.id === t.id) updateProfileSettings({ recommended_action: null })
  }

  // Half of what a real map holds is not work — it is things you need to know.
  // "Pull live LAX→CDG fares, Sept 28 out" is a question with a number for an
  // answer, and until now the only two things this screen could offer it were
  // Focus (sit and stare at it) and Done (pretend you did).
  const primaryAsks = !!primary && isQuestion(primary.title || primary.raw_content)
  // …and the other half is work the agent can actually do. This is the end of
  // the funnel: a thought becomes an idea, an idea is worked into a path, a
  // path rains into actions — and the action you are standing on was the one
  // place the agent had nothing to offer but sympathy.
  const primaryMakes = !!primary && isMakeable(primary.title || primary.raw_content)
  const answerHere = askedFor && primary && askedFor.id === primary.id ? askedFor.out : null
  const draftHere = drafted && primary && drafted.id === primary.id ? drafted : null

  async function doIt(t: Thought) {
    if (asking || offline) return
    setAsking(t.id)
    setAskFailed(null)
    setAskedFor(null)
    setDrafted(null)
    setWaited(0)
    setSizing(null)
    const began = Date.now()
    const tick = setInterval(() => setWaited(Math.round((Date.now() - began) / 1000)), 1000)
    const sz = await sizeUp(t.id, 'draft', 2)
    setSizing(sz)
    const res = await draftThought(t.id, { sizing: sz })
    clearInterval(tick)
    setAsking(null)
    setSizing(null)
    if (res.kind === 'drafted')
      setDrafted({
        id: t.id,
        title: res.title,
        md: draftMarkdown(res.output),
        sources: res.output.sources,
        done: res.done,
      })
    else setAskFailed(res.why ?? 'could not do that just now')
  }

  async function askIt(t: Thought) {
    if (asking || offline) return
    setAsking(t.id)
    setAskFailed(null)
    setAskedFor(null)
    setDrafted(null)
    setWaited(0)
    setSizing(null)
    // How long depends entirely on the question, so a cheap read goes first and
    // then the button says what it is actually doing rather than dimming for an
    // unspecified minute, which reads as broken.
    const began = Date.now()
    const tick = setInterval(() => setWaited(Math.round((Date.now() - began) / 1000)), 1000)
    const sz = await sizeUp(t.id, 'answer', 3)
    setSizing(sz)
    const res = await answerThought(t.id, { sizing: sz })
    clearInterval(tick)
    setAsking(null)
    setSizing(null)
    if (res.kind === 'answered') setAskedFor({ id: t.id, out: res.output })
    else setAskFailed(res.why ?? 'could not get out there just now')
  }

  // 12vh was 102px of nothing above the only sentence on the page. The
  // headline is bigger now and carries the calm on its own.
  return (
    <div className="page" style={{ paddingTop: 'calc(var(--sat) + 7vh)' }}>
      {prepass.visible.length === 0 && (
        <>
          <h1 className="page-title">The current is still</h1>
          <p className="faint">When a cloud rains, its actions flow here — one at a time.</p>
        </>
      )}

      {suggestion && (
        <div className="card" style={{ borderColor: 'rgba(var(--accent-rgb), 0.4)', marginBottom: 'var(--sp-4)' }}>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', marginBottom: 10 }}>
            First: <strong>{thoughts.find((t) => t.id === suggestion.recommended.id)?.title ?? '—'}</strong> —{' '}
            {suggestion.recommended.why}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--accent btn--sm" onClick={() => apply(suggestion)}>
              Let it flow
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setSuggestion(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {primary && !suggestion && (
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-6)' }}>
          <div className="faint" style={{ fontSize: 'var(--fs-label)', marginBottom: 16 }}>
            This first
          </div>
          {/* The one thing you are meant to be doing, at the size of the one
              thing you are meant to be doing.
              It was capped at 340px *and* balanced, and the two together drew a
              narrow column down the middle of a screen with nothing else on it
              — three short lines using two thirds of the width and the rest of
              the glass empty. Balance is right for a headline sitting in a
              column of other things and wrong for the only thing on the page;
              `pretty` fills the measure and only rescues the last line. The
              size scales with the glass, so a wider phone gets bigger words
              rather than more air. */}
          <div
            style={{
              fontSize: 'clamp(25px, 7.2vw, 34px)',
              fontWeight: 300,
              lineHeight: 1.32,
              letterSpacing: '-0.016em',
              margin: '0 auto',
              textWrap: 'pretty',
            }}
          >
            {primary.title || primary.raw_content}
          </div>
          <p className="faint" style={{ fontSize: 'var(--fs-label)', marginTop: 10 }}>
            {primaryWhy}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            {/* When the thing to do is a question, going and finding out is the
                first thing offered, because it is the only one of the three
                that actually moves it. */}
            {primaryAsks && !answerHere && (
              <button
                className="btn btn--primary"
                onClick={() => void askIt(primary)}
                disabled={!!asking || offline}
                // A fixed label while it works. What it is doing varies in
                // length and belongs on the line below; putting it in the
                // button made the button grow mid-press and shunted Done onto
                // a second row, which is the layout moving under your thumb.
                style={{ minWidth: 116 }}
              >
                {asking === primary.id ? 'Answering…' : 'Answer it'}
              </button>
            )}
            {/* And when it is work that can be made, having it made is the
                first thing offered, for the same reason: it is the only one of
                the three that produces anything. */}
            {primaryMakes && !draftHere && (
              <button
                className="btn btn--primary"
                onClick={() => void doIt(primary)}
                disabled={!!asking || offline}
                style={{ minWidth: 116 }}
              >
                {asking === primary.id ? 'Working…' : 'Do it'}
              </button>
            )}
            {/* Focus is for sitting with the thing. While it is being answered
                you are not sitting with it, and the row is better with room. */}
            {asking !== primary.id && (
              <button
                className={(primaryAsks && !answerHere) || (primaryMakes && !draftHere) ? 'btn btn--ghost' : 'btn btn--primary'}
                onClick={() => setFocusId(primary.id)}
              >
                Focus
              </button>
            )}
            <button className="btn btn--ghost" onClick={() => complete(primary)}>
              Done
            </button>
          </div>

          {/* Where the variable-length truth goes: what it is doing, how long
              it has been, and — only when it is genuinely going to be a while —
              that you can put the phone down. An ask that needs nothing looked
              up lands before you could lock anything. */}
          {asking === primary.id && (
            <p className="muted" style={{ fontSize: 'var(--fs-caption)', marginTop: 12 }}>
              {waitingWord(sizing ?? { ...fullDepth(primaryMakes ? 2 : 3), why: 'sizing it up' }, waited)}
              {sizing && !sizing.quick && ' · it keeps going if you lock the phone'}
            </p>
          )}
          {askFailed && !asking && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)', marginTop: 12 }}>
              {askFailed}{' '}
              {/* Retry whichever one failed. Both land here, and sending a
                  failed draft back through askIt would answer a task. */}
              <button
                style={{ textDecoration: 'underline', color: 'inherit' }}
                onClick={() => void (primaryMakes ? doIt(primary) : askIt(primary))}
              >
                try again
              </button>
            </p>
          )}
          {answerHere && (
            <Answered
              out={answerHere}
              onDone={() => {
                complete(primary)
                setAskedFor(null)
              }}
            />
          )}
          {draftHere && (
            <Made
              title={draftHere.title}
              md={draftHere.md}
              sources={draftHere.sources}
              done={draftHere.done}
              onDone={() => {
                complete(primary)
                setDrafted(null)
              }}
            />
          )}
        </div>
      )}

      {ai.status === 'error' && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)', textAlign: 'center', marginBottom: 12 }}>
          {ai.error}{' '}
          <button style={{ textDecoration: 'underline', color: 'inherit' }} onClick={ai.retry}>
            retry
          </button>
        </p>
      )}

      {rest.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <button className="faint" style={{ fontSize: 'var(--fs-label)' }} onClick={() => setShowAll((s) => !s)}>
            {showAll ? '▴ fold the current' : `▾ ${rest.length} more in the current`}
          </button>
          {showAll && (
            <div style={{ display: 'grid', gap: 6, marginTop: 14, textAlign: 'left' }}>
              {rest.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    border: '0.5px solid var(--glass-line)',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--glass)',
                  }}
                >
                  <button
                    aria-label="Complete"
                    onClick={() => complete(t)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: '1.5px solid rgba(255,255,255,0.3)',
                      flexShrink: 0,
                    }}
                  />
                  <button onClick={() => setFocusId(t.id)} style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{t.title || t.raw_content.slice(0, 120)}</div>
                    {(goalTitle(t) || t.due_date) && (
                      <div className="faint" style={{ fontSize: 'var(--fs-caption)', marginTop: 3 }}>
                        {[goalTitle(t), t.due_date ? humanDue(t.due_date, today) : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                  <button
                    aria-label="Snooze one week"
                    className="faint"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + 7)
                      updateThought(t.id, { snooze_until: d.toISOString().slice(0, 10) })
                    }}
                    style={{ padding: '0 4px' }}
                  >
                    ⏾
                  </button>
                </div>
              ))}
            </div>
          )}
          {showAll && prepass.visible.length > 2 && !offline && (
            <button
              className="chip chip--ai"
              style={{ marginTop: 14 }}
              onClick={decideFirst}
              disabled={ai.status === 'running'}
            >
              {ai.status === 'running' ? 'deciding…' : '✦ decide what flows first'}
            </button>
          )}
        </div>
      )}

      {elsewhere > 0 && (
        <p className="faint" style={{ fontSize: 'var(--fs-caption)', textAlign: 'center', marginTop: 'var(--sp-5)' }}>
          {elsewhere} more wait{elsewhere === 1 ? 's' : ''} in{' '}
          {/* the sky, which is the world — this pointed at /think, a route
              that has quietly redirected here for months */}
          <button style={{ textDecoration: 'underline', color: 'inherit' }} onClick={() => navigate('/')}>
            the world
          </button>
        </p>
      )}

      {/* the read on you sits under the one thing to do, never above it */}
      <NoticedPanel openCount={prepass.visible.length} />

      {focusThought && (
        <FocusOverlay
          thought={focusThought}
          from={goalTitle(focusThought)}
          onDone={() => {
            complete(focusThought)
            setFocusId(null)
          }}
          onClose={() => setFocusId(null)}
        />
      )}
    </div>
  )
}
