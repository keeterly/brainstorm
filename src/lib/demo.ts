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
function mem(id: string, content: string, kind: string, strength = 1, usedDaysAgo?: number): Memory {
  return {
    id,
    user_id: 'demo',
    content,
    source: 'manual',
    created_at: days(40),
    kind,
    strength,
    // When it was last actually carried into a prompt. Left out on purpose for
    // one of them, so the demo shows the state worth seeing: a fact that has
    // ridden along unread since the day it was written.
    last_used_at: usedDaysAgo === undefined ? null : days(usedDaysAgo),
    archived_at: null,
  }
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
    // …and the third kind, which is the end of the funnel: a step the agent can
    // sit down and actually produce. The demo showed the app planning work and
    // researching work and never once making any.
    th({ id: 'm5', raw_content: 'Draft the buyer note for SS27', title: 'Draft the buyer note for SS27', type: 'action', created_at: days(3) }),
    // A wall of references, so the demo can show the one act nothing else in
    // this market performs. Four flat swatches rather than photographs — the
    // point being demonstrated is that the app has an opinion about a wall,
    // and a canned opinion needs no real pictures behind it.
    th({ id: 'p1', raw_content: 'Photo', title: 'Photo', type: 'note', created_at: days(2), extra: { img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4dmQFVsQwtCQAgZCQgTmmFq0AAAAASUVORK5CYII=', full: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4dmQFVsQwtCQAgZCQgTmmFq0AAAAASUVORK5CYII=' } }),
    th({ id: 'p2', raw_content: 'Photo', title: 'Photo', type: 'note', created_at: days(2), extra: { img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPYtKAHK2IYWhIAuvp3gY99I/cAAAAASUVORK5CYII=', full: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPYtKAHK2IYWhIAuvp3gY99I/cAAAAASUVORK5CYII=' } }),
    th({ id: 'p3', raw_content: 'Photo', title: 'Photo', type: 'note', created_at: days(2), extra: { img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGN4cecEVsQwtCQAuHmjAWIL0CIAAAAASUVORK5CYII=', full: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGN4cecEVsQwtCQAuHmjAWIL0CIAAAAASUVORK5CYII=' } }),
    th({ id: 'p4', raw_content: 'Photo', title: 'Photo', type: 'note', created_at: days(2), extra: { img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGOY1lWDFTEMLQkARaBnASbjtPgAAAAASUVORK5CYII=', full: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGOY1lWDFTEMLQkARaBnASbjtPgAAAAASUVORK5CYII=' } }),
    th({ id: 'w1', raw_content: 'References', title: 'References', type: 'goal', created_at: days(2) }),
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
    rel('m5', 'c1', 'part_of'),
    rel('p1', 'w1', 'part_of'),
    rel('p2', 'w1', 'part_of'),
    rel('p3', 'w1', 'part_of'),
    rel('p4', 'w1', 'part_of'),
    rel('w1', 'c1', 'part_of'),
  ],
  roadmaps: [],
  // Three kinds, because the kinds are the point: a constraint and a pattern
  // ride along on everything, and a fact about the storefront only comes when
  // the storefront comes up.
  memories: [
    mem('me1', 'Two-person label based in Los Angeles', 'fact', 5, 2),
    mem('me2', 'Works best in the morning', 'pattern', 9, 0),
    mem('me3', 'Writes to buyers in plain sentences, never bullet lists', 'preference', 3, 1),
    mem('me4', 'Will not travel during production weeks', 'constraint', 2, 21),
    // never once carried — the one the page has something to say about
    mem('me5', 'The trim supplier in Como closes for all of August', 'fact', 1),
  ],
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

/**
 * The wall the demo shows for `find_like`.
 *
 * The real thing reads each page's own Open Graph image; the demo has no
 * server, so these stand in for the works. Flat gradients rather than
 * borrowed photographs — the point of the demo is that the shape of the
 * reply can be seen, and putting somebody else's picture of somebody else's
 * sculpture in a public build to make a screenshot look better is not a
 * trade worth making.
 */
export const DEMO_PREVIEW: Record<string, string> = {
    'https://pinacoteca.org.br/acervo': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMzYTM2MzAiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNjMmJjYjAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
    'https://christojeanneclaude.net/artworks': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNTYwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyYjJkMzMiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNkNWQwYzQiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjU2MCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
    'https://museosansevero.it/en/collection': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDIwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyNDI1MjkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiNGIwYTgiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQyMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
    'https://www.labiennale.org/en/art/2024': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNTIwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyYTJiMzAiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNjOWM0YmIiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjUyMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
    'https://www.henry-moore.org/collections': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM0YTQ3NDAiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNkOGQzYzgiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
    'https://smak.be/en/collection': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDYwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMxZTIwMjQiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiOWI2YWUiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQ2MCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
    'https://www.artforum.com/features/butoh': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyNjI2MmEiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM5ZDlhOTQiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
    'https://www.centrepompidou.fr/en/collection': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzQwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMzMzMwMmIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNjZmM5YmQiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjM0MCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
}

