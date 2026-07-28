import { useMemo, useState } from 'react'
import { useGraph } from '@/store/graph'
import { useAction } from '@/ai/useAction'
import type { RoadmapOutput } from '@shared/ai/actions/generate-roadmap'
import type { Thought } from '@/domain/types'

// Roadmap for a goal: streamed generation → validated phases → real action
// thoughts (part_of the goal, depends_on edges) + a roadmaps row that
// references them, so the roadmap always shows live status.
export function RoadmapSection({ goal }: { goal: Thought }) {
  const roadmaps = useGraph((s) => s.roadmaps)
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const offline = useGraph((s) => s.offline)
  const addThought = useGraph((s) => s.addThought)
  const addRelationship = useGraph((s) => s.addRelationship)
  const addRoadmap = useGraph((s) => s.addRoadmap)
  const toggleDone = useGraph((s) => s.toggleDone)
  const updateProfileSettings = useGraph((s) => s.updateProfileSettings)

  const ai = useAction<RoadmapOutput>('generate_roadmap')
  const [progress, setProgress] = useState(0)

  const roadmap = roadmaps.find((r) => r.goal_thought_id === goal.id && r.status === 'active')
  const byId = useMemo(() => new Map(thoughts.map((t) => [t.id, t])), [thoughts])

  async function generate() {
    setProgress(0)
    const relatedIds = new Set(
      relationships
        .filter((r) => r.from_id === goal.id || r.to_id === goal.id)
        .flatMap((r) => [r.from_id, r.to_id]),
    )
    relatedIds.delete(goal.id)
    const relatedThoughts = [...relatedIds]
      .map((id) => byId.get(id))
      .filter((t): t is Thought => !!t)
      .slice(0, 60)
      .map((t) => ({ id: t.id, title: t.title || t.raw_content.slice(0, 100), type: t.type, summary: t.summary }))

    const out = await ai.run(
      {
        goal: { id: goal.id, title: goal.title || goal.raw_content.slice(0, 100), type: 'goal', summary: goal.summary },
        raw_content: goal.raw_content,
        successCriteria: (goal.extra?.successCriteria as string[] | undefined) ?? undefined,
        relatedThoughts: relatedThoughts.length ? relatedThoughts : undefined,
      },
      { onDelta: () => setProgress((p) => p + 1) },
    )
    if (!out) return

    // tempId → real thought. Existing steps with identical titles are reused
    // so regenerating a roadmap doesn't duplicate them.
    const existingChildren = relationships
      .filter((r) => r.type === 'part_of' && r.to_id === goal.id)
      .map((r) => byId.get(r.from_id))
      .filter((t): t is Thought => !!t)
    const tempToReal = new Map<string, string>()
    const phases = out.phases.map((p) => ({
      title: p.title,
      why: p.why,
      milestones: p.milestones,
      risks: p.risks,
      actions: p.actions.map((a) => {
        const existing = existingChildren.find(
          (c) => (c.title || '').toLowerCase() === a.title.toLowerCase(),
        )
        const th =
          existing ??
          addThought({ raw_content: a.title, title: a.title, type: 'action', effort: a.effort, source: 'ai' })
        if (!existing) addRelationship(th.id, goal.id, 'part_of', 'ai')
        tempToReal.set(a.tempId, th.id)
        return { thought_id: th.id, title: a.title }
      }),
    }))
    // Dependency edges between the created actions.
    for (const p of out.phases) {
      for (const a of p.actions) {
        const fromId = tempToReal.get(a.tempId)
        if (!fromId) continue
        for (const dep of a.dependsOn) {
          const toId = tempToReal.get(dep)
          if (toId && toId !== fromId) addRelationship(fromId, toId, 'depends_on', 'ai')
        }
      }
    }
    addRoadmap({
      id: crypto.randomUUID(),
      goal_thought_id: goal.id,
      title: out.title,
      phases,
      status: 'active',
      agent_run_id: null,
    })
    const nextId = tempToReal.get(out.immediateNext.tempId)
    if (nextId) {
      updateProfileSettings({
        recommended_action: { id: nextId, why: out.immediateNext.why, at: new Date().toISOString() },
      })
    }
  }

  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <h2 style={{ fontSize: 'var(--fs-md)' }}>Roadmap</h2>
        <button className="btn btn--sm btn--ghost" onClick={generate} disabled={ai.status === 'running' || offline}>
          {ai.status === 'running' ? 'Building…' : roadmap ? '↻ Regenerate' : '✦ Generate roadmap'}
        </button>
      </div>

      {ai.status === 'running' && (
        <div className="card ai-working" aria-busy="true">
          <p className="muted" style={{ fontSize: 'var(--fs-label)' }}>
            Thinking through phases, dependencies, and the best first step…
          </p>
          <div className="mono faint" style={{ fontSize: 'var(--fs-caption)', marginTop: 4 }}>
            {progress > 0 ? `receiving structure (${progress})` : 'starting'}
          </div>
        </div>
      )}

      {ai.status === 'error' && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)' }}>{ai.error}</p>
          <button className="btn btn--sm btn--ghost" onClick={ai.retry} style={{ marginTop: 8 }}>
            Retry
          </button>
        </div>
      )}

      {roadmap && ai.status !== 'running' && (
        <div style={{ display: 'grid', gap: 10 }}>
          {roadmap.phases.map((p, i) => (
            <div key={i} className="card">
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span className="mono faint">{String(i + 1).padStart(2, '0')}</span>
                <strong>{p.title}</strong>
              </div>
              <p className="muted" style={{ fontSize: 'var(--fs-label)', margin: '4px 0 8px' }}>{p.why}</p>
              {p.actions.map((a) => {
                const th = byId.get(a.thought_id)
                const done = th?.status === 'done'
                return (
                  <div key={a.thought_id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <button
                      aria-label={done ? 'Reopen' : 'Complete'}
                      onClick={() => toggleDone(a.thought_id)}
                      style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--line-mid)', background: done ? 'var(--ink)' : 'transparent', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 'var(--fs-label)', textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--ink-faint)' : 'var(--ink)' }}>
                      {a.title}
                    </span>
                  </div>
                )
              })}
              {p.risks.length > 0 && (
                <p className="faint" style={{ fontSize: 'var(--fs-caption)', marginTop: 6 }}>
                  ⚠ {p.risks.join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
