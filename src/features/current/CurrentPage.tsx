// The Current — one meaningful action, large. Everything else stays folded
// until asked for. Never a task list first.
import { useMemo, useRef, useState } from 'react'
import { useGraph } from '@/store/graph'
import { nextAction } from '@/domain/next-action'
import { prioritizePrepass, todayISO } from '@/domain/prioritize-prepass'
import { humanDate, humanDue } from '@/domain/human-date'
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
import { fullDepth, sizeUp, type Sizing } from '@/features/sky/gaugeFlow'
import Working from './Working'
import type { AnswerOutput } from '@shared/ai/actions/answer'
import { emptiedGroup } from '@/domain/finished'
import { closeGoal, evaporateGoal } from '@/features/sky/finishFlow'
import type { Thought } from '@/domain/types'

export default function CurrentPage() {
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
  /*
   * Open.
   *
   * The rest of the current used to sit behind a fold, and the fold sat in the
   * middle of a screen whose lower half was empty — so the page showed you one
   * action, two closed disclosures floating in the void, and nothing else. The
   * one big thing is right; the emptiness under it was not. What is flowing
   * belongs on the screen where you can glance at it, quietly, under the thing
   * you are meant to do first. It still folds, for the days when one thing is
   * all you want to see.
   */
  const [showAll, setShowAll] = useState(true)
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
  /** …and when it came back with a question rather than an answer. */
  const [askedBack, setAskedBack] = useState<{
    id: string
    ask: string
    because: string
    options: string[]
  } | null>(null)
  const [waited, setWaited] = useState(0)
  const [sizing, setSizing] = useState<Sizing | null>(null)
  /*
   * What just went to rest, said out loud.
   *
   * The snooze was one tap and the row simply vanished — to where, for how
   * long, it never said, and a playtester's verdict was exactly that: "to
   * where, it never said". The sky's version of this gesture answers both
   * ("rising into the high clouds — back tomorrow"); this page answered
   * neither, and it is the page where snoozing happens most.
   */
  const [rested, setRested] = useState<{ id: string; title: string; until: string } | null>(null)
  const restedT = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  // Held up by something else that is still open. Part of the current — it is
  // your work and it is going somewhere — but not something you can pick up,
  // so it is shown apart from what you can. It used to be counted off to "the
  // world" along with everything else, which is how a page with two dozen live
  // actions on it came to say nothing was flowing.
  const held = prepass.visible.filter((t) => prepass.buckets.get(t.id) === 'waiting')
  const heldOn = (t: Thought) => {
    const dep = relationships.find(
      (r) => (r.type === 'depends_on' && r.from_id === t.id) || (r.type === 'blocks' && r.to_id === t.id),
    )
    const otherId = dep ? (dep.type === 'depends_on' ? dep.to_id : dep.from_id) : null
    const other = otherId ? thoughts.find((x) => x.id === otherId) : null
    return other ? (other.title || other.raw_content.slice(0, 60)) : null
  }
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
  // Whatever is neither flowing nor held: something you put in `later` by hand.
  // Snoozed work is not here — that is out of `visible` entirely, by design.
  const aside = prepass.visible.length - (primary ? 1 : 0) - rest.length - held.length

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
    // Ticking the last thing under a goal is the commonest way a goal actually
    // gets finished, and this screen is where most ticking happens. It used to
    // leave the goal open with nothing in it — an orphan drop in the sky, and
    // no moment anywhere in the app where you had completed something.
    const emptied = emptiedGroup(t.id, useGraph.getState().thoughts, relationships)
    if (emptied) setFinished(emptied)
  }
  const [finished, setFinished] = useState<Thought | null>(null)
  const [rose, setRose] = useState<{ title: string; why: string } | null>(null)

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
  const backHere = askedBack && primary && askedBack.id === primary.id ? askedBack : null

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

  async function askIt(t: Thought, question?: string) {
    if (asking || offline) return
    setAsking(t.id)
    setAskFailed(null)
    setAskedFor(null)
    setAskedBack(null)
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
    const res = await answerThought(t.id, { sizing: sz, question })
    clearInterval(tick)
    setAsking(null)
    setSizing(null)
    if (res.kind === 'answered') setAskedFor({ id: t.id, out: res.output })
    // It asked instead of answering. Nothing was written — see applyAnswer —
    // so this is the whole of what happened, and it goes where the answer
    // would have gone rather than into the error line: a question back is not
    // a failure and must not be dressed as one.
    else if (res.kind === 'clarify') setAskedBack({ id: t.id, ...res })
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
            <Working
              sizing={sizing ?? { ...fullDepth(primaryMakes ? 2 : 3), why: 'sizing it up' }}
              sized={!!sizing}
              waited={waited}
            />
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
          {/* It asked back.
              A card and not the error line, because nothing went wrong: the
              question had more than one reading, or wanted something words
              cannot be. Each reading is a button that asks it again that way,
              so the reply is one tap — this screen has no writing box, and a
              question you cannot answer where you are standing is a dead end. */}
          {backHere && !asking && (
            <div className="card" style={{ marginTop: 12 }}>
              <p style={{ fontSize: 'var(--fs-body)', fontWeight: 500 }}>{backHere.ask}</p>
              {backHere.because && (
                <p className="faint" style={{ fontSize: 'var(--fs-label)', marginTop: 6 }}>
                  {backHere.because}
                </p>
              )}
              {backHere.options.map((o) => (
                <button
                  key={o}
                  className="hit"
                  style={{ display: 'block', textAlign: 'left', marginTop: 10, color: 'var(--accent)' }}
                  onClick={() => void askIt(primary, o)}
                >
                  {o}
                </button>
              ))}
            </div>
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

      {rest.length + held.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          {/* Counts the held ones too. A day where everything but the first
              thing is blocked is a real day, and the fold used not to open on
              it at all — you got one action and a silent page. */}
          <button
            className="faint hit"
            style={{ fontSize: 'var(--fs-label)', letterSpacing: '0.06em' }}
            onClick={() => setShowAll((s) => !s)}
          >
            {showAll
              ? `also in the current · ${rest.length + held.length}`
              : `▾ ${rest.length + held.length} more in the current`}
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
                  {/* `hit` is the app's own answer to a control that should look
                      small and be pressable: it keeps its twenty points of ring
                      and gets forty-four points of reach from a transparent
                      overlay. The class has existed in global.css the whole
                      time and this page — the one you tick work off on — used
                      it nowhere. Measured: this and the snooze beside it were
                      20x20 and 20x23. */}
                  <button
                    aria-label="Complete"
                    className="hit"
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
                    className="faint hit"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + 7)
                      const until = d.toISOString().slice(0, 10)
                      updateThought(t.id, { snooze_until: until })
                      if (restedT.current) clearTimeout(restedT.current)
                      setRested({ id: t.id, title: t.title || t.raw_content.slice(0, 60), until })
                      restedT.current = setTimeout(() => setRested(null), 9000)
                    }}
                    style={{ padding: '0 4px' }}
                  >
                    ⏾
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* And what is held up. Shown, not hidden: knowing that four things
              are waiting on one other thing is the most useful shape a day
              has, and it is the reason the primary above is the primary. */}
          {showAll && held.length > 0 && (
            <div style={{ marginTop: 18, textAlign: 'left' }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Waiting on something else
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {held.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: '10px 12px',
                      border: '0.5px solid var(--glass-line)',
                      borderRadius: 'var(--r-md)',
                      opacity: 0.72,
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: 'var(--fs-label)' }}>
                      {t.title || t.raw_content.slice(0, 120)}
                    </div>
                    {heldOn(t) && (
                      <div className="faint" style={{ fontSize: 'var(--fs-caption)', marginTop: 3 }}>
                        after · {heldOn(t)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
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

      {rested && (
        <p className="faint" role="status" style={{ fontSize: 'var(--fs-label)', textAlign: 'center', marginTop: 14 }}>
          “{rested.title}” is resting — back {humanDate(rested.until, today)} ·{' '}
          <button
            className="hit"
            style={{ color: 'var(--accent)' }}
            onClick={() => {
              updateThought(rested.id, { snooze_until: null })
              if (restedT.current) clearTimeout(restedT.current)
              setRested(null)
            }}
          >
            wake it
          </button>
        </p>
      )}

      {/* "N more wait in the world", pointing at the sky, was the line that made
          this page unreadable. It was almost always every open action you had
          — because everything without a due date was filed as `later` — so the
          Current told you your work was in another room, and the room it named
          was the tab you had just come from. What is left here now is only what
          you deliberately put aside. */}
      {aside > 0 && (
        <p className="faint" style={{ fontSize: 'var(--fs-caption)', textAlign: 'center', marginTop: 'var(--sp-5)' }}>
          {aside} set aside for later
        </p>
      )}

      {/* The goal that just ran out of work. Offered, never done for you: "that
          whole thing is finished" is a claim about your work and the agent does
          not get to make it. */}
      {finished && (
        <div className="card" style={{ marginTop: 'var(--sp-5)', textAlign: 'left' }}>
          <p style={{ fontSize: 'var(--fs-label)' }}>
            Nothing left in <strong style={{ fontWeight: 560 }}>{finished.title || finished.raw_content.slice(0, 60)}</strong>.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => {
                const goal = finished
                setFinished(null)
                if (!closeGoal(goal.id)) return
                if (offline) return
                // and what finishing it put in the air — usually nothing
                void evaporateGoal(goal.id).then((r) => {
                  if (r.kind === 'rose') setRose({ title: r.thought.title || r.thought.raw_content, why: r.why })
                })
              }}
            >
              Finish it
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setFinished(null)}>
              Not yet
            </button>
          </div>
        </div>
      )}

      {/* the seventh stage of the cycle, which was a puff of CSS until now */}
      {rose && (
        <div className="card" style={{ marginTop: 'var(--sp-5)', textAlign: 'left' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            That put something in the air
          </div>
          <p style={{ fontSize: 17, lineHeight: 1.4 }}>{rose.title}</p>
          {rose.why && (
            <p className="muted" style={{ fontSize: 'var(--fs-label)', marginTop: 6 }}>
              {rose.why}
            </p>
          )}
          <p className="faint" style={{ fontSize: 'var(--fs-caption)', marginTop: 10 }}>
            It’s in the sky.{' '}
            <button
              onClick={() => setRose(null)}
              style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
            >
              dismiss
            </button>
          </p>
        </div>
      )}

      {/* the read on you sits under the one thing to do, never above it */}
      <NoticedPanel />

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
