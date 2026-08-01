import { describe, expect, it } from 'vitest'
import { DAILY_USD_CAP, MODEL_FOR_TIER, SEARCH_USD, costUSD, estimateUSD, weighInput } from './pricing'
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
  const est = (name: string, chars = 0, images = 0) => {
    const d = ACTION_REGISTRY[name]
    return estimateUSD(d, MODEL_FOR_TIER[d.modelTier], chars, images)
  }

  /*
   * Measured, from 154 real runs in agent_runs. The first version of this
   * estimator was calibrated against a guess and came out three times *under*
   * on the actions that matter — a spend cap the most expensive thing in the
   * app could walk straight past.
   */
  const MEASURED: Record<string, number> = {
    find_like: 0.3628,
    deepen: 0.2959,
    answer: 0.1221,
    draft: 0.0421,
    organize: 0.0363,
    cluster: 0.0303,
    rain: 0.0224,
    reshape: 0.0267,
    classify_thought: 0.0023,
    name_pool: 0.0014,
    gauge: 0.0026,
  }

  it('is never under what these runs really cost', () => {
    // the only property that matters: a ceiling below the real figure is not a
    // ceiling, and this is the one the first version failed
    for (const [name, real] of Object.entries(MEASURED)) {
      expect(est(name, 4000, name === 'find_like' ? 1 : 0), name).toBeGreaterThanOrEqual(real)
    }
  })

  it('is not so far over that a real run gets refused for a dollar it will not spend', () => {
    for (const [name, real] of Object.entries(MEASURED)) {
      expect(est(name, 4000, name === 'find_like' ? 1 : 0) / real, name).toBeLessThan(11)
    }
  })

  it('charges a search for every turn it is carried in, not once', () => {
    // three searches cost far more than three times one, because every turn
    // re-sends the whole transcript — which is why find_like measured at
    // 78,986 input tokens and the old linear guess said 7,400
    const one = estimateUSD({ maxTokens: 3000, searchMaxUses: 1 }, 'claude-sonnet-5', 4000)
    const three = estimateUSD({ maxTokens: 3000, searchMaxUses: 3 }, 'claude-sonnet-5', 4000)
    expect(three).toBeGreaterThan(one * 3)
  })

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

  it('weighs a photograph as a photograph, not as ninety thousand words', () => {
    // A picture travels as base64 inside the input. Counting its characters
    // charged a 200KB photo as ~90k tokens *per turn*, so `find_like` — which
    // is entirely about photographs — would have been refused for a dollar it
    // was never going to spend.
    const big = 'A'.repeat(280_000)
    const w = weighInput({ subject: { id: 'p1', title: 'Photo' }, image: { mediaType: 'image/jpeg', dataB64: big } })
    expect(w.images).toBe(1)
    expect(w.chars).toBeLessThan(400)
  })

  it('counts every picture, and none of them twice', () => {
    const w = weighInput({ images: [{ dataB64: 'aaaa' }, { dataB64: 'bbbb' }], note: 'dataB64 is not a key here' })
    expect(w.images).toBe(2)
  })

  it('costs an image something rather than nothing', () => {
    expect(est('find_like', 400, 1)).toBeGreaterThan(est('find_like', 400, 0))
  })

  it('leaves room for a real day of work inside the cap', () => {
    /*
     * The cap is only worth having if it is not in the way.
     *
     * This used to ask for eight of the heaviest run to fit, back when the
     * estimate for one was a third of what it really costs. Corrected against
     * the measured figures it is six — and six is the right shape: the
     * *estimate* for a searching run is conservative by two to three times, so
     * a day that the gate says holds six of them really holds fifteen or more.
     */
    const dearest = Math.max(...Object.keys(ACTION_REGISTRY).map((n) => est(n, 8_000)))
    expect(dearest).toBeLessThan(DAILY_USD_CAP / 6)
  })

  it('refuses nothing on its own — a fresh day affords the most expensive run', () => {
    const dearest = Math.max(...Object.keys(ACTION_REGISTRY).map((n) => est(n, 8_000)))
    expect(dearest).toBeLessThan(DAILY_USD_CAP)
  })
})
