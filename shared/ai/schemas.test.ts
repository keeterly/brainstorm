import { describe, expect, it } from 'vitest'
import { ACTION_REGISTRY } from './registry'
import { classifyThought } from './actions/classify-thought'
import { findRelated } from './actions/find-related'
import { makeMindMap } from './actions/make-mind-map'
import { generateRoadmap } from './actions/generate-roadmap'
import { prioritize } from './actions/prioritize'

describe('action registry', () => {
  it('every action has schemas, a version, and a prompt builder', () => {
    for (const def of Object.values(ACTION_REGISTRY)) {
      expect(def.version).toBeGreaterThan(0)
      expect(def.inputSchema).toBeDefined()
      expect(def.outputSchema).toBeDefined()
      const prompt = def.buildPrompt(sampleInput(def.name), {
        nowISO: '2026-07-28T12:00:00Z',
        tzOffsetMin: -420,
        memory: ['Works best in the morning'],
      })
      expect(prompt.system).toContain('Brainstorm')
      expect(prompt.system).toContain('Works best in the morning')
      expect(prompt.user.length).toBeGreaterThan(20)
    }
  })
})

function sampleInput(name: string): never {
  const ref = { id: 'aaaa', title: 'Sample thought', type: 'idea', summary: null }
  const inputs: Record<string, unknown> = {
    classify_thought: { raw_content: 'need to email supplier by friday' },
    summarize: { raw_content: 'a long rambling thought about the collection' },
    clarify_question: { raw_content: 'maybe a pop-up?' },
    find_related: { subject: ref, candidates: [{ ...ref, id: 'bbbb' }] },
    to_goal: { raw_content: 'launch the campaign' },
    make_mind_map: { thoughts: [ref, { ...ref, id: 'bbbb' }] },
    generate_roadmap: { goal: ref, raw_content: 'launch the campaign' },
    prioritize: { actions: [{ id: 'aaaa', title: 'do a thing' }] },
    remember: { text: 'I prefer mornings', known: [] },
    absorb: { text: 'the buyer moved our meeting to friday', thoughts: [ref] },
    organize: { text: 'a long messy dump about the campaign and the pop-up', thoughts: [ref], spoken: true },
    name_pool: { members: ['shoot on expired film', 'letters sealed with wax'] },
    cluster: { loose: [ref], pools: [{ id: 'p1', name: 'SS27 show', members: ['book the space'] }] },
    deepen: { subject: ref, context: ['book the space'] },
    answer: { subject: ref, context: ['arrive by September 28'] },
    draft: { subject: ref, alongside: ['book the space'], known: [] },
    gauge: { subject: ref, context: ['book the space'], kind: 'plan' },
    reshape: { subject: ref, inside: [ref], news: 'the studio fell through, Ana offered her garage' },
    notice: { thoughts: [ref], pools: [], recentlyDone: [] },
  }
  return inputs[name] as never
}

describe('absorb output schema', () => {
  const absorb = ACTION_REGISTRY.absorb
  it('accepts a full adjustment set', () => {
    const r = absorb.outputSchema.safeParse({
      updates: [{ id: 'aaaa', due_date: '2026-08-01' }],
      completions: ['bbbb'],
      snoozes: [{ id: 'cccc', until: '2026-08-04' }],
      additions: [
        { tempId: 't1', title: 'Confirm the room block', type: 'goal' },
        { tempId: 't2', title: 'Email the hotel', type: 'action', part_of: 't1' },
      ],
      note: 'Moved the buyer meeting and added a room-block goal.',
    })
    expect(r.success).toBe(true)
  })
  it('accepts the all-empty "nothing to adjust" shape', () => {
    const r = absorb.outputSchema.safeParse({ updates: [], completions: [], snoozes: [], additions: [], note: '' })
    expect(r.success).toBe(true)
  })
  it('rejects bad dates and unknown thought types', () => {
    expect(
      absorb.outputSchema.safeParse({
        updates: [{ id: 'aaaa', due_date: 'friday' }],
        completions: [],
        snoozes: [],
        additions: [],
        note: '',
      }).success,
    ).toBe(false)
    expect(
      absorb.outputSchema.safeParse({
        updates: [],
        completions: [],
        snoozes: [],
        additions: [{ tempId: 't1', title: 'x', type: 'wish' }],
        note: '',
      }).success,
    ).toBe(false)
  })
})

