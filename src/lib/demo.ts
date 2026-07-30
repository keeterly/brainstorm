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
    // a few loose droplets — enough to feel the water, not a crowd
    th({ id: 'd1', raw_content: 'What if the campaign used handwritten letters?', title: 'What if the campaign used handwritten letters?', type: 'question', created_at: days(1) }),
    th({ id: 'd3', raw_content: 'Order care labels', title: 'Order care labels', type: 'task', due_date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10), created_at: days(4) }),
    th({ id: 'd4', raw_content: 'A pop-up that feels like a listening room', title: 'A pop-up that feels like a listening room', type: 'idea', created_at: days(1) }),
    // one saturated cloud, ready to rain
    th({ id: 'c1', raw_content: 'Theme: SS27 campaign', title: 'SS27 campaign', type: 'goal', created_at: days(6) }),
    th({ id: 'm1', raw_content: 'Letters sealed with wax', title: 'Letters sealed with wax', type: 'idea', created_at: days(5) }),
    th({ id: 'm2', raw_content: 'Shoot on expired film', title: 'Shoot on expired film', type: 'idea', created_at: days(5) }),
    th({ id: 'm3', raw_content: 'What feeling should people leave with?', title: 'What feeling should people leave with?', type: 'question', created_at: days(4) }),
    // A question and a job of work, side by side under the same goal. Half of
    // what a real map holds is not work at all — it is things you need to know
    // — and the demo showed none of that.
    th({ id: 'q1', raw_content: 'Pull live LAX→CDG premium economy fares, Sept 28 out / Oct 9 back', title: 'Pull live LAX→CDG premium economy fares, Sept 28 out / Oct 9 back', type: 'action', created_at: days(2) }),
    th({ id: 'm4', raw_content: 'Book once the fare is confirmed reasonable', title: 'Book once the fare is confirmed reasonable', type: 'action', created_at: days(2) }),
    // finished work — the ocean, and the light it brings
    th({ id: 'o1', raw_content: 'Book the photographer', title: 'Book the photographer', type: 'action', status: 'done', completed_at: days(1), created_at: days(7) }),
  ],
  relationships: [
    rel('m1', 'c1', 'part_of'),
    rel('m2', 'c1', 'part_of'),
    rel('m3', 'c1', 'part_of'),
    // threaded to the goal rather than inside it, which is how these actually
    // arrive: a loose question that turned out to belong to something
    rel('q1', 'c1', 'relates_to'),
    rel('m4', 'q1', 'depends_on'),
  ],
  roadmaps: [],
  memories: [mem('me1', 'Two-person team based in Los Angeles'), mem('me2', 'Works best in the morning')],
  // What ⚡ brings back. The demo used to show every part of the app except the
  // one that does the most work.
  artifacts: [
    {
      id: 'ar1',
      user_id: 'demo',
      thought_id: 'c1',
      title: 'Shooting a lookbook on expired film',
      content_md: [
        '# Shooting a lookbook on expired film',
        '',
        '## What I found',
        '- **Expired stock shifts colour before it loses speed** — the cast arrives years before the grain does',
        '- **Rate it a stop slower for each decade past its date** — under-exposure is what kills a frame, not age',
        '- **Labs will push it, but ask first** — a few refuse anything they cannot predict',
        '',
        '## The way through',
        '1. **Buy two rolls from the same batch** — one to test, one to shoot, so what you learn still applies',
        '2. **Shoot the test in the light you will use** — expired stock reacts to the light, not to the meter',
        '3. **Book the lab before the shoot** — turnaround on hand-processed rolls is the thing that slips',
        '',
        '## Where this goes wrong',
        '- Mixing batches, so the test tells you nothing about the shoot',
        '- Heat-stored film: the cast is unpredictable rather than warm',
        '',
        '## Sources',
        '- [Film Photography Project — shooting expired film](https://filmphotographyproject.com/expired-film)',
      ].join('\n'),
      sources: [
        { title: 'Shooting expired film', url: 'https://filmphotographyproject.com/expired-film' },
        { title: '', url: 'https://www.lomography.com/magazine/expired-film-guide' },
      ],
      agent_run_id: null,
      created_at: days(2),
    },
  ],
  profile: {
    id: 'demo',
    display_name: 'demo',
    settings: {} as Record<string, unknown>,
    created_at: now,
  },
  layouts: {},
}

/**
 * What the engine says in demo mode.
 *
 * The demo has no key and no server, so every AI surface in it used to be a
 * button that failed. That is a poor way to show the one thing the app is for.
 * These are canned, and labelled as such where it matters — the point is that
 * the shape of a real reply can be seen and read, not that it is true.
 */
export const DEMO_OUTPUT: Record<string, unknown> = {
  answer: {
    asked: 'What does LAX→CDG premium economy cost, 28 September out and 9 October back?',
    answer:
      '$1,180–$1,420 round trip, and $1,214 is the number to beat. Air France is showing that on AF65 out / AF66 ' +
      'back for those exact dates, booked direct; Delta sells the same aircraft about $60 higher. Nothing on the ' +
      'route has gone under $1,050 in the last month, so $1,214 is a fair fare rather than a bargain worth waiting on.',
    facts: [
      { label: 'Cheapest found', value: '$1,214 round trip', note: 'AF65 out, AF66 back, booked direct with Air France' },
      { label: 'Aircraft', value: '777-300ER', note: '2-4-2 premium economy, 38" pitch — the better of the two AF layouts' },
      { label: 'Award option', value: '65,000 Flying Blue miles + €230', note: 'No Promo Reward on these dates today; the rate is the standard one' },
      { label: 'Fare class', value: 'W, changeable for $250', note: 'The cheaper N fare is non-refundable' },
    ],
    asOf: 'Checked today. Transatlantic premium economy moves daily and steps up sharply inside 21 days of travel.',
    unknown: [
      {
        what: 'The exact live ITA Matrix fare basis',
        toKnow: 'ITA cannot be queried by anything but a person — run it yourself if you need the routing rules',
      },
    ],
    next: [],
    sources: [
      { title: 'Air France', url: 'https://wwws.airfrance.us/' },
      { title: 'Flying Blue', url: 'https://wwws.airfrance.us/flyingblue' },
    ],
    learned: [],
    settled: false,
  },
}
