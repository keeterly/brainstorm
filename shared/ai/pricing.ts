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

/**
 * What one web search really adds to the bill.
 *
 * This was 2,000, which was a guess, and the guess was wrong by a factor of
 * six. Measured over 154 real runs: `find_like` with three searches averaged
 * **78,986 input tokens**, `deepen` with four averaged 63,144. A page of
 * results is a few thousand tokens — but every turn re-sends the whole
 * transcript, so the results of search one are paid for again on turn two,
 * again on turn three, and again on turn four.
 *
 * That is why the growth is quadratic below rather than linear, and 12,000 per
 * search with that shape reproduces the measured figure for `find_like` almost
 * exactly and over-states the others, which is the direction a gate should err
 * in. Before this, the ceiling on `find_like` was $0.126 against a real cost of
 * $0.363: the spend cap could be walked past threefold by the most expensive
 * action in the app.
 */
export const SEARCH_TOKENS = 12_000
/** the system prompt, the memory block and the tool schema, together */
export const SYSTEM_TOKENS = 1400

/**
 * What a run's input weighs, which is not the length of its JSON.
 *
 * A photograph travels as base64 inside the input, so measuring the input by
 * its character count charges a 200KB picture as ninety thousand tokens of
 * prose — per turn — and `find_like`, which is entirely about photographs,
 * would have been refused for a dollar it was never going to spend. An image
 * costs about 1,600 tokens whatever its file size, so it is counted as one
 * thing rather than as a very long string.
 */
export const IMAGE_TOKENS = 1600
export function weighInput(input: unknown): { chars: number; images: number } {
  let images = 0
  const json = JSON.stringify(input, (k, v) => {
    if (k === 'dataB64' && typeof v === 'string') {
      images++
      return ''
    }
    return v
  })
  return { chars: json?.length ?? 0, images }
}

export function estimateUSD(
  def: { maxTokens: number; searchMaxUses?: number },
  model: string,
  inputChars = 0,
  images = 0,
): number {
  const p = PRICING[model]
  if (!p) return 0
  const searches = def.searchMaxUses ?? 0
  // One turn to ask, and one more for each search it is allowed to make.
  const turns = 1 + searches
  // The prompt is re-sent every turn, and so is every result already gathered
  // — which is where the quadratic comes from, and why the old linear guess
  // was out by a factor of three on the runs that matter.
  const base = Math.ceil(inputChars / 3.5) + SYSTEM_TOKENS + images * IMAGE_TOKENS
  const inTok = base * turns + (SEARCH_TOKENS * searches * (searches + 1)) / 2
  // `maxTokens` is a per-turn ceiling, not a total: a searching run emits on
  // every turn. Measured at about half of it per turn.
  const outTok = def.maxTokens * turns * 0.5
  const cost = (inTok * p.in + outTok * p.out) / 1_000_000 + searches * SEARCH_USD
  // A tenth on top. Not superstition: checked against the measured averages,
  // the closest of them — `cluster` — came out within a twentieth of a per
  // cent *under*, and a ceiling that is right on the nose is a ceiling that
  // goes under the moment a prompt grows by a sentence.
  return cost * 1.1
}