describe('classify_thought output schema', () => {
  it('accepts a valid classification', () => {
    const r = classifyThought.outputSchema.safeParse({
      type: 'idea',
      confidence: 0.8,
      title: 'Campaign letters',
      summary: 'Use handwritten letters in the campaign',
      suggestedDue: null,
      clarifyingQuestion: null,
    })
    expect(r.success).toBe(true)
  })
  it('rejects unknown types and bad dates', () => {
    expect(
      classifyThought.outputSchema.safeParse({
        type: 'random',
        confidence: 0.8,
        title: 't',
        summary: '',
        suggestedDue: null,
        clarifyingQuestion: null,
      }).success,
    ).toBe(false)
    expect(
      classifyThought.outputSchema.safeParse({
        type: 'idea',
        confidence: 0.8,
        title: 't',
        summary: '',
        suggestedDue: 'friday',
        clarifyingQuestion: null,
      }).success,
    ).toBe(false)
  })
})

describe('find_related output schema', () => {
  it('rejects invalid relationship types', () => {
    expect(
      findRelated.outputSchema.safeParse({
        related: [{ id: 'x', relType: 'reminds_me_of', reason: 'nope' }],
      }).success,
    ).toBe(false)
  })
})

describe('make_mind_map output schema', () => {
  it('accepts mixed id/tempId edges', () => {
    const r = makeMindMap.outputSchema.safeParse({
      newNodes: [{ tempId: 'n1', title: 'Theme', type: 'concept' }],
      edges: [
        { from: { id: 'existing-1' }, to: { tempId: 'n1', title: 'Theme', type: 'concept' }, relType: 'part_of' },
      ],
      insight: 'Two clusters emerged',
    })
    expect(r.success).toBe(true)
  })
  it('rejects new nodes of disallowed type', () => {
    expect(
      makeMindMap.outputSchema.safeParse({
        newNodes: [{ tempId: 'n1', title: 'Theme', type: 'goal' }],
        edges: [],
        insight: '',
      }).success,
    ).toBe(false)
  })
})

describe('generate_roadmap output schema', () => {
  it('requires at least one phase with actions and an immediateNext', () => {
    const good = generateRoadmap.outputSchema.safeParse({
      title: 'Launch',
      phases: [
        {
          title: 'Prep',
          why: 'Foundation',
          milestones: ['brief done'],
          actions: [{ tempId: 'a1', title: 'Write brief', effort: 2, dependsOn: [] }],
          risks: [],
        },
      ],
      immediateNext: { tempId: 'a1', why: 'Unblocks everything and takes 30 minutes' },
    })
    expect(good.success).toBe(true)
    const empty = generateRoadmap.outputSchema.safeParse({ title: 'x', phases: [], immediateNext: { tempId: 'a1', why: 'y' } })
    expect(empty.success).toBe(false)
  })
})

describe('prioritize output schema', () => {
  it('rejects invalid buckets', () => {
    expect(
      prioritize.outputSchema.safeParse({
        buckets: [{ id: 'a', bucket: 'someday', reason: 'r' }],
        recommended: { id: 'a', why: 'w' },
      }).success,
    ).toBe(false)
  })
})

describe('organize output schema', () => {
  const organize = ACTION_REGISTRY.organize
  it('accepts drops, pools and links', () => {
    const r = organize.outputSchema.safeParse({
      drops: [
        { tempId: 't1', text: 'a pop-up that feels like a listening room', type: 'idea' },
        { tempId: 't2', text: 'shoot on expired film', type: 'idea' },
      ],
      pools: [{ name: 'SS27 mood', members: ['t1', 't2'] }],
      links: [{ a: 't1', b: 'aaaa' }],
      note: 'Two threads: the room, and the film.',
    })
    expect(r.success).toBe(true)
  })
  it('rejects a pool of one and an unknown thought type', () => {
    const base = { drops: [], links: [], note: '' }
    expect(organize.outputSchema.safeParse({ ...base, pools: [{ name: 'x', members: ['t1'] }] }).success).toBe(false)
    expect(
      organize.outputSchema.safeParse({
        ...base,
        pools: [],
        drops: [{ tempId: 't1', text: 'x', type: 'vibe' }],
      }).success,
    ).toBe(false)
  })
})

