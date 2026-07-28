import type { ThoughtType } from '@/domain/types'

// Type chips over the dark world — mineral tints on glass.
const LABEL: Record<ThoughtType, string> = {
  note: 'Note',
  idea: 'Idea',
  task: 'Task',
  action: 'Action',
  question: 'Question',
  problem: 'Problem',
  goal: 'Goal',
  decision: 'Decision',
  reference: 'Reference',
  constraint: 'Constraint',
  inspiration: 'Inspiration',
  concept: 'Theme',
}

export function TypeBadge({ type, ai }: { type: ThoughtType; ai?: boolean }) {
  const tint = `var(--tint-${type}, var(--ink-soft))`
  return (
    <span
      className="mono"
      title={ai ? 'Classified by AI — tap the thought to change' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 9px',
        borderRadius: 'var(--r-full)',
        border: `0.5px solid color-mix(in srgb, ${tint} 55%, transparent)`,
        background: `color-mix(in srgb, ${tint} 12%, transparent)`,
        color: tint,
        fontSize: 'var(--fs-caption)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {LABEL[type] ?? type}
      {ai && <span aria-hidden>·ai</span>}
    </span>
  )
}
