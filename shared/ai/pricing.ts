// $ per million tokens. Keep in sync with https://docs.claude.com pricing.
// Cost logging is best-effort observability, not billing.
export const PRICING: Record<string, { in: number; out: number }> = {
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

/**
 * $ per web search.
 *
 * This was missing entirely, and it is not a rounding error: a deep `deepen`
 * makes four searches, which costs more than the tokens of most runs in this
 * app. Every cost figure written to `agent_runs` for a searching action was
 * therefore too low by the part that dominates it.
 */
export const SEARCH_USD = 0.01

export function costUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
  searches = 0,
): number {
  const p = PRICING[model]
  const tokens = p ? (inputTokens * p.in + outputTokens * p.out) / 1_000_000 : 0
  return tokens + searches * SEARCH_USD
}

export const MODEL_FOR_TIER: Record<'fast' | 'smart', string> = {
  fast: 'claude-haiku-4-5',
  smart: 'claude-sonnet-5',
}

/**
 * The most runs one person may start in a day.
 *
 * Lived as a hand-copied `const` in two function files, which is the kind of
 * duplication that stays in step right up until the day it matters.
 */
export const DAILY_RUN_CAP = 400
