/*
 * The week you finished something in, from where you were standing.
 *
 * Split out from `schedule.test.ts` because it has to run in a timezone that is
 * not UTC, and the only reliable way to do that is to set it before anything
 * has looked at a clock. Every other test in this repo runs in the container's
 * UTC, which is exactly why this bug was invisible: in UTC the two answers are
 * always the same.
 */
process.env.TZ = 'America/Los_Angeles'

import { describe, expect, it } from 'vitest'
import { weekOf, weeklyCapacity } from './schedule'
import type { Thought } from './types'

let n = 0
const finished = (id: string, completedAt: string, effort: number): Thought =>
  ({
    id,
    user_id: 'u',
    raw_content: id,
    title: id,
    type: 'action',
    status: 'done',
    effort,
    due_date: null,
    completed_at: completedAt,
    extra: {},
    created_at: new Date(Date.UTC(2026, 0, 1, 0, n++)).toISOString(),
  }) as Thought

describe('which week you finished something in, from where you are standing', () => {
  it('counts an evening tick as the evening it was, not tomorrow morning in London', () => {
    /*
     * `completed_at` is written as `new Date().toISOString()`, which is UTC. In
     * Los Angeles that means everything ticked after four in the afternoon
     * carries tomorrow's date — so reading the first ten characters of it and
     * calling that the day is wrong for most of a working evening, and wrong
     * about the *week* for anything finished on a Sunday night.
     *
     * 2026-03-02T04:00:00Z is eight o'clock on Sunday evening in Los Angeles,
     * which is the week ending March 1st — not the week beginning March 2nd.
     */
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone, 'this test is meaningless in UTC').not.toBe(
      'UTC',
    )
    /*
     * Two finished weeks, and the second of them consists of one Sunday-evening
     * tick. Filed under the wrong week, that week reads as empty and the median
     * of [0, 4] is 2; filed correctly it is the median of [4, 5], which is 5.
     * Deliberately arranged so the misfiling moves the answer — an earlier
     * version of this test put the stray tick in a week that already had work
     * in it, where the median absorbed it and the test passed either way.
     */
    const done = [
      // week of Feb 16, an ordinary one
      finished('b', '2026-02-18T20:00:00.000Z', 4),
      // week of Feb 23 — nothing until Sunday night, 8pm in Los Angeles, which
      // `toISOString` records as the 2nd of March
      finished('sunday', '2026-03-02T04:00:00.000Z', 5),
    ]
    expect(weekOf('2026-03-01'), 'Sunday belongs to the week that began on Monday').toBe('2026-02-23')
    const cap = weeklyCapacity(done, '2026-03-02')
    expect(
      cap.effort,
      'the Sunday-evening tick was filed under a week that had not started yet',
    ).toBeGreaterThanOrEqual(4)
  })
})

/*
 * …and the same question asked of the app as a whole.
 *
 * The sky carried its own `todayISO` — `new Date().toISOString().slice(0, 10)`,
 * which is what day it is in London — while the roadmap used the domain's,
 * which is what day it is where you are. In Los Angeles those disagree from
 * five in the afternoon until midnight: seven hours out of twenty-four in which
 * one tab thinks it is tomorrow.
 *
 * A source pin rather than a behaviour test, because the sky is an eight
 * thousand line imperative closure with no seam to call this through. What it
 * guards is that there is one definition of today in the app, not two.
 */
describe('one definition of what day it is', () => {
  it('does not let the sky keep its own, in UTC', async () => {
    const { readFileSync } = await import('node:fs')
    const sky = readFileSync('src/features/sky/SkyPage.tsx', 'utf8')
    expect(sky, 'the sky went back to reading the day off a UTC timestamp').not.toMatch(
      /const todayISO = \(\) => new Date\(\)\.toISOString\(\)/,
    )
    expect(sky, 'the sky is not using the domain’s local day').toMatch(/todayISO as localToday/)
  })
})
