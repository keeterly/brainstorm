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
    distill_memory: { text: 'I prefer mornings', existing: [] },
    absorb: { text: 'the buyer moved our meeting to friday', thoughts: [ref] },
    organize: { text: 'a long messy dump about the campaign and the pop-up', thoughts: [ref], spoken: true },
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