describe('organize reads pictures', () => {
  const organize = ACTION_REGISTRY.organize
  const ctx = { nowISO: '2026-07-29T12:00:00Z', tzOffsetMin: -420, memory: [] }
  it('attaches the image and tells the model what it is looking at', () => {
    const p = organize.buildPrompt(
      { text: '', thoughts: [], image: { mediaType: 'image/jpeg', dataB64: 'AAAA' } },
      ctx,
    )
    expect(p.images).toEqual([{ mediaType: 'image/jpeg', dataB64: 'AAAA' }])
    expect(p.user).toContain('An image is attached')
    // no empty quoted block when the picture is the whole message
    expect(p.user).not.toContain('Text:')
  })
  it('stays text-only when there is no picture', () => {
    const p = organize.buildPrompt({ text: 'a messy dump', thoughts: [] }, ctx)
    expect(p.images).toBeUndefined()
    expect(p.user).toContain('Text:')
  })
  it('rejects an image type the API cannot read', () => {
    expect(
      organize.inputSchema.safeParse({
        text: '',
        thoughts: [],
        image: { mediaType: 'image/heic', dataB64: 'AAAA' },
      }).success,
    ).toBe(false)
  })
})

describe('name_pool', () => {
  const namePool = ACTION_REGISTRY.name_pool
  it('asks for the specific thing rather than a category', () => {
    const p = namePool.buildPrompt(
      { members: ['pay the sales tax', 'finish setting up Klaviyo'] },
      { nowISO: '2026-07-29T12:00:00Z', tzOffsetMin: -420, memory: [] },
    )
    expect(p.user).toContain('pay the sales tax')
    expect(p.user).toContain('not the category')
  })
  it('needs at least two members to name anything', () => {
    expect(namePool.inputSchema.safeParse({ members: ['just one'] }).success).toBe(false)
    expect(namePool.inputSchema.safeParse({ members: ['a', 'b'] }).success).toBe(true)
  })
})

