import { describe, expect, it } from 'vitest'
import { SEARCH_USD, costUSD } from './pricing'

describe('what a run actually cost', () => {
  it('prices the tokens', () => {
    // 10k in, 2k out on Sonnet: 10_000 × 3 + 2_000 × 15 per million
    expect(costUSD('claude-sonnet-5', 10_000, 2_000)).toBeCloseTo(0.06, 6)
  })

  it('prices the searching, which it did not price at all', () => {
    // A deep `deepen` makes four searches. That is more than the tokens of
    // most runs in this app, and every cost figure written to `agent_runs` for
    // a searching action was short by exactly the part that dominates it.
    const tokens = costUSD('claude-sonnet-5', 10_000, 2_000)
    expect(costUSD('claude-sonnet-5', 10_000, 2_000, 4)).toBeCloseTo(tokens + 4 * SEARCH_USD, 6)
  })

  it('still counts the searching when the model is one it has no price for', () => {
    // a model added upstream before this table catches up must not make the
    // search cost vanish along with the token cost
    expect(costUSD('claude-something-new', 10_000, 2_000, 3)).toBeCloseTo(3 * SEARCH_USD, 6)
  })

  it('is unchanged for everything that does not search', () => {
    expect(costUSD('claude-haiku-4-5', 1_000, 500, 0)).toBeCloseTo(costUSD('claude-haiku-4-5', 1_000, 500), 9)
  })
})
