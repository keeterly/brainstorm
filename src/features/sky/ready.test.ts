// The handover between the opening and the sky, which used to be two clocks
// with nothing joining them. Both orders occurred on the built app: sometimes
// the drops stood there through the dissolve, sometimes the curtain lifted on
// an empty sky and everything appeared at once, at full size, afterwards.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  curtainLifted,
  markCurtainLifting,
  markCurtainUp,
  markSkyReady,
  onSkyReady,
  resetSkyReady,
  skyReadyAt,
  whenCurtainLifts,
} from './ready'

beforeEach(() => {
  resetSkyReady()
  vi.useRealTimers()
})

describe('the sky saying it has drawn itself', () => {
  it('latches, so asking after the fact is the same as asking before', () => {
    const early = vi.fn()
    onSkyReady(early)
    expect(early).not.toHaveBeenCalled()
    markSkyReady()
    expect(early).toHaveBeenCalledOnce()
    // …and a listener that turns up late is answered immediately rather than
    // waiting for a second firing that never comes
    const late = vi.fn()
    onSkyReady(late)
    expect(late).toHaveBeenCalledOnce()
    expect(skyReadyAt()).toBeGreaterThan(0)
  })

  it('is only ever the first frame', () => {
    const cb = vi.fn()
    onSkyReady(cb)
    markSkyReady()
    const first = skyReadyAt()
    markSkyReady()
    markSkyReady()
    expect(cb).toHaveBeenCalledOnce()
    expect(skyReadyAt()).toBe(first)
  })
})

describe('the drops waiting for the curtain', () => {
  it('does not wait at all when there is no curtain', () => {
    // every visit to the sky after the first one
    const cb = vi.fn()
    whenCurtainLifts(cb)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('waits when an opening has declared itself, and turns as it goes', () => {
    markCurtainUp()
    const cb = vi.fn()
    whenCurtainLifts(cb)
    expect(cb).not.toHaveBeenCalled()
    expect(curtainLifted()).toBe(false)
    markCurtainLifting()
    expect(cb).toHaveBeenCalledOnce()
    expect(curtainLifted()).toBe(true)
  })

  it('answers a drop born after the curtain has gone straight away', () => {
    markCurtainUp()
    markCurtainLifting()
    const cb = vi.fn()
    whenCurtainLifts(cb)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('never leaves the sky invisible if the curtain fails to dissolve', () => {
    vi.useFakeTimers()
    markCurtainUp()
    const cb = vi.fn()
    whenCurtainLifts(cb, 7500)
    vi.advanceTimersByTime(7499)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('fires once, whichever comes first', () => {
    vi.useFakeTimers()
    markCurtainUp()
    const cb = vi.fn()
    whenCurtainLifts(cb, 500)
    markCurtainLifting()
    vi.advanceTimersByTime(2000)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('lets a drop that leaves the sky stop waiting', () => {
    vi.useFakeTimers()
    markCurtainUp()
    const cb = vi.fn()
    const stop = whenCurtainLifts(cb)
    stop()
    markCurtainLifting()
    vi.advanceTimersByTime(10000)
    expect(cb).not.toHaveBeenCalled()
  })
})
