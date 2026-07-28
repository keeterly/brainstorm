import type { ThoughtType } from '@/domain/types'

const LOOK: Record<ThoughtType, { label: string; bg: string; fg: string }> = {
  note: { label: 'Note', bg: 'var(--bg-sunken)', fg: 'var(--ink-soft)' },
  idea: { label: 'Idea', bg: '#eef2ee', fg: 'var(--map-1)' },
  task: { label: 'Task', bg: 'var(--bg-sunken)', fg: 'var(--ink-soft)' },
  action: { label: 'Action', bg: '#e9eef4', fg: 'var(--map-4)' },
  question: { label: 'Question', bg: '#f2ecdd', fg: 'var(--warn)' },
  problem: { label: 'Problem', bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  goal: { label: 'Goal', bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
  decision: { label: 'Decision', bg: '#efe9f3', fg: 'var(--map-5)' },
  reference: { label: 'Reference', bg: 'var(--bg-sunken)', fg: 'var(--ink-faint)' },
  constraint: { label: 'Constraint', bg: 'var(--bg-sunken)', fg: 'var(--ink-soft)' },
  inspiration: { label: 'Inspiration', bg: '#f3ede4', fg: 'var(--map-3)' },
  concept: { label: 'Theme', bg: '#e9efef', fg: 'var(--map-6)' },
}

export function TypeBadge({ type, ai }: { type: ThoughtType; ai?: boolean }) {
  const look = LOOK[type] ?? LOOK.note
  return (
    <span
      className="mono"
      title={ai ? 'Classified by AI — tap the thought to change' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--r-full)',
        background: look.bg,
        color: look.fg,
        fontSize: 'var(--fs-caption)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {look.label}
      {ai && <span aria-hidden>·ai</span>}
    </span>
  )
}