describe('deepen — the ⚡ that goes and finds out', () => {
  const deepen = ACTION_REGISTRY.deepen
  const ctx = { nowISO: '2026-07-29T12:00:00Z', tzOffsetMin: -420, memory: ['Two-person label in LA'] }

  it('is allowed to go and look things up', () => {
    expect(deepen.searchMaxUses).toBeGreaterThan(0)
  })
  it('asks for the specific thing, not a restatement', () => {
    const p = deepen.buildPrompt(
      { subject: { id: 'g1', title: 'Get a $100k SBA loan' }, context: [] },
      ctx,
    )
    expect(p.system).toContain('Search the web')
    expect(p.user).toContain('Get a $100k SBA loan')
    expect(p.user).toContain('name it back')
    // it should be told not to hand back what the user already wrote
    expect(p.user).toContain('could not have written themselves')
  })
  it('carries what is already inside, so it does not repeat you', () => {
    const p = deepen.buildPrompt(
      { subject: { id: 'g1', title: 'SS27 show' }, context: ['book the space', 'buyer invitations'] },
      ctx,
    )
    expect(p.user).toContain('Already inside it')
    expect(p.user).toContain('buyer invitations')
  })
  it('reads a picture as the subject when one is attached', () => {
    const p = deepen.buildPrompt(
      {
        subject: { id: 'd1', title: 'Photo' },
        context: [],
        image: { mediaType: 'image/jpeg', dataB64: 'AAAA' },
      },
      ctx,
    )
    expect(p.images).toEqual([{ mediaType: 'image/jpeg', dataB64: 'AAAA' }])
    expect(p.user).toContain('An image is attached')
    expect(p.user).toContain('makers, materials or techniques'.split(',')[0])
  })
  it('accepts a full result and rejects a shapeless one', () => {
    const good = deepen.outputSchema.safeParse({
      read: 'A 7(a) loan for working capital, not a 504',
      found: [{ point: '7(a) caps at $5M; 504 is for property', why: 'You want cash, so 7(a)' }],
      steps: [
        { tempId: 's1', title: 'Pull two years of business tax returns', why: 'Every lender opens with this', effort: 2, dependsOn: [] },
        { tempId: 's2', title: 'Book a call with an SBA preferred lender', why: 'They can approve without SBA review', effort: 1, dependsOn: ['s1'] },
      ],
      watchOuts: ['Personal guarantee is required above 20% ownership'],
      sources: [{ title: 'SBA 7(a) overview', url: 'https://www.sba.gov/x' }],
      learned: ['Runs a two-person label and does the finance herself'],
      note: 'It is a 7(a) — here is the order to do it in.',
    })
    expect(good.success).toBe(true)
    // no steps is not an answer
    expect(
      deepen.outputSchema.safeParse({ read: 'x', found: [], steps: [], watchOuts: [], sources: [], learned: [], note: '' })
        .success,
    ).toBe(false)
  })
  it('needs an effort a person can act on', () => {
    const bad = deepen.outputSchema.safeParse({
      read: 'x',
      found: [],
      steps: [{ tempId: 's1', title: 'do it', why: '', effort: 9, dependsOn: [] }],
      watchOuts: [],
      sources: [],
      learned: [],
      note: '',
    })
    expect(bad.success).toBe(false)
  })
})

