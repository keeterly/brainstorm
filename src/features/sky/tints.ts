// A colour you gave it, and what that is allowed to mean.
//
// The sky tells you a great deal — what is saturated, what has a brief, what
// is due, what holds what — and all of it is the app's reading of your work.
// None of it is *yours*. A colour is: it means whatever you decide it means,
// this week, for these things, and the app never touches it, never infers it,
// and never uses it to decide anything. That is the whole point of it.
//
// Six, and no more. A palette you can hold in your head is a language; a
// colour picker is a decision every time you use it. They are muted on
// purpose — these sit inside glass over a sky that changes colour all day,
// and anything saturated enough to be a highlighter reads as an error state.
export const TINTS = {
  rose: '214, 128, 134',
  amber: '212, 165, 108',
  moss: '140, 176, 134',
  sea: '112, 168, 192',
  iris: '152, 142, 206',
  ash: '156, 166, 180',
} as const

export type TintName = keyof typeof TINTS

export function isTint(v: unknown): v is TintName {
  // `in` walks the prototype chain, so `'constructor' in TINTS` is true and a
  // thought carrying `tint: 'constructor'` passed this check and then handed
  // `Object` itself to a CSS variable. `extra` is a free-form blob written by
  // several flows and by older versions of this app; own keys only.
  return typeof v === 'string' && Object.hasOwn(TINTS, v)
}

/** The colour on a thought, or null when it has none — which is most of them. */
export function tintOf(extra: Record<string, unknown> | null | undefined): TintName | null {
  const v = extra?.tint
  return isTint(v) ? v : null
}

/** …as the rgb triplet the stylesheet wants. */
export function tintRGB(name: TintName): string {
  return TINTS[name]
}

export const TINT_NAMES = Object.keys(TINTS) as TintName[]
