import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '@/store/graph'
import { __reset, editsPending, flushEdits, forgetEdit, keepEdit, SETTLE_MS, watchForLeaving } from './autosave'

const S = () => useGraph.getState()
const titleOf = (id: string) => S().thoughts.find((t) => t.id === id)?.title

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
  return S().addThought({ raw_content: 'Order care labels', title: 'Order care labels', type: 'idea' })
}

beforeEach(() => {
  vi.useFakeTimers()
  __reset()
  seed()
})
afterEach(() => vi.useRealTimers())

describe('saving as you type', () => {
  it('waits for the typing to settle rather than writing every letter', () => {
    const t = S().thoughts[0]
    for (const s of ['O', 'Or', 'Ord']) keepEdit(t.id, s)
    expect(titleOf(t.id)).toBe('Order care labels')
    vi.advanceTimersByTime(SETTLE_MS)
    expect(titleOf(t.id)).toBe('Ord')
  })

  it('restarts the clock on each keystroke, so a long sentence is one write', () => {
    const t = S().thoughts[0]
    for (let i = 0; i < 10; i++) {
      keepEdit(t.id, `x${i}`)
      vi.advanceTimersByTime(SETTLE_MS - 50)
    }
    expect(titleOf(t.id)).toBe('Order care labels')
    vi.advanceTimersByTime(SETTLE_MS)
    expect(titleOf(t.id)).toBe('x9')
  })

  it('writes quietly — no undo, nothing to acknowledge', () => {
    // a save you have to dismiss every six hundred milliseconds is worse than
    // no save at all, so this deliberately does not go through landUndo
    const t = S().thoughts[0]
    keepEdit(t.id, 'Order the care labels')
    vi.advanceTimersByTime(SETTLE_MS)
    expect(titleOf(t.id)).toBe('Order the care labels')
    expect(S().thoughts).toHaveLength(1)
  })

  it('leaves an emptied field alone until you are finished with it', () => {
    // clearing a line to retype it is not asking for a thought with no words
    const t = S().thoughts[0]
    keepEdit(t.id, '')
    vi.advanceTimersByTime(SETTLE_MS)
    expect(titleOf(t.id)).toBe('Order care labels')
    keepEdit(t.id, '   ')
    vi.advanceTimersByTime(SETTLE_MS)
    expect(titleOf(t.id)).toBe('Order care labels')
  })

  it('holds several fields at once and writes them all', () => {
    const a = S().thoughts[0]
    const b = S().addThought({ raw_content: 'Book the studio', title: 'Book the studio', type: 'idea' })
    keepEdit(a.id, 'A changed')
    keepEdit(b.id, 'B changed')
    vi.advanceTimersByTime(SETTLE_MS)
    expect(titleOf(a.id)).toBe('A changed')
    expect(titleOf(b.id)).toBe('B changed')
  })

  it('keeps only the latest thing typed into one field', () => {
    const t = S().thoughts[0]
    keepEdit(t.id, 'first')
    keepEdit(t.id, 'second')
    vi.advanceTimersByTime(SETTLE_MS)
    expect(titleOf(t.id)).toBe('second')
  })

  it('says nothing about a thing that has since gone', () => {
    const t = S().thoughts[0]
    keepEdit(t.id, 'renamed')
    useGraph.setState({ thoughts: [] } as never)
    expect(() => vi.advanceTimersByTime(SETTLE_MS)).not.toThrow()
  })
})

describe('the last moment the page is alive', () => {
  it('writes what is still waiting when the app goes to the background', () => {
    // this is the one that matters on a phone: you switch apps, iOS reclaims
    // the tab, and whatever was still on a timer was never anywhere but a
    // DOM node
    const stop = watchForLeaving()
    const t = S().thoughts[0]
    keepEdit(t.id, 'half a sentence')
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(titleOf(t.id)).toBe('half a sentence')
    stop()
  })

  it('does nothing when the app is merely being looked at again', () => {
    const stop = watchForLeaving()
    const t = S().thoughts[0]
    keepEdit(t.id, 'not yet')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(titleOf(t.id)).toBe('Order care labels')
    expect(editsPending()).toBe(true)
    stop()
  })

  it('stops listening once the page is taken down', () => {
    const stop = watchForLeaving()
    stop()
    const t = S().thoughts[0]
    keepEdit(t.id, 'gone')
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(titleOf(t.id)).toBe('Order care labels')
  })
})

describe('what is still owed', () => {
  it('is nothing once it has been written', () => {
    const t = S().thoughts[0]
    expect(editsPending()).toBe(false)
    keepEdit(t.id, 'x')
    expect(editsPending()).toBe(true)
    flushEdits()
    expect(editsPending()).toBe(false)
  })

  it('can be given up when something else has taken the field over', () => {
    const t = S().thoughts[0]
    keepEdit(t.id, 'stale')
    forgetEdit(t.id)
    vi.advanceTimersByTime(SETTLE_MS)
    expect(titleOf(t.id)).toBe('Order care labels')
  })
})
