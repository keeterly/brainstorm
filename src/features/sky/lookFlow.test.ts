import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { applyLook, faceOf, isWall, lookAtWall, lookMarkdown, referencesIn } from './lookFlow'
import type { LookOutput } from '@shared/ai/actions/look'

const run = vi.hoisted(() => vi.fn())
vi.mock('@/ai/client', () => ({ runAction: run }))
vi.mock('@/ai/pending', () => ({ markApplied: vi.fn() }))
vi.mock('@/ai/memoryFlow', () => ({
  learnFacts: vi.fn().mockResolvedValue({ added: 0, updated: 0, archived: 0, knew: 0 }),
}))

const OUT: LookOutput = {
  read: 'Light doing the work the clothes are supposed to do',
  threads: [{ what: 'Everything is back-lit', where: 'the window shots, the veil' }],
  missing: ['Not one of these shows a garment you could describe to a buyer'],
  name: 'Light through fabric',
  learned: ['Reaches for light before silhouette'],
  note: 'the light is the idea',
}

const PIC = 'data:image/jpeg;base64,/9j/AAAA'

function seed(groupName = 'Together', pics = 3) {
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
  const g = s.addThought({ raw_content: groupName, title: groupName, type: 'goal' })
  for (let i = 0; i < pics; i++) {
    const t = s.addThought({ raw_content: 'Photo', title: 'Photo', extra: { img: PIC, full: PIC } })
    s.addRelationship(t.id, g.id, 'part_of')
  }
  const words = s.addThought({ raw_content: 'Shoot on expired film', title: 'Shoot on expired film', type: 'idea' })
  s.addRelationship(words.id, g.id, 'part_of')
  return { g, words }
}

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue({ runId: 'r1', output: OUT })
})

describe('what counts as a wall', () => {
  it('pulls the stored face off a photo drop and nothing off a text one', () => {
    const { words } = seed()
    const pic = referencesIn(useGraph.getState().thoughts.find((t) => t.type === 'goal')!.id)[0]
    expect(faceOf(pic)).toEqual({ mediaType: 'image/jpeg', dataB64: '/9j/AAAA' })
    expect(faceOf(words)).toBeNull()
  })

  it('needs two pictures — one picture has no across to read', () => {
    const { g } = seed('Together', 1)
    expect(isWall(g.id)).toBe(false)
    const two = seed('Together', 2)
    expect(isWall(two.g.id)).toBe(true)
  })

  it('does not count what has been put away', () => {
    const { g } = seed('Together', 2)
    const pics = referencesIn(g.id)
    useGraph.getState().toggleDone(pics[0].id)
    expect(isWall(g.id)).toBe(false)
  })
})

describe('reading a wall of references', () => {
  it('sends the pictures and the words that sit beside them', async () => {
    const { g } = seed()
    await lookAtWall(g.id)
    const [action, input] = run.mock.calls[0] as [string, { images: unknown[]; alongside: string[] }]
    expect(action).toBe('look')
    expect(input.images).toHaveLength(3)
    expect(input.alongside).toEqual(['Shoot on expired film'])
  })

  it('sends at most twelve, because this asks about the across and not the detail', async () => {
    const { g } = seed('Together', 20)
    await lookAtWall(g.id)
    const [, input] = run.mock.calls[0] as [string, { images: unknown[] }]
    expect(input.images).toHaveLength(12)
  })

  it('says so rather than asking, when there is only one picture', async () => {
    const { g } = seed('Together', 1)
    expect((await lookAtWall(g.id)).kind).toBe('thin')
    expect(run).not.toHaveBeenCalled()
  })

  it('lands as a brief, so it can be read again and rained from', async () => {
    // the whole composition: look → the reading becomes `found` on the group →
    // rain turns what it is about into the work that follows
    const { g } = seed()
    await lookAtWall(g.id)
    const art = useGraph.getState().artifacts.find((a) => a.thought_id === g.id)
    expect(art).toBeTruthy()
    expect(art?.content_md).toContain('What runs through it')
    expect(art?.content_md).toContain('What is not here')
    expect(art?.content_md).toContain('garment you could describe to a buyer')
  })

  it('says what the wall is about, under the name they gave it', async () => {
    const { g } = seed('SS27')
    await lookAtWall(g.id)
    const after = useGraph.getState().thoughts.find((t) => t.id === g.id)
    // theirs is a real name, so it stands
    expect(after?.title).toBe('SS27')
    expect(after?.summary).toContain('Light doing the work')
  })

  it('renames only a name nobody chose', async () => {
    const { g } = seed('Together')
    await lookAtWall(g.id)
    expect(useGraph.getState().thoughts.find((t) => t.id === g.id)?.title).toBe('Light through fabric')
  })

  it('stamps it, so the funnel stops offering to look and moves on', async () => {
    const { g } = seed()
    expect(isWall(g.id)).toBe(true)
    await lookAtWall(g.id)
    const ex = useGraph.getState().thoughts.find((t) => t.id === g.id)?.extra as Record<string, unknown>
    expect(ex.looked_at).toBeTruthy()
  })

  it('changes nothing when it cannot get out there', async () => {
    const { g } = seed()
    run.mockRejectedValueOnce(new Error('offline'))
    expect((await lookAtWall(g.id)).kind).toBe('failed')
    expect(useGraph.getState().artifacts).toHaveLength(0)
  })

  it('applies a stored output the same way, for a run collected later', () => {
    const { g } = seed()
    expect(applyLook(g.id, OUT, 'r1').kind).toBe('read')
  })
})

describe('the reading, written down', () => {
  it('gives what is not there a heading of its own', () => {
    // it is the half of the answer you cannot get by looking at the wall
    // yourself, because the thing you are looking for is not on it
    const md = lookMarkdown(OUT, 'SS27')
    expect(md.indexOf('## What is not here')).toBeGreaterThan(md.indexOf('## What runs through it'))
    expect(md).toContain('_Read from the references in SS27._')
  })

  it('leaves out a section it has nothing for', () => {
    const md = lookMarkdown({ ...OUT, missing: [], threads: [] }, 'SS27')
    expect(md).not.toContain('What is not here')
    expect(md).not.toContain('What runs through it')
  })
})
