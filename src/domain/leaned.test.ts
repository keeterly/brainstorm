import { describe, expect, it } from 'vitest'
import { leanedWords, neverNeeded, workingSet } from './leaned'
import type { Memory } from './types'

const DAY = 86_400_000
const NOW = Date.parse('2026-08-04T12:00:00Z')
const TODAY = '2026-08-04'

function mem(p: Partial<Memory> = {}): Memory {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'u',
    content: 'writes to buyers in plain sentences',
    source: 'learned',
    created_at: new Date(NOW - 30 * DAY).toISOString(),
    ...p,
  }
}

describe('how much of what it knows is doing any work', () => {
  it('counts only what has been leaned on inside the window', () => {
    const ms = [
      mem({ last_used_at: new Date(NOW - 2 * DAY).toISOString() }),
      mem({ last_used_at: new Date(NOW - 6 * DAY).toISOString() }),
      mem({ last_used_at: new Date(NOW - 40 * DAY).toISOString() }),
      mem({ last_used_at: null }),
    ]
    expect(workingSet(ms, NOW)).toBe(2)
  })

  it('leaves out what the reconciler has already set aside', () => {
    // archived memory is not carried into anything, so counting it as working
    // would inflate the one number on this page anybody would act on
    const ms = [
      mem({ last_used_at: new Date(NOW - DAY).toISOString() }),
      mem({ last_used_at: new Date(NOW - DAY).toISOString(), archived_at: new Date(NOW).toISOString() }),
    ]
    expect(workingSet(ms, NOW)).toBe(1)
  })

  it('is zero on a memory nothing has used, rather than falling back to the total', () => {
    expect(workingSet([mem(), mem()], NOW)).toBe(0)
  })
})

describe('what it has never once needed', () => {
  it('finds memory that has ridden along unread since it was written', () => {
    const old = mem({ content: 'the supplier in Como', last_used_at: null })
    const used = mem({ last_used_at: new Date(NOW - 3 * DAY).toISOString() })
    expect(neverNeeded([old, used], NOW).map((m) => m.content)).toEqual(['the supplier in Como'])
  })

  it('gives something written this morning a fair chance first', () => {
    /*
     * Nothing written today has been used today, because nothing has happened
     * yet. Listing it as dead weight the same day is the app telling you off
     * for having just used it.
     */
    const fresh = mem({ created_at: new Date(NOW - 2 * 3600_000).toISOString(), last_used_at: null })
    expect(neverNeeded([fresh], NOW)).toEqual([])
  })

  it('says nothing about memory the reconciler already shelved', () => {
    const shelved = mem({ last_used_at: null, archived_at: new Date(NOW).toISOString() })
    expect(neverNeeded([shelved], NOW)).toEqual([])
  })
})

describe('when it was last actually needed, in words', () => {
  it('says so plainly when it never has been', () => {
    // not "0 times" and not blank: the whole point of the line is that this
    // case is legible
    expect(leanedWords(mem({ last_used_at: null }), TODAY)).toBe('never needed yet')
  })

  it('reads as a date a person would say', () => {
    expect(leanedWords(mem({ last_used_at: `${TODAY}T09:00:00Z` }), TODAY)).toBe('last used today')
    expect(leanedWords(mem({ last_used_at: '2026-08-03T09:00:00Z' }), TODAY)).toBe('last used yesterday')
    // the app's one way of saying a past date, not a second format invented
    // for this screen — and for staleness "153 days ago" is the more pointed
    // of the two anyway
    expect(leanedWords(mem({ last_used_at: '2026-03-04T09:00:00Z' }), TODAY)).toBe('last used 153 days ago')
  })
})
