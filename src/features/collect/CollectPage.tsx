// Collect — capture. Nothing else. One field, at most one quiet card below
// it, and a single faint line telling you the sky exists.
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { parseCapture } from '@/domain/parse-blocks'
import { runAction } from '@/ai/client'
import type { ClassifyOutput } from '@shared/ai/actions/classify-thought'
import { absorbIsEmpty, type AbsorbOutput } from '@shared/ai/actions/absorb'
import { useVoice } from '@/features/capture/useVoice'
import { splashAt } from '@/world/Atmosphere'
import { nextBest } from '@/world/interaction'
import { looseDroplets, isCloudType } from '@/world/engine'
import type { Thought } from '@/domain/types'
import { learn } from '@/ai/memoryFlow'

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
  const [absorbing, setAbsorbing] = useState(false)
  const [report, setReport] = useState<string | null>(null)
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

  // Memory learns passively from what the user pours in — never blocking,
  // never loud. One shared door, so a fact learned here reconciles against
  // what is already believed instead of piling on top of it.
  const learnQuietly = useCallback((t: string) => {
    if (t.length < 120) return
    void learn(t, { from: 'something you wrote down' })
  }, [])

  // Absorb — the sky rearranges instead of duplicating. If the AI sees nothing
  // to adjust (or fails), the text falls through to plain capture: never lost.
  const absorbCapture = useCallback(async () => {
    const v = text.trim()
    if (!v || absorbing) return
    const open = thoughts.filter((t) => t.status === 'open')
    setAbsorbing(true)
    setReport(null)
    try {
      const { output } = await runAction<AbsorbOutput>('absorb', {
        text: v,
        thoughts: open.slice(0, 200).map((t) => ({
          id: t.id,
          title: t.title || t.raw_content.slice(0, 200),
          type: t.type,
          summary: t.summary,
          due: t.due_date,
        })),
      })
      if (absorbIsEmpty(output)) {
        capture()
        setReport('Captured as new — nothing in the sky needed adjusting.')
        return
      }
      const known = new Set(open.map((t) => t.id))
      for (const u of output.updates) {
        if (!known.has(u.id)) continue
        const patch: Partial<Thought> = {}
        if (u.title) patch.title = u.title
        if (u.summary !== undefined) patch.summary = u.summary
        if (u.due_date !== undefined) patch.due_date = u.due_date
        updateThought(u.id, patch)
      }
      for (const id of output.completions) {
        if (known.has(id)) updateThought(id, { status: 'done', completed_at: new Date().toISOString() })
      }
      for (const s of output.snoozes) {
        if (known.has(s.id)) updateThought(s.id, { status: 'snoozed', snooze_until: s.until })
      }
      const tempIds = new Map<string, string>()
      for (const a of output.additions) {
        const created = addThought({ raw_content: a.title, title: a.title, type: a.type, due_date: a.due_date ?? null })
        tempIds.set(a.tempId, created.id)
      }
      for (const a of output.additions) {
        if (!a.part_of) continue
        const parent = known.has(a.part_of) ? a.part_of : tempIds.get(a.part_of)
        const childId = tempIds.get(a.tempId)
        if (parent && childId && parent !== childId) addRelationship(childId, parent, 'part_of')
      }
      setReport(output.note || 'Absorbed — the sky rearranged itself.')
      splashAt(window.innerWidth * (0.25 + Math.random() * 0.5), window.innerHeight - 150)
      setText('')
      learnQuietly(v)
      if (taRef.current) taRef.current.style.height = 'auto'
    } catch {
      capture()
      setReport('Captured as new — absorb was unavailable just now.')
    } finally {
      setAbsorbing(false)
    }
  }, [text, absorbing, thoughts, capture, updateThought, addThought, addRelationship, learnQuietly])

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
          <div style={{ display: 'flex', gap: 8 }}>
            {!offline && thoughts.filter((t) => t.status === 'open').length >= 3 && (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => void absorbCapture()}
                disabled={!text.trim() || absorbing}
                title="Let the sky rearrange around this instead of adding a duplicate"
              >
                {absorbing ? '◐ Absorbing…' : '✦ Absorb'}
              </button>
            )}
            <button className="btn btn--primary btn--sm" onClick={capture} disabled={!text.trim() || absorbing}>
              Capture
            </button>
          </div>
        </div>
      </div>

      {report && (
        <p className="muted" style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-label)', textAlign: 'center' }}>
          {report}
        </p>
      )}

      {/* one quiet card — a question if the AI just asked one, else the single
          next thing, else nothing at all */}
      {question ? (
        <div className="card" style={{ marginTop: 'var(--sp-5)', borderColor: 'rgba(var(--accent-rgb), 0.4)' }}>
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
          style={{ marginTop: 'var(--sp-5)', width: '100%', textAlign: 'left', borderColor: 'rgba(var(--accent-rgb), 0.4)' }}
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
          style={{ marginTop: 'var(--sp-5)', width: '100%', textAlign: 'left', borderColor: 'rgba(var(--accent-rgb), 0.4)' }}
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
