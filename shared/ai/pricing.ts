// $ per million tokens. Keep in sync with https://docs.claude.com pricing.
// Cost logging is best-effort observability, not billing.
export const PRICING: Record<string, { in: number; out: number }> = {
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

export function costUSD(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model]
  if (!p) return 0
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000
}

export const MODEL_FOR_TIER: Record<'fast' | 'smart', string> = {
  fast: 'claude-haiku-4-5',
  smart: 'claude-sonnet-5',
}