describe('answer — the other half of ⚡, for the things that are questions', () => {
  const answer = ACTION_REGISTRY.answer
  const ctx = { nowISO: '2026-07-30T12:00:00Z', tzOffsetMin: -420, memory: ['Two-person label in LA'] }
  const good = {
    asked: 'What does LAX→CDG premium economy cost, Sept 28 out / Oct 9 back?',
    answer: '$1,180–$1,420 round trip. Air France is showing $1,214 direct on AF65/AF66 for those exact dates.',
    facts: [{ label: 'Cheapest found', value: '$1,214 round trip', note: 'AF65 out, AF66 back, booked direct' }],
    asOf: 'Checked today; transatlantic premium economy moves daily.',
    unknown: [{ what: 'The live ITA fare basis', toKnow: 'ITA cannot be queried programmatically — run it yourself' }],
    next: [],
    sources: [{ title: 'Air France', url: 'https://wwws.airfrance.us/x' }],
    learned: ['Flies LAX→CDG for fashion week'],
    settled: true,
  }

  it('is allowed to go and look things up', () => {
    expect(answer.searchMaxUses).toBeGreaterThan(0)
    expect(answer.background).toBe(true)
  })

  it('is told in as many words not to hand back the errand', () => {
    // the entire reason this action exists rather than reusing deepen
    const p = answer.buildPrompt(
      { subject: { id: 'q1', title: 'Pull live LAX→CDG premium economy fares' }, context: [] },
      ctx,
    )
    expect(p.system).toContain('answering one question, not planning one')
    expect(p.system).toContain('is not an answer')
    expect(p.user).toContain('Pull live LAX→CDG premium economy fares')
  })

  it('is told to give the range rather than invent a figure it cannot source', () => {
    const p = answer.buildPrompt({ subject: { id: 'q1', title: 'x' }, context: [] }, ctx)
    expect(p.system).toContain('never invent a precise number')
  })

  it('carries the neighbours, because they are most of the question', () => {
    const p = answer.buildPrompt(
      {
        subject: { id: 'q1', title: 'Fares for LAX→CDG' },
        context: ['Arrive by September 28'],
        under: 'SS27 Lookbook & Collection Prep',
      },
      ctx,
    )
    expect(p.user).toContain('It sits under: SS27 Lookbook & Collection Prep')
    expect(p.user).toContain('Arrive by September 28')
  })

  it('answers a question *about* the subject when one is asked, rather than the subject', () => {
    // Standing in front of "Memory architecture proof of concept" and wanting
    // to know what mem 2.0 is had no gesture at all, because the only question
    // this action could answer was the thing itself.
    const p = answer.buildPrompt(
      {
        subject: { id: 'g1', title: 'Memory architecture proof of concept' },
        context: ['Decide storage architecture'],
        question: 'what is mem 2.0?',
      },
      ctx,
    )
    expect(p.user).toContain('Answer their question')
    expect(p.user).toContain('what is mem 2.0?')
    // and the subject is still there, as the frame rather than the question
    expect(p.user).toContain('Memory architecture proof of concept')
    expect(p.user).toContain('not the question')
  })

  it('is still answering the subject itself when nothing was asked about it', () => {
    const p = answer.buildPrompt({ subject: { id: 'q1', title: 'Fares for LAX→CDG' }, context: [] }, ctx)
    expect(p.user).toContain('Answer this.')
    expect(p.user).not.toContain('Answer their question')
  })

  it('reads a picture as part of the question when one is attached', () => {
    const p = answer.buildPrompt(
      { subject: { id: 'q1', title: 'What fabric is this?' }, context: [], image: { mediaType: 'image/jpeg', dataB64: 'AAAA' } },
      ctx,
    )
    expect(p.images).toEqual([{ mediaType: 'image/jpeg', dataB64: 'AAAA' }])
  })

  it('accepts an answer with nothing left over, which is the usual shape', () => {
    expect(answer.outputSchema.safeParse(good).success).toBe(true)
  })

  it('will not accept an empty answer, whatever else came with it', () => {
    expect(answer.outputSchema.safeParse({ ...good, answer: '' }).success).toBe(false)
  })

  it('caps the follow-ups, so answering cannot quietly become task-making', () => {
    const three = [1, 2, 3].map((n) => ({ tempId: `n${n}`, title: `do ${n}`, why: '', effort: 1 }))
    expect(answer.outputSchema.safeParse({ ...good, next: three }).success).toBe(true)
    expect(answer.outputSchema.safeParse({ ...good, next: [...three, { tempId: 'n4', title: 'do 4', why: '', effort: 1 }] }).success).toBe(false)
  })

  it('makes it say whether the asking is finished', () => {
    const without: Record<string, unknown> = { ...good }
    delete without.settled
    expect(answer.outputSchema.safeParse(without).success).toBe(false)
  })
})

describe('draft — the end of the funnel, where the work actually gets made', () => {
  const draft = ACTION_REGISTRY.draft
  const ctx = { nowISO: '2026-07-30T12:00:00Z', tzOffsetMin: -420, memory: ['Two-person label in LA'] }
  const good = {
    title: 'SS27 buyer note — first draft',
    body: '## The season\n\nSS27 is thirty pieces, cut in [mill name] silk…',
    check: [{ what: 'The mill name in the first line', why: 'left blank — I could not find it' }],
    assumed: ['The drop is still September'],
    blocked: [],
    learned: ['Writes to buyers in plain sentences, never bullet lists'],
    sources: [],
    done: false,
  }

  it('is told to make the thing rather than describe it', () => {
    const p = draft.buildPrompt(
      { subject: { id: 'a1', title: 'Draft the buyer note' }, alongside: [], known: [] },
      ctx,
    )
    expect(p.system).toContain('the thing itself')
    expect(p.system).toContain('forbidden from handing the task back')
    expect(p.user).toContain('Draft the buyer note')
  })

  it('carries the goal and the neighbouring steps, so it does not do a neighbour’s job', () => {
    const p = draft.buildPrompt(
      {
        subject: { id: 'a1', title: 'Draft the buyer note' },
        under: 'SS27 Lookbook & Collection Prep',
        alongside: ['Book the studio', 'Send the linesheet'],
        known: ['The drop moved to September'],
        found: 'Buyers confirmed for the 14th.',
        intent: 'keep it under 200 words',
      },
      ctx,
    )
    expect(p.user).toContain('It is one step of: SS27 Lookbook & Collection Prep')
    expect(p.user).toContain('not yours to do here')
    expect(p.user).toContain('Send the linesheet')
    expect(p.user).toContain('The drop moved to September')
    expect(p.user).toContain('Buyers confirmed for the 14th.')
    expect(p.user).toContain('keep it under 200 words')
  })

  it('has room for a real deliverable, which is the whole point of it', () => {
    expect(draft.maxTokens).toBeGreaterThanOrEqual(6000)
    expect(draft.modelTier).toBe('smart')
  })

  it('accepts a draft with blanks left in it', () => {
    expect(draft.outputSchema.safeParse(good).success).toBe(true)
  })

  it('will not accept an empty body, whatever else came with it', () => {
    expect(draft.outputSchema.safeParse({ ...good, body: '' }).success).toBe(false)
  })

  it('makes it say whether the step can be ticked off', () => {
    const without: Record<string, unknown> = { ...good }
    delete without.done
    expect(draft.outputSchema.safeParse(without).success).toBe(false)
  })
})

