// Collect — capture. Nothing else. One field, at most one quiet card below
// it, and a single faint line telling you the sky exists.
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { parseCapture } from '@/domain/parse-blocks'
import { runAction } from '@/ai/client'
import type { ClassifyOutput } from '@shared/ai/actions/classify-thought'
import { useVoice } from '@/features/capture/useVoice'
import { splashAt } from '@/world/Atmosphere'
import { nextBest } from '@/world/interaction'
import { looseDroplets, isCloudType } from '@/world/engine'
import type { Thought } from '@/domain/types'

export default function CollectPage() {
  const navigate = useNavigate()
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const addThought = useGraph((s) => s.addThought)
  const addRelationship = useGraph((s) => s.addRelationship)
  const updateThought = useGraph((s) => s.updateThought)
  const profile = useGraph((s) => s.profile)
  const offline = useGraph((s) => s.offline)

  const [text, setText] = useState('')
  const [question, setQuestion] = useState<{ id: string; q: string } | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const voice = useVoice(
    useCallback((t: string) => {
      setText((prev) => (prev ? `${prev} ${t}` : t))
    }, []),
  )

  const classify = useCallback(
    async (thought: Thought) => {
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
        if (output.clarifyingQuestion) setQuestion({ id: thought.id, q: output.clarifyingQuestion })
      } catch {
        /* stays a plain note — the world works without AI */
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
        const goal = addThought({ raw_content: b.title, title: b.title, type: 'goal', due_date: b.due })
        for (const c of b.children) {
          const child = addThought({ raw_content: c, title: c, type: 'action' })
          addRelationship(child.id, goal.id, 'part_of')
        }
      } else {
        const t = addThought({
          raw_content: b.body,
          due_date: b.due,
          source: voice.listening ? 'voice' : 'text',
        })
        if (!offline) void classify(t)
      }
    }
    splashAt(window.innerWidth * (0.25 + Math.random() * 0.5), window.innerHeight - 150)
    setText('')
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.focus()
    }
  }, [text, addThought, addRelationship, classify, offline, voice.listening])

  const best = nextBest(thoughts, relationships, profile)
  const loose = looseDroplets(thoughts, relationships).length
  const clouds = thoughts.filter((t) => t.status === 'open' && isCloudType(t)).length
  const skyline =
    loose + clouds === 0
      ? null
      : [
          loose ? `${loose} thought${loose === 1 ? '' : 's'}` : null,
          clouds ? `${clouds} cloud${clouds === 1 ? '' : 's'}` : null,
        ]
          .filter(Boolean)
          .join(' · ') + ' in the sky'

  return (
    <div className="page" style={{ paddingTop: 'calc(var(--sat) + 14vh)' }}>
      <h1 className="page-title" style={{ marginBottom: 'var(--sp-4)' }}>
        What is on your mind?
      </h1>

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
          placeholder="Anything — messy is fine."
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
            borderTop: '0.5px solid rgba(255,255,255,0.09)',
          }}
        >
          {voice.supported ? (
            <button
              className={`btn btn--sm ${voice.listening ? 'btn--accent' : 'btn--ghost'}`}
              onClick={voice.listening ? voice.stop : voice.start}
              aria-pressed={voice.listening}
            >
              {voice.listening ? '● Listening…' : '🎤'}
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn--primary btn--sm" onClick={capture} disabled={!text.trim()}>
            Capture
          </button>
        </div>
      </div>

      {/* one quiet card — a question if the AI just asked one, else the single
          next thing, else nothing at all */}
      {question ? (
        <div className="card" style={{ marginTop: 'var(--sp-5)', borderColor: 'rgba(122,215,255,0.4)' }}>
          <p style={{ fontWeight: 550 }}>{question.q}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn--sm btn--ghost" onClick={() => navigate(`/thought/${question.id}`)}>
              Answer
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => setQuestion(null)}>
              Not now
            </button>
          </div>
        </div>
      ) : best.kind === 'rain' ? (
        <button
          onClick={() => navigate('/think')}
          className="card"
          style={{ marginTop: 'var(--sp-5)', width: '100%', textAlign: 'left', borderColor: 'rgba(122,215,255,0.4)' }}
        >
          <div style={{ fontWeight: 600 }}>“{best.cloud.title}” is ready to rain</div>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', marginTop: 4 }}>
            Open the sky when you're ready.
          </p>
        </button>
      ) : best.kind === 'action' ? (
        <button
          onClick={() => navigate('/current')}
          className="card"
          style={{ marginTop: 'var(--sp-5)', width: '100%', textAlign: 'left', borderColor: 'rgba(122,215,255,0.4)' }}
        >
          <div style={{ fontWeight: 600 }}>{best.thought.title || best.thought.raw_content}</div>
          <p className="muted" style={{ fontSize: 'var(--fs-label)', marginTop: 4 }}>
            {best.why}
          </p>
        </button>
      ) : null}

      {skyline && (
        <button
          onClick={() => navigate('/think')}
          className="faint"
          style={{ display: 'block', margin: 'var(--sp-6) auto 0', fontSize: 'var(--fs-label)' }}
        >
          ◉ {skyline}
        </button>
      )}
    </div>
  )
}
