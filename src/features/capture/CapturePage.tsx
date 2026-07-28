import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { parseCapture } from '@/domain/parse-blocks'
import { runAction } from '@/ai/client'
import type { ClassifyOutput } from '@shared/ai/actions/classify-thought'
import { TypeBadge } from '@/components/TypeBadge'
import { useVoice } from './useVoice'
import type { Thought } from '@/domain/types'

export default function CapturePage() {
  const navigate = useNavigate()
  const thoughts = useGraph((s) => s.thoughts)
  const addThought = useGraph((s) => s.addThought)
  const addRelationship = useGraph((s) => s.addRelationship)
  const updateThought = useGraph((s) => s.updateThought)
  const profile = useGraph((s) => s.profile)
  const offline = useGraph((s) => s.offline)

  const [text, setText] = useState('')
  const [questions, setQuestions] = useState<Record<string, string>>({}) // thoughtId -> clarifying q
  const taRef = useRef<HTMLTextAreaElement>(null)

  const voice = useVoice(
    useCallback((t: string) => {
      setText((prev) => (prev ? `${prev} ${t}` : t))
    }, []),
  )

  const classify = useCallback(
    async (thought: Thought) => {
      // AI understanding is additive — capture already succeeded.
      try {
        const { output } = await runAction<ClassifyOutput>('classify_thought', {
          raw_content: thought.raw_content,
        })
        const patch: Partial<Thought> = {
          type: output.type,
          title: output.title,
          summary: output.summary || null,
          confidence: output.confidence,
        }
        if (output.suggestedDue && !thought.due_date) patch.due_date = output.suggestedDue
        updateThought(thought.id, patch)
        if (output.clarifyingQuestion) {
          setQuestions((q) => ({ ...q, [thought.id]: output.clarifyingQuestion! }))
        }
      } catch {
        /* thought stays a plain note — user can classify manually */
      }
    },
    [updateThought],
  )

  const capture = useCallback(() => {
    const v = text.trim()
    if (!v) return
    const blocks = parseCapture(v)
    for (const b of [...blocks].reverse()) {
      if (b.children.length) {
        const goal = addThought({
          raw_content: b.title,
          title: b.title,
          type: 'goal',
          due_date: b.due,
        })
        for (const c of b.children) {
          const child = addThought({ raw_content: c, title: c, type: 'action' })
          addRelationship(child.id, goal.id, 'part_of')
        }
      } else {
        const t = addThought({ raw_content: b.body, due_date: b.due, source: voice.listening ? 'voice' : 'text' })
        if (!offline) void classify(t)
      }
    }
    setText('')
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.focus()
    }
  }, [text, addThought, addRelationship, classify, offline, voice.listening])

  const recent = thoughts.filter((t) => t.status !== 'archived').slice(0, 12)
  const rec = profile?.settings.recommended_action
  const recThought = rec ? thoughts.find((t) => t.id === rec.id && t.status === 'open') : null

  return (
    <div className="page">
      <h1 className="page-title">What is on your mind?</h1>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <textarea
          ref={taRef}
          value={text}
          data-testid="capture-input"
          onChange={(e) => {
            setText(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 320)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !text.includes('\n')) {
              e.preventDefault()
              capture()
            }
          }}
          placeholder={'Anything — messy is fine.\nA heading with bullet lines becomes a plan. "by friday" sets a date.'}
          rows={3}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: 'var(--sp-4)',
            background: 'transparent',
            fontSize: 'var(--fs-md)',
            lineHeight: 1.5,
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--sp-2) var(--sp-3)',
            borderTop: '1px solid var(--line)',
          }}
        >
          {voice.supported ? (
            <button
              className={`btn btn--sm ${voice.listening ? 'btn--accent' : 'btn--ghost'}`}
              onClick={voice.listening ? voice.stop : voice.start}
              aria-pressed={voice.listening}
            >
              {voice.listening ? '● Listening…' : '🎤 Voice'}
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn--primary btn--sm" onClick={capture} disabled={!text.trim()}>
            Capture
          </button>
        </div>
      </div>

      {recThought && rec && (
        <Link to="/focus" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ marginTop: 'var(--sp-4)', borderColor: 'var(--accent)' }}>
            <div className="mono" style={{ color: 'var(--accent-ink)', marginBottom: 4 }}>
              NEXT ACTION
            </div>
            <div style={{ fontWeight: 600 }}>{recThought.title || recThought.raw_content}</div>
            <p className="muted" style={{ marginTop: 4, fontSize: 'var(--fs-label)' }}>
              {rec.why}
            </p>
          </div>
        </Link>
      )}

      <h2 style={{ fontSize: 'var(--fs-md)', margin: 'var(--sp-6) 0 var(--sp-3)' }}>Recent</h2>
      {recent.length === 0 && (
        <p className="faint">
          Nothing captured yet. Try typing an idea, a worry, half a plan — anything.
        </p>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {recent.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/thought/${t.id}`)}
            style={{
              textAlign: 'left',
              display: 'grid',
              gap: 4,
              padding: 'var(--sp-3)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)',
              background: 'var(--bg-raised)',
              opacity: t.status === 'done' ? 0.55 : 1,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <TypeBadge type={t.type} ai={t.confidence != null} />
              {t.due_date && (
                <span className="mono faint" style={{ fontSize: 'var(--fs-caption)' }}>
                  due {t.due_date}
                </span>
              )}
            </div>
            <div
              style={{
                fontWeight: 500,
                textDecoration: t.status === 'done' ? 'line-through' : 'none',
              }}
            >
              {t.title || t.raw_content.slice(0, 140)}
            </div>
            {questions[t.id] && (
              <div
                className="chip chip--ai"
                style={{ justifySelf: 'start', whiteSpace: 'normal', height: 'auto', padding: '4px 10px' }}
              >
                {questions[t.id]}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