describe('gauge — how much work the ask is worth', () => {
  const gauge = ACTION_REGISTRY.gauge
  const ctx = { nowISO: '2026-07-30T12:00:00Z', tzOffsetMin: -420, memory: [] }

  it('is the cheapest call in the app, because it runs in front of every other one', () => {
    expect(gauge.modelTier).toBe('fast')
    expect(gauge.maxTokens).toBeLessThanOrEqual(500)
    // it must not go and look things up in order to decide whether to look
    // things up
    expect(gauge.searchMaxUses).toBe(0)
    expect(gauge.background).toBeFalsy()
  })

  it('is told which way being wrong is expensive', () => {
    const p = gauge.buildPrompt({ subject: { id: 'g1', title: 'SS27 Lookbook' }, context: [], kind: 'plan' }, ctx)
    expect(p.system).toContain('not symmetric')
    expect(p.system).toContain('their own work')
    expect(p.user).toContain('SS27 Lookbook')
  })

  it('knows whether a plan or an answer is coming next', () => {
    const plan = gauge.buildPrompt({ subject: { id: 'g1', title: 'x' }, context: [], kind: 'plan' }, ctx)
    const ask = gauge.buildPrompt({ subject: { id: 'g1', title: 'x' }, context: [], kind: 'answer' }, ctx)
    expect(plan.user).toContain('the real way through')
    expect(ask.user).toContain('the answer to this')
  })

  it('accepts the three depths and nothing else', () => {
    for (const depth of ['known', 'light', 'deep']) {
      expect(gauge.outputSchema.safeParse({ depth, needs: [], why: 'x' }).success, depth).toBe(true)
    }
    expect(gauge.outputSchema.safeParse({ depth: 'exhaustive', needs: [], why: 'x' }).success).toBe(false)
  })
})

describe('the search ceiling belongs to the action', () => {
  it('every action that may search declares how much it may search', () => {
    for (const def of Object.values(ACTION_REGISTRY)) {
      if (def.searchMaxUses === undefined) continue
      expect(def.searchMaxUses, def.name).toBeGreaterThanOrEqual(0)
      // a ceiling nobody would ever want to pay for is not a ceiling
      expect(def.searchMaxUses, def.name).toBeLessThanOrEqual(8)
    }
  })
})

describe('running ⚡ on the same goal twice', () => {
  it('is told, in as many words, not to hand back what is already there', () => {
    // a real goal came back with twenty-five things in it and six duplicate
    // pairs: "Complete Forms 1919 and 413 for each 20%+ owner" alongside
    // "Complete Forms 1919, 912 (if flagged), and 413 for each 20%+ owner"
    const p = ACTION_REGISTRY.deepen.buildPrompt(
      {
        subject: { id: 'g1', title: 'VENIA funding readiness' },
        context: ['Assemble the financial packet: 3 yrs tax returns, current P&L, balance sheet, debt schedule'],
      },
      { nowISO: '2026-07-30T12:00:00Z', tzOffsetMin: -420, memory: [] },
    )
    expect(p.user).toContain('Nothing that is already inside it')
    expect(p.user).toContain('arrives as a duplicate')
    // and it still gets the list to compare against
    expect(p.user).toContain('Assemble the financial packet')
  })
})

