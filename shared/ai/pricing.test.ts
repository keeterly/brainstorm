import { describe, expect, it } from 'vitest'
import { DAILY_USD_CAP, MODEL_FOR_TIER, SEARCH_USD, costUSD, estimateUSD } from './pricing'
import { ACTION_REGISTRY } from './registry'

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

describe('what a run might cost, before it is allowed to start', () => {
  const est = (name: string, chars = 0) => {
    const d = ACTION_REGISTRY[name]
    return estimateUSD(d, MODEL_FOR_TIER[d.modelTier], chars)
  }

  it('is an over-estimate of what the same run really costs', () => {
    // The direction to be wrong in, for a thing whose job is to refuse.
    const d = ACTION_REGISTRY.deepen
    const real = costUSD(MODEL_FOR_TIER[d.modelTier], 9_000, 3_000, d.searchMaxUses ?? 0)
    expect(est('deepen')).toBeGreaterThan(real)
  })

  it('charges the searching, which is what dominates the expensive actions', () => {
    const d = ACTION_REGISTRY.deepen
    const searches = d.searchMaxUses ?? 0
    expect(searches).toBeGreaterThan(0)
    // dropped to none, the same action is markedly cheaper — which is the
    // whole reason `gauge` runs first
    expect(estimateUSD({ maxTokens: d.maxTokens, searchMaxUses: 0 }, MODEL_FOR_TIER[d.modelTier])).toBeLessThan(
      est('deepen') - searches * SEARCH_USD,
    )
  })

  it('grows with what is actually being sent', () => {
    expect(est('organize', 40_000)).toBeGreaterThan(est('organize', 200))
  })

  it('is nothing for a model with no price, rather than a guess', () => {
    expect(estimateUSD({ maxTokens: 9_000 }, 'claude-something-new')).toBe(0)
  })

  it('leaves room for a real day of work inside the cap', () => {
    // The cap is only worth having if it is not in the way. The heaviest thing
    // in the app, at the full estimate, must still fit several times over.
    const dearest = Math.max(...Object.keys(ACTION_REGISTRY).map((n) => est(n, 8_000)))
    expect(dearest).toBeLessThan(DAILY_USD_CAP / 8)
  })

  it('refuses nothing on its own — a fresh day affords the most expensive run', () => {
    const dearest = Math.max(...Object.keys(ACTION_REGISTRY).map((n) => est(n, 8_000)))
    expect(dearest).toBeLessThan(DAILY_USD_CAP)
  })
})
