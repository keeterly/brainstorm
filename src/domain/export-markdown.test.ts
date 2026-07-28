import { describe, expect, it } from 'vitest'
import { exportMarkdown } from './export-markdown'
import type { Thought, Relationship } from './types'

function th(over: Partial<Thought>): Thought {
  return {
    id: over.id ?? crypto.randomUUID(),
    user_id: 'u1',
    raw_content: over.raw_content ?? 'x',
    title: over.title ?? null,
    summary: null,
    type: over.type ?? 'note',
    status: over.status ?? 'open',
    bucket: null,
    source: 'text',
    confidence: null,
    urgency: null,
    importance: null,
    effort: null,
    due_date: over.due_date ?? null,
    snooze_until: null,
    project_id: null,
    image_path: null,
    extra: {},
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    completed_at: null,
    ...over,
  }
}

describe('exportMarkdown', () => {
  it('renders goals with checkboxed steps and loose thoughts by type', () => {
    const goal = th({ id: 'g', type: 'goal', title: 'Launch', due_date: '2026-08-15' })
    const stepDone = th({ id: 's1', type: 'action', title: 'Write brief', status: 'done' })
    const stepOpen = th({ id: 's2', type: 'action', title: 'Book studio' })
    const idea = th({ id: 'i', type: 'idea', title: 'Letters campaign' })
    const rels: Relationship[] = [
      { id: 'r1', user_id: 'u1', from_id: 's1', to_id: 'g', type: 'part_of', created_by: 'user', agent_run_id: null, created_at: '' },
      { id: 'r2', user_id: 'u1', from_id: 's2', to_id: 'g', type: 'part_of', created_by: 'user', agent_run_id: null, created_at: '' },
    ]
    const md = exportMarkdown(
      {
        thoughts: [goal, stepDone, stepOpen, idea],
        relationships: rels,
        roadmaps: [],
        memories: [{ id: 'm', user_id: 'u1', content: 'LA based', source: 'manual', created_at: '' }],
      },
      new Date('2026-07-28T12:00:00Z'),
    )
    expect(md).toContain('### Launch (due 2026-08-15)')
    expect(md).toContain('- [x] Write brief')
    expect(md).toContain('- [ ] Book studio')
    expect(md).toContain('## Ideas')
    expect(md).toContain('- Letters campaign')
    expect(md).toContain('## Memory')
    expect(md).toContain('- LA based')
    // steps under a goal must not repeat as loose actions
    expect(md).not.toContain('## Actions')
  })
})