describe('remember — memory that reconciles instead of accumulating', () => {
  const remember = ACTION_REGISTRY.remember
  const ctx = { nowISO: '2026-07-30T12:00:00Z', tzOffsetMin: -420, memory: [] }
  const known = [
    { id: 'm1', content: 'Two-person team based in Los Angeles', kind: 'fact' },
    { id: 'm2', content: 'Works best in the morning', kind: 'pattern' },
  ]

  it('costs nothing and cannot go looking things up', () => {
    // it runs after every capture, answer and draft; weight here is weight
    // everywhere, and a reconciler that searches the web is a different feature
    expect(remember.modelTier).toBe('fast')
    expect(remember.searchMaxUses).toBe(0)
    expect(remember.background).toBeFalsy()
  })

  it('shows it what it already believes, by id, so it can say "I know"', () => {
    const p = remember.buildPrompt({ text: 'we are two people in LA', known }, ctx)
    expect(p.user).toContain('[m1] Two-person team based in Los Angeles')
    expect(p.user).toContain('we are two people in LA')
    expect(p.user).toContain('already covers it')
  })

  it('says out loud that already-knowing is the usual answer', () => {
    const p = remember.buildPrompt({ text: 'x', known: [] }, ctx)
    expect(p.system).toContain('you already know this')
    expect(p.user).toContain('empty list is a fine answer')
  })

  it('is told the asymmetry that makes archiving dangerous', () => {
    // forgetting a constraint is not the mirror image of missing a fact: it
    // produces confident work that breaks a rule you were told about
    const p = remember.buildPrompt({ text: 'x', known }, ctx)
    expect(p.system).toContain('direct contradiction')
    expect(p.system).toContain('never because something has gone unmentioned')
  })

  it('carries where the material came from, so the trail can say', () => {
    const p = remember.buildPrompt({ text: 'x', known: [], from: 'a draft of the buyer note' }, ctx)
    expect(p.user).toContain('a draft of the buyer note')
  })

  it('accepts the four decisions it is allowed to make', () => {
    const r = remember.outputSchema.safeParse({
      ops: [
        { op: 'add', content: 'Ships to Japan twice a year', kind: 'fact', why: 'you mentioned the Tokyo drop' },
        { op: 'update', id: 'm1', content: 'Two-person label based in Los Angeles', kind: 'fact', why: 'label, not team' },
        { op: 'archive', id: 'm2', why: 'you said mornings stopped working' },
        { op: 'noop', id: 'm1' },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('accepts doing nothing at all, which is the point of it', () => {
    expect(remember.outputSchema.safeParse({ ops: [] }).success).toBe(true)
  })

  it('will not invent a fifth kind of decision', () => {
    expect(remember.outputSchema.safeParse({ ops: [{ op: 'delete', id: 'm1' }] }).success).toBe(false)
  })

  it('will not take a kind it has no ranking for', () => {
    // an unknown kind would silently rank as an ordinary fact, which is a
    // constraint quietly demoted to something that only rides along on a match
    expect(remember.outputSchema.safeParse({ ops: [{ op: 'add', content: 'x', kind: 'vibe' }] }).success).toBe(false)
    expect(remember.outputSchema.safeParse({ ops: [{ op: 'add', content: 'x', kind: 'constraint' }] }).success).toBe(true)
  })

  it('keeps a memory to one readable sentence', () => {
    const long = 'x'.repeat(400)
    expect(remember.outputSchema.safeParse({ ops: [{ op: 'add', content: long }] }).success).toBe(false)
  })

  it('caps how much one pass may change', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ op: 'add' as const, content: `fact ${i}` }))
    expect(remember.outputSchema.safeParse({ ops: twelve }).success).toBe(true)
    expect(remember.outputSchema.safeParse({ ops: [...twelve, { op: 'add', content: 'one more' }] }).success).toBe(false)
  })
})
