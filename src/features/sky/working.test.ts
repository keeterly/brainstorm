import { describe, expect, it } from 'vitest'
import { workFace, type WorkState } from './working'

const out = (over: Partial<WorkState> = {}): WorkState => ({
  who: 'SS28 The Cave',
  what: 'out finding out',
  phase: 'out',
  needs: ['current SS28 show dates', 'Paris showroom lead times', 'what the buyers asked for', 'a fourth thing'],
  expect: 40,
  elapsed: 0,
  background: true,
  ...over,
})

describe('saying what the agent is doing', () => {
  it('names the cheap read instead of leaving the first second blank', () => {
    // it is under a second most of the time, and an unlabelled pause at the
    // start of every run reads as the button not having worked
    expect(workFace(out({ phase: 'sizing' })).line).toBe('sizing it up')
  })

  it('does not start counting before there is anything to count', () => {
    expect(workFace(out({ elapsed: 1 })).line).toBe('out finding out')
    expect(workFace(out({ elapsed: 9 })).line).toBe('out finding out · 9s')
  })

  it('shows what it went out to check, which the app has always known', () => {
    // the gauge produces these before the run and they have never once been
    // put on screen — on the one screen where somebody is sitting waiting
    const f = workFace(out({ elapsed: 10 }))
    expect(f.needs).toContain('current SS28 show dates')
    expect(f.needs.length).toBe(3)
  })

  it('never fills the bar while it is still out there', () => {
    // a full bar means finished. This is not finished.
    expect(workFace(out({ elapsed: 40 })).fill).toBeLessThan(1)
    expect(workFace(out({ elapsed: 400 })).fill).toBeLessThan(1)
    expect(workFace(out({ elapsed: 4000 })).fill).toBeLessThan(1)
  })

  it('moves in proportion to the estimate it was given', () => {
    expect(workFace(out({ elapsed: 10, expect: 40 })).fill).toBeCloseTo(0.25, 5)
    expect(workFace(out({ elapsed: 10, expect: 20 })).fill).toBeCloseTo(0.5, 5)
  })

  it('admits when the estimate was wrong instead of inching towards it', () => {
    const f = workFace(out({ elapsed: 61, expect: 40 }))
    expect(f.over).toBe(true)
    expect(f.note).toBe('longer than the usual 40s')
    expect(f.line).toBe('out finding out · 61s')
  })

  it('says when you are free to walk away, and only when that is true', () => {
    // a background run outlives the page and comes back on its own; one that
    // is being waited on directly does not, and saying so would be a lie that
    // costs you the result
    expect(workFace(out({ elapsed: 5 })).note).toMatch(/put the phone down/)
    expect(workFace(out({ elapsed: 5, background: false })).note).toBeNull()
  })

  it('stops offering that once it has overrun — the overrun is the news', () => {
    expect(workFace(out({ elapsed: 99 })).note).toBe('longer than the usual 40s')
  })

  it('closes the bar only when the result is actually being written down', () => {
    const f = workFace(out({ phase: 'landing' }))
    expect(f.fill).toBe(1)
    expect(f.line).toBe('landing it')
    // and stops listing what it was going to check, which is now history
    expect(f.needs).toEqual([])
  })

  it('never counts backwards from a clock that jumped', () => {
    expect(workFace(out({ elapsed: -4 })).line).toBe('out finding out')
    expect(workFace(out({ elapsed: -4 })).fill).toBe(0)
  })
})
