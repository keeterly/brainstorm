import { describe, expect, it } from 'vitest'
import { EXAMPLES, isExample, markSeeded, shouldSeed } from './first-sky'

const store = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

describe('when to put something in an empty sky', () => {
  const empty = { hydrated: true, offline: false, thoughts: [] as unknown[] }

  it('seeds a hydrated, online, empty account', () => {
    expect(shouldSeed(empty, 'u1', store())).toBe(true)
  })

  it('never seeds before the store has loaded', () => {
    /*
     * The one that matters.
     *
     * An un-hydrated store is empty *because it has not loaded yet*, not
     * because the person is new. Seeding on that would drop four examples on
     * top of somebody's real thoughts every time the network was slow — the
     * worst thing this file could do, so it is the first condition it checks.
     */
    expect(shouldSeed({ ...empty, hydrated: false }, 'u1', store())).toBe(false)
  })

  it('never seeds offline', () => {
    // offline means the snapshot was empty or missing, which says nothing
    // about whether the account is
    expect(shouldSeed({ ...empty, offline: true }, 'u1', store())).toBe(false)
  })

  it('never seeds a sky that already has anything in it', () => {
    expect(shouldSeed({ ...empty, thoughts: [{}] }, 'u1', store())).toBe(false)
  })

  it('does not seed the same person twice', () => {
    const s = store()
    expect(shouldSeed(empty, 'u1', s)).toBe(true)
    markSeeded('u1', s)
    expect(shouldSeed(empty, 'u1', s)).toBe(false)
    // …and the mark is per person, so a second account on one device still gets one
    expect(shouldSeed(empty, 'u2', s)).toBe(true)
  })

  it('still seeds when the browser refuses storage', () => {
    // a private window is not a reason to land somebody on a black screen
    const hostile = {
      getItem: () => {
        throw new Error('nope')
      },
      setItem: () => {
        throw new Error('nope')
      },
    }
    expect(shouldSeed(empty, 'u1', hostile)).toBe(true)
    expect(() => markSeeded('u1', hostile)).not.toThrow()
  })
})

describe('what is in it', () => {
  it('costs nothing to land on', () => {
    /*
     * A tester's first tap must not be a bill — and on a deployment with
     * invites switched on it would be a refusal instead, which is a worse
     * first thirty seconds. Notes only: no goal ripe for ⚡, no question that
     * invites `answer it`.
     */
    expect(EXAMPLES.every((e) => e.type === 'note')).toBe(true)
    expect(EXAMPLES.some((e) => /\?$/.test(e.raw_content ?? ''))).toBe(false)
  })

  it('says the gesture nobody guesses', () => {
    // the app's own notes record a playtester spending ten minutes on this
    expect(EXAMPLES.some((e) => /hold/i.test(e.raw_content ?? ''))).toBe(true)
  })

  it('marks them, so they can be told apart later', () => {
    expect(EXAMPLES.every((e) => isExample(e.extra))).toBe(true)
    expect(isExample({})).toBe(false)
    expect(isExample(null)).toBe(false)
    expect(isExample({ example: 'yes' })).toBe(false)
  })

  it('is few enough to read', () => {
    // a sky that opens full is the wall this was meant to avoid
    expect(EXAMPLES.length).toBeLessThanOrEqual(5)
    expect(EXAMPLES.length).toBeGreaterThan(1)
  })
})
