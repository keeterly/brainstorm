// Demo mode — a seeded, local-only world for testing the app without
// Supabase or the AI endpoint. Enabled with VITE_DEMO=1 at build time.
import type { Memory, Relationship, Thought } from '@/domain/types'

export const DEMO = import.meta.env.VITE_DEMO === '1'

const now = new Date().toISOString()
const days = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

function th(over: Partial<Thought> & { id: string; raw_content: string }): Thought {
  return {
    user_id: 'demo',
    title: null,
    summary: null,
    type: 'note',
    status: 'open',
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
    created_at: days(3),
    updated_at: days(3),
    completed_at: null,
    ...over,
  }
}
function rel(from: string, to: string, type: Relationship['type']): Relationship {
  return {
    id: `r-${from}-${to}-${type}`,
    user_id: 'demo',
    from_id: from,
    to_id: to,
    type,
    created_by: 'user',
    agent_run_id: null,
    created_at: days(2),
  }
}
function mem(id: string, content: string): Memory {
  return { id, user_id: 'demo', content, source: 'manual', created_at: days(10) }
}

export const DEMO_SEED = {
  userId: 'demo',
  hydrated: true,
  offline: false,
  thoughts: [
    // loose droplets — the mess
    th({ id: 'd1', raw_content: 'What if the campaign used handwritten letters?', title: 'What if the campaign used handwritten letters?', type: 'question', created_at: days(1) }),
    th({ id: 'd2', raw_content: 'Could the collection become a game?', title: 'Could the collection become a game?', type: 'question', created_at: days(2) }),
    th({ id: 'd3', raw_content: 'Order care labels', title: 'Order care labels', type: 'task', due_date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10), created_at: days(4) }),
    th({ id: 'd4', raw_content: 'A pop-up that feels like a listening room', title: 'A pop-up that feels like a listening room', type: 'idea', created_at: days(1) }),
    th({ id: 'd5', raw_content: 'Aged brass hardware — research finishes', title: 'Aged brass hardware', type: 'idea', created_at: days(5) }),
    // a saturated cloud, ready to rain
    th({ id: 'c1', raw_content: 'Theme: SS27 campaign', title: 'SS27 campaign', type: 'goal', created_at: days(6) }),
    th({ id: 'm1', raw_content: 'Letters sealed with wax', title: 'Letters sealed with wax', type: 'idea', created_at: days(5) }),
    th({ id: 'm2', raw_content: 'Shoot on expired film', title: 'Shoot on expired film', type: 'idea', created_at: days(5) }),
    th({ id: 'm3', raw_content: 'What feeling should people leave with?', title: 'What feeling should people leave with?', type: 'question', created_at: days(4) }),
    // finished work — the ocean, and the light it brings
    th({ id: 'o1', raw_content: 'Book the photographer', title: 'Book the photographer', type: 'action', status: 'done', completed_at: days(1), created_at: days(7) }),
  ],
  relationships: [
    rel('m1', 'c1', 'part_of'),
    rel('m2', 'c1', 'part_of'),
    rel('m3', 'c1', 'part_of'),
    rel('d1', 'd4', 'relates_to'),
  ],
  roadmaps: [],
  memories: [mem('me1', 'Two-person team based in Los Angeles'), mem('me2', 'Works best in the morning')],
  artifacts: [],
  profile: {
    id: 'demo',
    display_name: 'demo',
    settings: {} as Record<string, unknown>,
    created_at: now,
  },
  layouts: {},
}
