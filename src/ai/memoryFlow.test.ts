import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { applyOps, learn, learnFacts, learnedLine } from './memoryFlow'
import type { RememberOutput } from '@shared/ai/actions/remember'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))

function seed() {
  useGraph.setState({
    userId: 'u1',
    hydrated: true,
    offline: false,
    thoughts: [],
    relationships: [],
    memories: [],
    memoryEvents: [],
    artifacts: [],
    roadmaps: [],
    layouts: {},
  } as never)
  const s = useGraph.getState()
  const la = s.addMemory('Two-person team based in Los Angeles', 'manual', { kind: 'fact' })
  const am = s.addMemory('Works best in the morning', 'manual', { kind: 'pattern' })
  return { la, am }
}

const live = () => useGraph.getState().memories.filter((m) => !m.archived_at)
const events = () => useGraph.getState().memoryEvents

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: { ops: [] } as RememberOutput })
})

describe('taking something in', () => {
  it('adds what is genuinely new, and says where it came from', () => {
    seed()
    const t = applyOps({ ops: [{ op: 'add', content: 'Ships to Japan twice a year', kind: 'fact', why: 'the Tokyo drop' }] }, 'r1')
    expect(t.added).toBe(1)
    const made = live().find((m) => m.content.startsWith('Ships to Japan'))
    expect(made?.kind).toBe('fact')
    expect(made?.source).toBe('learned')
    expect(events()[0]).toMatchObject({ op: 'add', after: 'Ships to Japan twice a year', why: 'the Tokyo drop' })
  })

  it('corrects in place, keeping the id and what it had earned', () => {
    const { la } = seed()
    useGraph.getState().reinforceMemories([la.id])
    const before = live().find((m) => m.id === la.id)!.strength
    applyOps({ ops: [{ op: 'update', id: la.id, content: 'Two-person label based in Los Angeles', kind: 'fact', why: 'label, not team' }] })
    const after = live().find((m) => m.id === la.id)!
    // the same belief said better is the same memory: a new row would lose the
    // history and the strength, and leave the old wording in every prompt
    expect(live()).toHaveLength(2)
    expect(after.content).toBe('Two-person label based in Los Angeles')
    expect(after.strength).toBe(before)
    expect(events()[0]).toMatchObject({ op: 'update', before: 'Two-person team based in Los Angeles' })
  })

  it('archives rather than deletes, so the trail survives', () => {
    const { am } = seed()
    const t = applyOps({ ops: [{ op: 'archive', id: am.id, why: 'you said mornings stopped working' }] })
    expect(t.archived).toBe(1)
    // gone from what reaches a prompt…
    expect(live().map((m) => m.id)).not.toContain(am.id)
    // …and still readable
    const kept = useGraph.getState().memories.find((m) => m.id === am.id)
    expect(kept?.archived_at).toBeTruthy()
    expect(events()[0]).toMatchObject({ op: 'archive', before: 'Works best in the morning' })
  })

  it('does nothing at all when it already knows, and counts that as knowing', () => {
    const { la } = seed()
    const t = applyOps({ ops: [{ op: 'noop', id: la.id }] })
    expect(t).toMatchObject({ added: 0, updated: 0, archived: 0, knew: 1 })
    expect(live()).toHaveLength(2)
    // confirming something it believed is worth a point
    expect(live().find((m) => m.id === la.id)!.strength).toBe(2)
  })

  it('refuses an exact duplicate even when the model asked to add one', () => {
    // the one failure this whole path exists to prevent, so it is checked twice
    const { la } = seed()
    const t = applyOps({ ops: [{ op: 'add', content: '  two-person team based in LOS ANGELES  ', kind: 'fact' }] })
    expect(t).toMatchObject({ added: 0, knew: 1 })
    expect(live()).toHaveLength(2)
    expect(live().find((m) => m.id === la.id)!.strength).toBe(2)
  })

  it('ignores an op that points at nothing, or changes nothing', () => {
    seed()
    const t = applyOps({
      ops: [
        { op: 'update', id: 'not-a-memory', content: 'x' },
        { op: 'archive', id: 'also-not-one' },
        { op: 'add', content: '   ' },
      ],
    })
    expect(t).toMatchObject({ added: 0, updated: 0, archived: 0 })
    expect(live()).toHaveLength(2)
  })

  it('will not archive something twice', () => {
    const { am } = seed()
    applyOps({ ops: [{ op: 'archive', id: am.id }] })
    const t = applyOps({ ops: [{ op: 'archive', id: am.id }] })
    expect(t.archived).toBe(0)
  })
})

describe('the one door into memory', () => {
  it('hands the reconciler what is already believed, so it can say "I know"', async () => {
    seed()
    await learn('we are two people working out of LA', { from: 'something you wrote' })
    expect(run).toHaveBeenCalledOnce()
    const [action, input] = run.mock.calls[0] as [string, { known: { content: string }[]; from?: string }]
    expect(action).toBe('remember')
    expect(input.known.map((k) => k.content)).toContain('Two-person team based in Los Angeles')
    expect(input.from).toBe('something you wrote')
  })

  it('never lets a memory failure surface as an error', async () => {
    seed()
    run.mockRejectedValue(new Error('the model fell over'))
    await expect(learn('anything at all')).resolves.toMatchObject({ added: 0, knew: 0 })
  })

  it('stays quiet offline rather than queueing a model call', async () => {
    seed()
    useGraph.setState({ offline: true })
    await learn('a long enough piece of text to be worth learning from')
    expect(run).not.toHaveBeenCalled()
  })

  it('says nothing on empty input', async () => {
    seed()
    await learn('   ')
    expect(run).not.toHaveBeenCalled()
  })

  it('sends an action’s own findings as a proposal rather than a write', async () => {
    seed()
    await learnFacts(['Flies LAX→CDG for fashion week', ''], 'answering the fares question', 'r9')
    expect(run).toHaveBeenCalledOnce()
    const [, input] = run.mock.calls[0] as [string, { text: string; from?: string }]
    expect(input.text).toContain('Flies LAX→CDG for fashion week')
    expect(input.from).toBe('answering the fares question')
  })

  it('does not call out for a list of nothing', async () => {
    seed()
    await learnFacts(['', '  '], 'a draft')
    expect(run).not.toHaveBeenCalled()
  })
})

describe('what it says out loud about it', () => {
  it('stays silent when nothing changed, which is most of the time', () => {
    expect(learnedLine({ added: 0, updated: 0, archived: 0, knew: 4 })).toBeNull()
  })

  it('speaks up when it actually learned something', () => {
    expect(learnedLine({ added: 2, updated: 1, archived: 0, knew: 3 })).toBe('memory · 2 new · 1 corrected')
  })
})
