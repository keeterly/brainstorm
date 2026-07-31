import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { __resetRun, learnFromLettingGo, recentlyLetGo } from './letGoFlow'

const learn = vi.hoisted(() => vi.fn())
vi.mock('@/ai/memoryFlow', () => ({ learnFacts: learn }))

function seed(offline = false) {
  useGraph.setState({
    userId: 'u1',
    hydrated: true,
    offline,
    thoughts: [],
    relationships: [],
    memories: [],
    memoryEvents: [],
    artifacts: [],
    roadmaps: [],
    layouts: {},
  } as never)
}
const drop = (title: string) =>
  useGraph.getState().addThought({ raw_content: title, title, type: 'idea' })

beforeEach(() => {
  __resetRun()
  learn.mockReset().mockResolvedValue({ added: 0, updated: 0, archived: 0, knew: 0 })
  seed()
})

describe('learning from what you say no to', () => {
  it('says nothing about one', async () => {
    // one discard is a mood, and a memory written off a mood is worse than no
    // memory at all
    expect(await learnFromLettingGo(drop('A pop-up in Silver Lake'))).toBe(false)
    expect(learn).not.toHaveBeenCalled()
  })

  it('speaks up once there is a run of them', async () => {
    for (const t of ['Fly to Paris for the fair', 'A pop-up in Tokyo', 'Trade show in Milan']) {
      expect(await learnFromLettingGo(drop(t))).toBe(false)
    }
    expect(await learnFromLettingGo(drop('Sourcing trip to Lisbon'))).toBe(true)
    expect(learn).toHaveBeenCalledTimes(1)
  })

  it('hands over the set, not four separate facts', async () => {
    // the pattern is in the set. Four separate lines invites four separate
    // memories about four ideas, which is exactly the noise this must avoid
    for (const t of ['a', 'b', 'c', 'd']) await learnFromLettingGo(drop(t))
    const [facts] = learn.mock.calls[0] as [string[], string]
    expect(facts).toHaveLength(1)
    expect(facts[0]).toContain('“a”')
    expect(facts[0]).toContain('“d”')
  })

  it('tells it that nothing in common is a fine answer', async () => {
    for (const t of ['a', 'b', 'c', 'd']) await learnFromLettingGo(drop(t))
    const [facts] = learn.mock.calls[0] as [string[]]
    expect(facts[0]).toMatch(/nothing in common|nothing to learn/i)
  })

  it('starts again after it has spoken', async () => {
    for (const t of ['a', 'b', 'c', 'd']) await learnFromLettingGo(drop(t))
    expect(await learnFromLettingGo(drop('e'))).toBe(false)
    expect(learn).toHaveBeenCalledTimes(1)
  })

  it('forgets a run that has gone cold — a Tuesday is not a pattern', async () => {
    const t0 = Date.parse('2026-07-01T09:00:00Z')
    for (const t of ['a', 'b', 'c']) await learnFromLettingGo(drop(t), t0)
    // three days later
    expect(await learnFromLettingGo(drop('d'), t0 + 3 * 86400000)).toBe(false)
    expect(learn).not.toHaveBeenCalled()
  })

  it('does not go out when there is nothing to go out on', async () => {
    seed(true)
    for (const t of ['a', 'b', 'c', 'd']) await learnFromLettingGo(drop(t))
    expect(learn).not.toHaveBeenCalled()
  })
})

describe('what has been let go lately', () => {
  it('is what the sea took, newest first, and nothing else', () => {
    const a = drop('Kept')
    const b = drop('Let go')
    const c = drop('Finished')
    useGraph.getState().updateThought(b.id, { status: 'archived' })
    useGraph.getState().toggleDone(c.id)
    const got = recentlyLetGo()
    expect(got).toEqual(['Let go'])
    expect(got).not.toContain(a.title)
  })
})
