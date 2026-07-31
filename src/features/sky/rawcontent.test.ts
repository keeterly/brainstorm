import { beforeEach, describe, expect, it } from 'vitest'
import { useGraph } from '@/store/graph'
import { rename } from '@/features/sky/groupFlow'

beforeEach(() => {
  useGraph.setState({ userId:'u', hydrated:true, offline:false, thoughts:[], relationships:[], memories:[], memoryEvents:[], artifacts:[], roadmaps:[], layouts:{} } as never)
})

describe('renaming a thought that has a body', () => {
  it('does not throw away what you originally wrote', () => {
    const s = useGraph.getState()
    // captured as a paragraph, then given a short title by classify
    const t = s.addThought({ raw_content: 'The whole SS27 idea is that the clothes look like they were found rather than made — expired film, wax seals, nothing that reads as new.', title: null })
    useGraph.getState().updateThought(t.id, { title: 'SS27: found, not made' })
    rename(t.id, 'SS27 — found not made')
    const after = useGraph.getState().thoughts.find(x => x.id === t.id)!
    expect(after.title).toBe('SS27 — found not made')
    expect(after.raw_content).toContain('expired film')
  })
})

describe('renaming a thought that is only its own name', () => {
  it('keeps the two in step, because they were never different', () => {
    // one line typed into the sky: the line is both what it is called and all
    // there is of it, and a rename that left a stale body behind would show
    // the new name and hand the old words to every prompt built from it
    const s = useGraph.getState()
    const t = s.addThought({ raw_content: 'Order care labels', title: 'Order care labels' })
    rename(t.id, 'Order the care labels')
    const after = useGraph.getState().thoughts.find((x) => x.id === t.id)!
    expect(after.title).toBe('Order the care labels')
    expect(after.raw_content).toBe('Order the care labels')
  })

  it('puts both back exactly, whichever way it went', () => {
    const s = useGraph.getState()
    const t = s.addThought({ raw_content: 'A long body that is not the title', title: 'Short title' })
    const u = rename(t.id, 'New title')
    u?.undo()
    const after = useGraph.getState().thoughts.find((x) => x.id === t.id)!
    expect(after.title).toBe('Short title')
    expect(after.raw_content).toBe('A long body that is not the title')
  })
})
