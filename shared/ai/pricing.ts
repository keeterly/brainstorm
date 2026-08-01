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
 * The most one person may spend in a day, in dollars.
 *
 * The real cap. It used to be a count of runs, which is a cap on nothing: a
 * `gauge` costs a fifth of a cent and a deep `draft` with four searches costs
 * around fifteen, so four hundred runs was somewhere between eighty cents and
 * sixty dollars depending entirely on which four hundred they happened to be.
 * The count told you nothing about either number.
 *
 * Six dollars is roughly forty real pieces of work in a day — far more than
 * anybody does — and it is a figure that can be reasoned about, which the old
 * one could not.
 */
export const DAILY_USD_CAP = 6

/**
 * …and a hard ceiling on how many runs may be started, whatever they cost.
 *
 * Kept as a backstop rather than as the cap. A loop firing the cheapest action
 * in the app as fast as the network allows would take a long time to reach six
 * dollars and would be doing damage the whole way, so there is still a number
 * of runs past which something is plainly wrong.
 */
export const DAILY_RUN_CAP = 400

/** what a page of search results adds to the next turn's input */
export const SEARCH_TOKENS = 2000
/** the system prompt, the memory block and the tool schema, together */
export const SYSTEM_TOKENS = 1400

/**
 * What a run might cost, worked out before it is allowed to start.
 *
 * A dollar cap is worth having only if it cannot be walked straight past by
 * the run that reaches it. Metering purely after the fact leaves the last run
 * of the day unbounded — so every run is charged its estimate the moment it is
 * opened, and the true figure replaces the estimate when it finishes. That
 * also means a run still in flight, or one that died without ever finishing,
 * is counted rather than sitting at zero for ever.
 *
 * Deliberately an over-estimate, and these are the assumptions:
 *
 *  - Output at `maxTokens`. Almost nothing fills its budget; the ones that
 *    matter come close.
 *  - Input at the serialized input plus a fixed allowance for the system
 *    prompt, the memory block and the tool schema. Three and a half characters
 *    to the token is about right for English prose with JSON in it.
 *  - Every search allowed is a search made, and each one puts a page of
 *    results into the next turn's input.
 *  - One retry. The engine has a transport retry and a schema-repair retry,
 *    and a run that uses either pays for its input twice.
 *
 * The result is high — commonly two or three times what a run really costs —
 * which is the right direction to be wrong in for a thing whose job is to
 * refuse.
 */
export function estimateUSD(
  def: { maxTokens: number; searchMaxUses?: number },
  model: string,
  inputChars = 0,
): number {
  const p = PRICING[model]
  if (!p) return 0
  const searches = def.searchMaxUses ?? 0
  const inTok = Math.ceil(inputChars / 3.5) + SYSTEM_TOKENS + searches * SEARCH_TOKENS
  const tokens = (inTok * 2 * p.in + def.maxTokens * p.out) / 1_000_000
  return tokens + searches * SEARCH_USD
}
