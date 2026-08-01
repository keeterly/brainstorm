import { describe, expect, it } from 'vitest'
import { spentToday } from './RunsPage'
import type { AgentRun } from '@/domain/types'

const NOW = new Date('2026-08-01T15:00:00Z')
const at = (iso: string, cost: unknown): AgentRun =>
  ({ id: iso, created_at: iso, cost_usd: cost, status: 'succeeded' }) as unknown as AgentRun

describe('what today has cost', () => {
  it('adds up today and leaves yesterday out of it', () => {
    // the cap resets at midnight UTC, so the sum has to start there
    const runs = [at('2026-08-01T14:00:00Z', 0.2), at('2026-08-01T00:30:00Z', 0.3), at('2026-07-31T23:30:00Z', 5)]
    expect(spentToday(runs, NOW)).toBeCloseTo(0.5, 6)
  })

  it('counts a run that has not finished, because it is not free', () => {
    // the estimate goes on at insert and is corrected at finish, so there is
    // always a figure — this is what stops a run in flight reading as zero
    const runs = [at('2026-08-01T14:59:00Z', 0.22)]
    expect(spentToday(runs, NOW)).toBeCloseTo(0.22, 6)
  })

  it('reads the numeric column however PostgREST sends it', () => {
    expect(spentToday([at('2026-08-01T10:00:00Z', '0.123456')], NOW)).toBeCloseTo(0.123456, 6)
  })

  it('treats a missing figure as nothing rather than as NaN', () => {
    // one bad row must not wipe out the whole reading
    const runs = [at('2026-08-01T10:00:00Z', null), at('2026-08-01T11:00:00Z', 0.4), at('2026-08-01T12:00:00Z', 'x')]
    expect(spentToday(runs, NOW)).toBeCloseTo(0.4, 6)
  })

  it('is zero on a day with nothing in it', () => {
    expect(spentToday([], NOW)).toBe(0)
  })
})