export const DEMO_OUTPUT: Record<string, unknown> = {
  // The commonest real answer, and the one the old code could not give.
  remember: { ops: [] },
  // …and its twin at the other end of the cycle. Most work closes and opens
  // nothing, and an app that says so is one you can believe when it doesn't.
  evaporate: { rises: null, note: 'that one is simply done' },
  // What falls out of a full cloud: what these ideas turned out to be about,
  // and the two things that follow from it. Not the members with a verb in
  // front of them, which is what this replaced.
  rain: {
    read: 'One campaign built on things that cannot be reproduced',
    steps: [
      {
        tempId: 's1',
        title: 'Shoot one roll of the expired stock before booking anything',
        why: 'the whole look rests on it and nobody has seen it yet',
        effort: 2,
        dependsOn: [],
      },
      {
        tempId: 's2',
        title: 'Write the wax-letter copy for six buyers, by name',
        why: 'six letters is the campaign; a hundred is a mailout',
        effort: 3,
        dependsOn: [],
      },
      {
        tempId: 's3',
        title: 'Pick the one feeling the room has to leave people with',
        why: 'the pop-up and the letters are both waiting on this',
        effort: 1,
        dependsOn: ['s1'],
      },
    ],
    missing: [],
    learned: [],
    note: 'three things, and one of them settles the other two',
  },
  // The one act nothing else in this market performs: an opinion about the
  // references you gathered. Every moodboard tool will hold them beautifully;
  // none of them will tell you what is not on the wall.
  look: {
    read: 'Light doing the work the clothes are supposed to do',
    threads: [
      { what: 'Everything is back-lit, and nothing is lit from the front', where: 'the window shots, the veil, the last three on the roll' },
      { what: 'Fabric is always moving', where: 'nothing is hanging still — it is caught mid-turn or mid-fall' },
      { what: 'Nobody is looking at the camera', where: 'and in half of them there is no face at all' },
    ],
    missing: [
      'Not one of these shows a garment you could describe to a buyer',
      'No interiors — the whole wall is outdoors, in one kind of afternoon',
    ],
    name: 'Light through fabric',
    learned: [],
    note: 'the light is the idea — the clothes have not turned up yet',
  },
  // ⚡ itself — the action the whole app is shaped around, and the one the
  // demo could not show. Without this it was the single button here that
  // still failed, on the surface people open the demo to look at.
  deepen: {
    read: 'A campaign that only works if the film does',
    found: [
      { point: 'Expired stock shifts colour before it loses speed', why: 'the cast arrives years before the grain does' },
      { point: 'Labs will push it, but ask first', why: 'a few refuse anything they cannot predict' },
    ],
    steps: [
      {
        tempId: 'd1',
        title: 'Shoot one roll of the expired stock before booking anything',
        why: 'the whole look rests on it and nobody has seen it yet',
        effort: 2,
        dependsOn: [],
      },
      {
        tempId: 'd2',
        title: 'Book the lab before the shoot, not after',
        why: 'turnaround on hand-processed rolls is the thing that slips',
        effort: 1,
        dependsOn: ['d1'],
      },
    ],
    watchOuts: ['Mixing batches, so the test tells you nothing about the shoot'],
    sources: [{ title: 'Shooting expired film', url: 'https://filmphotographyproject.com/expired-film' }],
    learned: [],
    note: 'two things, and the first one settles the other',
  },
  gauge: {
    depth: 'deep',
    needs: ['live LAX→CDG premium economy fares for those dates', 'Flying Blue award availability'],
    why: 'checking two things first',
  },
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
  find_like: {
    reading: 'A cloth-draped seated figure — the De Bruyckere / Moore lineage, mass without edges',
    finds: [
      {
        title: 'City of Refuge III',
        who: 'Berlinde De Bruyckere',
        where: 'Venice Biennale, 2024',
        why: 'faceless cloth-draped figures, the fabric carrying the identity',
        url: 'https://www.labiennale.org/en/art/2024',
      },
      {
        title: 'Draped Seated Woman',
        who: 'Henry Moore',
        where: 'Yorkshire Sculpture Park',
        why: 'mass without edges — the drape is the whole form',
        url: 'https://www.henry-moore.org/collections',
      },
      {
        title: 'Untitled (Shroud)',
        who: 'Kris Martin',
        where: 'S.M.A.K., Ghent',
        why: 'a covered body at rest, in a white room, at your scale',
        url: 'https://smak.be/en/collection',
      },
      {
        title: 'Ankoku Butoh, 1965',
        who: 'Hijikata Tatsumi',
        where: 'Keio University archive',
        why: 'the body erased under cloth rather than dressed in it',
        url: 'https://www.artforum.com/features/butoh',
      },
      {
        title: 'Cloth-covered figure study',
        who: 'Christian Boltanski',
        where: 'Centre Pompidou',
        why: 'the covering as the subject, lit from a single side',
        url: 'https://www.centrepompidou.fr/en/collection',
      },
      {
        title: 'Shroud studies',
        who: 'Anna Maria Maiolino',
        where: 'Pinacoteca, São Paulo',
        why: 'cloth as the whole gesture',
        url: 'https://pinacoteca.org.br/acervo',
      },
      {
        title: 'Wrapped Reichstag',
        who: 'Christo and Jeanne-Claude',
        where: 'Berlin, 1995',
        why: 'a form known only by its covering',
        url: 'https://christojeanneclaude.net/artworks',
      },
      {
        title: 'Veiled Christ',
        who: 'Giuseppe Sanmartino',
        where: 'Cappella Sansevero, Naples',
        why: 'the drape carrying every edge of the body',
        url: 'https://museosansevero.it/en/collection',
      },
    ],
    searches: [
      'Berlinde De Bruyckere blanket sculpture',
      'Henry Moore draped seated figure',
      'Butoh shrouded body photography',
      'Christian Boltanski cloth figure installation',
    ],
  },
}
