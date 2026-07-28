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
  }
  return inputs[name] as never
}

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
