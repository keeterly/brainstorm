import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { fullDepth, sizeUp, sizingOf, waitingWord } from './gaugeFlow'
import type { GaugeOutput } from '@shared/ai/actions/gauge'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))

const KNOWN: GaugeOutput = { depth: 'known', needs: [], why: 'nothing to look up — thinking it through' }
const DEEP: GaugeOutput = {
  depth: 'deep',
  needs: ['current 7(a) rate caps', 'what a preferred lender asks for'],
  why: 'checking two things first',
}

function seed(title: string) {
  useGraph.setState({
    userId: 'u1',
    hydrated: true,
    offline: false,
    thoughts: [],
    relationships: [],
    memories: [],
    artifacts: [],
    roadmaps: [],
    layouts: {},
  } as never)
  return useGraph.getState().addThought({ raw_content: title, title })
}

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: null, output: KNOWN })
})

describe('deciding how much work the ask is worth', () => {
  it('spends no searches on something the web has never heard of', () => {
    // "SS27 Lookbook & Collection Prep" is the user's own project. Four
    // searches on it is sixty seconds confirming the internet does not know.
    const sz = sizingOf(KNOWN, 4)
    expect(sz.searches).toBe(0)
    expect(sz.quick).toBe(true)
  })

  it('spends the full budget on something that turns on current facts', () => {
    const sz = sizingOf(DEEP, 4)
    expect(sz.searches).toBe(4)
    expect(sz.quick).toBe(false)
  })

  it('never asks for more than the action allows', () => {
    // the ceiling belongs to the action; the gauge may only want less of it
    expect(sizingOf(DEEP, 2).searches).toBe(2)
    expect(sizingOf(DEEP, 0).searches).toBe(0)
  })

  it('takes the middle road when only a couple of things need checking', () => {
    const sz = sizingOf({ depth: 'light', needs: ['the filing fee'], why: 'checking the fee' }, 4)
    expect(sz.searches).toBe(2)
    expect(sz.quick).toBe(false)
  })

  it('carries what it said it would check, so the wait can name it', () => {
    expect(sizingOf(DEEP, 4).needs).toContain('current 7(a) rate caps')
  })
})

describe('when the gauge itself does not come back', () => {
  it('runs at full depth rather than not running', async () => {
    // it is a hint, not a gate: a failed gauge must never stop the thing it
    // was gauging
    const t = seed('Get approved for a $100K SBA loan')
    run.mockRejectedValueOnce(new Error('nope'))
    const sz = await sizeUp(t.id, 'plan', 4)
    expect(sz).toEqual(fullDepth(4))
    expect(sz.searches).toBe(4)
  })

  it('does not bother asking when there is no connection', async () => {
    const t = seed('Anything')
    useGraph.setState({ offline: true } as never)
    const sz = await sizeUp(t.id, 'plan', 4)
    expect(run).not.toHaveBeenCalled()
    expect(sz.searches).toBe(4)
  })

  it('sends what is already inside, because that is most of the judgement', async () => {
    const t = seed('SS27 Lookbook & Collection Prep')
    const s = useGraph.getState()
    const kid = s.addThought({ raw_content: 'Buyer invitations', title: 'Buyer invitations' })
    s.addRelationship(kid.id, t.id, 'part_of')
    await sizeUp(t.id, 'plan', 4)
    const input = run.mock.calls[0][1] as { context: string[]; kind: string }
    expect(input.context).toContain('Buyer invitations')
    expect(input.kind).toBe('plan')
  })
})

describe('what the wait says while it waits', () => {
  it('stops promising a minute for something that takes eight seconds', () => {
    const quick = sizingOf(KNOWN, 4)
    expect(waitingWord(quick, 1)).toBe('nothing to look up — thinking it through')
    expect(waitingWord(quick, 3)).not.toMatch(/minute/)
  })

  it('starts counting once it has gone past what it promised', () => {
    // an estimate that quietly becomes a stopwatch beats one that keeps
    // insisting
    const deep = sizingOf(DEEP, 4)
    expect(waitingWord(deep, deep.seconds + 5)).toMatch(/· \d+s$/)
  })

  it('names what it is doing rather than what it is', () => {
    const deep = sizingOf(DEEP, 4)
    expect(waitingWord(deep, 10)).toContain('checking two things first')
  })

  it('always has something to show, even before the gauge has answered', () => {
    expect(waitingWord({ ...fullDepth(4), why: 'sizing it up' }, 0)).toBe('sizing it up')
  })
})
