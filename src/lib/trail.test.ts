import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetTrailCache, clearTrail, noteTrail, readTrail, trailWhen } from './trail'

beforeEach(() => {
  localStorage.clear()
  _resetTrailCache()
})

describe('the record of what the app did', () => {
  it('keeps what happened, most recent first', () => {
    noteTrail('a pool formed', 'SS27')
    noteTrail('6 gathered')
    expect(readTrail().map((e) => e.what)).toEqual(['6 gathered', 'a pool formed'])
    expect(readTrail()[1].subject).toBe('SS27')
  })

  it('survives a reload, because that is the entire point', () => {
    noteTrail('the map moved')
    _resetTrailCache()
    expect(readTrail().map((e) => e.what)).toEqual(['the map moved'])
  })

  it('folds a run of the same line into one', () => {
    // repainting, retrying and undo-then-redo all produce these, and a log made
    // mostly of duplicates is one nobody reads
    for (let i = 0; i < 5; i++) noteTrail('6 gathered', 'x')
    expect(readTrail()).toHaveLength(1)
    noteTrail('6 gathered', 'y')
    expect(readTrail()).toHaveLength(2)
  })

  it('does not fold two of the same thing an hour apart — that is twice', () => {
    vi.useFakeTimers()
    noteTrail('a pool formed')
    vi.advanceTimersByTime(61_000)
    noteTrail('a pool formed')
    expect(readTrail()).toHaveLength(2)
    vi.useRealTimers()
  })

  it('forgets the distant past rather than growing forever', () => {
    for (let i = 0; i < 60; i++) noteTrail(`thing ${i}`)
    const t = readTrail()
    expect(t).toHaveLength(40)
    expect(t[0].what).toBe('thing 59')
  })

  it('ignores an empty note', () => {
    noteTrail('   ')
    expect(readTrail()).toEqual([])
  })

  it('can be wiped', () => {
    noteTrail('x')
    clearTrail()
    expect(readTrail()).toEqual([])
    _resetTrailCache()
    expect(readTrail()).toEqual([])
  })

  it('never takes the app down with it', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(() => noteTrail('x')).not.toThrow()
    setItem.mockRestore()
    // and a log that is not JSON at all is treated as no log
    localStorage.setItem('brainstorm.trail.v1', 'not json{')
    _resetTrailCache()
    expect(readTrail()).toEqual([])
  })

  it('throws away entries that are not entries', () => {
    localStorage.setItem('brainstorm.trail.v1', JSON.stringify([{ what: 'ok', at: 1 }, null, { nope: true }, 7]))
    _resetTrailCache()
    expect(readTrail()).toEqual([{ what: 'ok', at: 1 }])
  })
})

describe('saying when', () => {
  const now = Date.parse('2026-07-30T12:00:00Z')
  const ago = (ms: number) => trailWhen(now - ms, now)
  it('says it the way a person would', () => {
    expect(ago(5_000)).toBe('just now')
    expect(ago(60_000)).toBe('a minute ago')
    expect(ago(12 * 60_000)).toBe('12 minutes ago')
    expect(ago(3_600_000)).toBe('an hour ago')
    expect(ago(5 * 3_600_000)).toBe('5 hours ago')
    expect(ago(26 * 3_600_000)).toBe('yesterday')
    expect(ago(4 * 86_400_000)).toBe('4 days ago')
    expect(ago(8 * 86_400_000)).toBe('last week')
    expect(ago(20 * 86_400_000)).toBe('3 weeks ago')
  })
  it('never says something happened in the future', () => {
    expect(trailWhen(now + 99_000, now)).toBe('just now')
  })
})
