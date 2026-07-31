import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { emptiedGroup } from '@/domain/finished'
import { applyEvaporate, closeGoal, evaporateGoal } from './finishFlow'
import type { EvaporateOutput } from '@shared/ai/actions/evaporate'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))
vi.mock('@/ai/pending', () => ({ markApplied: vi.fn() }))

const NOTHING: EvaporateOutput = { rises: null, note: 'that one is simply done' }
const SOMETHING: EvaporateOutput = {
  rises: {
    title: 'Who do the six letters go to?',
    why: 'the campaign is shot; the list is the only thing between it and sending',
    kind: 'question',
  },
  note: 'one thing came up',
}

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
  const goal = s.addThought({ raw_content: 'SS27 campaign', title: 'SS27 campaign', type: 'goal' })
  const a = s.addThought({ raw_content: 'Shoot the roll', title: 'Shoot the roll', type: 'action' })
  const b = s.addThought({ raw_content: 'Write the letters', title: 'Write the letters', type: 'action' })
  s.addRelationship(a.id, goal.id, 'part_of')
  s.addRelationship(b.id, goal.id, 'part_of')
  return { goal, a, b }
}

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: NOTHING })
})

describe('a goal that has run out of work', () => {
  it('stays quiet while anything is still open under it', () => {
    const { goal, a } = seed()
    useGraph.getState().toggleDone(a.id)
    const s = useGraph.getState()
    expect(emptiedGroup(a.id, s.thoughts, s.relationships)).toBeNull()
    expect(s.thoughts.find((t) => t.id === goal.id)?.status).toBe('open')
  })

  it('names the goal once the last thing in it is ticked', () => {
    // Until now the members vanished — correctly, the sky draws only what is
    // open — and the goal stayed open with zero members, so it stopped being a
    // pool and was redrawn as an orphan drop. A thing you completed, looking
    // exactly like a thought nobody has touched.
    const { goal, a, b } = seed()
    useGraph.getState().toggleDone(a.id)
    useGraph.getState().toggleDone(b.id)
    const s = useGraph.getState()
    expect(emptiedGroup(b.id, s.thoughts, s.relationships)?.id).toBe(goal.id)
  })

  it('does not close it on its own', () => {
    // "That whole thing is done" is a claim about their work
    const { goal, a, b } = seed()
    useGraph.getState().toggleDone(a.id)
    useGraph.getState().toggleDone(b.id)
    expect(useGraph.getState().thoughts.find((t) => t.id === goal.id)?.status).toBe('open')
  })

  it('closes when asked, and can be put straight back', () => {
    const { goal } = seed()
    const done = closeGoal(goal.id)
    expect(done?.note).toContain('SS27 campaign')
    expect(useGraph.getState().thoughts.find((t) => t.id === goal.id)?.status).toBe('done')
    done?.undo()
    expect(useGraph.getState().thoughts.find((t) => t.id === goal.id)?.status).toBe('open')
    expect(useGraph.getState().thoughts.find((t) => t.id === goal.id)?.completed_at).toBeNull()
  })

  it('will not close something already in the ocean', () => {
    const { goal } = seed()
    closeGoal(goal.id)
    expect(closeGoal(goal.id)).toBeNull()
  })
})

describe('what finishing put in the air', () => {
  it('takes "nothing" for an answer, and adds no thought at all', async () => {
    // The discipline of the whole action. Something that hands you a fresh
    // task every time you tick one off is a treadmill, not a cycle.
    const { goal } = seed()
    const before = useGraph.getState().thoughts.length
    const res = await evaporateGoal(goal.id)
    expect(res.kind).toBe('settled')
    expect(useGraph.getState().thoughts).toHaveLength(before)
  })

  it('lands what does rise as a real thought in the sky', async () => {
    // not prose in a blob, which is what every retired version of this was
    const { goal } = seed()
    run.mockResolvedValue({ runId: 'r1', output: SOMETHING })
    const res = await evaporateGoal(goal.id)
    expect(res.kind).toBe('rose')
    if (res.kind !== 'rose') return
    expect(res.thought.type).toBe('question')
    expect(res.thought.title).toContain('six letters')
    expect(res.thought.summary).toContain('only thing between it')
    const found = useGraph.getState().thoughts.find((t) => t.id === res.thought.id)
    expect(found?.status).toBe('open')
    expect((found?.extra as Record<string, unknown>).rose_from).toBe(goal.id)
  })

  it('shows it what is already open, so it cannot hand back what they have', async () => {
    const { goal } = seed()
    await evaporateGoal(goal.id)
    const [action, input] = run.mock.calls[0] as [string, { open: string[]; inside: string[] }]
    expect(action).toBe('evaporate')
    expect(input.open).toContain('Shoot the roll')
    expect(input.inside).toContain('Write the letters')
  })

  it('changes nothing when it cannot get out there', async () => {
    const { goal } = seed()
    const before = useGraph.getState().thoughts.length
    run.mockRejectedValueOnce(new Error('offline'))
    expect((await evaporateGoal(goal.id)).kind).toBe('failed')
    expect(useGraph.getState().thoughts).toHaveLength(before)
  })

  it('applies a stored output the same way, for a run collected later', () => {
    const { goal } = seed()
    const res = applyEvaporate(goal.id, SOMETHING, 'r1')
    expect(res.kind).toBe('rose')
  })
})
