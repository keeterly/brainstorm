import { describe, expect, it } from 'vitest'
import { computeWorld, looseDroplets } from './engine'
import { saturatedCloud, weatherLine } from './weather'
import { nextBest, toAction } from './interaction'
import type { Relationship, Thought } from '@/domain/types'

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
    due_date: null,
    snooze_until: null,
    project_id: null,
    image_path: null,
    extra: {},
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    completed_at: over.completed_at ?? null,
    ...over,
  }
}
function rel(from: string, to: string, type: Relationship['type']): Relationship {
  return {
    id: crypto.randomUUID(),
    user_id: 'u1',
    from_id: from,
    to_id: to,
    type,
    created_by: 'user',
    agent_run_id: null,
    created_at: '',
  }
}

describe('world engine', () => {
  it('fog rises with loose questions and falls with structure', () => {
    const foggy = computeWorld({
      thoughts: [
        th({ id: 'q1', type: 'question' }),
        th({ id: 'q2', type: 'question' }),
        th({ id: 'q3', type: 'question' }),
        th({ id: 'n1' }),
      ],
      relationships: [],
    })
    const structured = computeWorld({
      thoughts: [th({ id: 'g', type: 'goal' }), th({ id: 'a', type: 'action' })],
      relationships: [rel('a', 'g', 'part_of')],
    })
    expect(foggy.fog).toBeGreaterThan(structured.fog)
  })

  it('light breaks through with recent completion', () => {
    const dark = computeWorld({ thoughts: [th({ id: 'n' })], relationships: [] })
    const bright = computeWorld({
      thoughts: [th({ id: 'd', status: 'done', completed_at: new Date().toISOString() })],
      relationships: [],
    })
    expect(bright.light).toBeGreaterThan(dark.light)
  })

  it('members of a cloud are not loose droplets', () => {
    const g = th({ id: 'g', type: 'goal' })
    const a = th({ id: 'a', type: 'idea' })
    const b = th({ id: 'b', type: 'idea' })
    const loose = looseDroplets([g, a, b], [rel('a', 'g', 'part_of')])
    expect(loose.map((t) => t.id)).toEqual(['b'])
  })
})

describe('weather + interaction', () => {
  const cloud = th({ id: 'c', type: 'concept', title: 'Letters' })
  const members = [th({ id: 'm1', type: 'idea' }), th({ id: 'm2', type: 'idea' }), th({ id: 'm3', type: 'question' })]
  const parts = members.map((m) => rel(m.id, 'c', 'part_of'))

  it('detects a saturated cloud (3+ members, no actions yet)', () => {
    const sat = saturatedCloud({ thoughts: [cloud, ...members], relationships: parts, profile: null })
    expect(sat?.id).toBe('c')
    expect(weatherLine({ thoughts: [cloud, ...members], relationships: parts, profile: null })).toContain('saturated')
  })

  it('a rained cloud is no longer saturated', () => {
    const action = th({ id: 'act', type: 'action' })
    const sat = saturatedCloud({
      thoughts: [cloud, ...members, action],
      relationships: [...parts, rel('act', 'c', 'part_of')],
      profile: null,
    })
    expect(sat).toBeNull()
  })

  it('nextBest prefers rain over the recommended action', () => {
    const profile = {
      id: 'u1',
      display_name: null,
      settings: { recommended_action: { id: 'm1', why: 'w', at: '' } },
      created_at: '',
    }
    const best = nextBest([cloud, ...members], parts, profile)
    expect(best.kind).toBe('rain')
  })

  it('toAction phrases each type as a doable step', () => {
    expect(toAction(th({ type: 'task', title: 'email the mill' }))).toBe('Email the mill')
    expect(toAction(th({ type: 'question', title: 'Who is it for?' }))).toContain('Answer:')
    expect(toAction(th({ type: 'goal', title: 'Launch the line' }))).toContain('first step')
    expect(toAction(th({ type: 'idea', title: 'A letters campaign' }))).toContain('exploring')
  })
})
