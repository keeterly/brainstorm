// Colour, as a child understands it: three pots you can dip into, and the six
// things they make between them.
//
// The first version of this mixed real pigment — a mass-weighted mean in RYB
// space, continuous, physically honest, and unreadable. Two parts red to one
// of yellow is a colour with no name, and a puzzle whose pieces have no names
// is a puzzle you cannot plan out loud. So a drop is no longer a point in a
// colour space. It is a *set*: which of red, yellow and blue are in it.
//
// Blending is then the union of two sets, and that one decision buys the whole
// game its grammar:
//
//   red + red     = red      — the same colour, and twice the drop
//   red + yellow  = orange
//   orange + red  = orange   — the red was already in there
//   orange + blue = ink      — all three, and nothing to be done about it
//
// Union is commutative, associative and idempotent, so a handful of drops has
// one answer however you pair them up, and pouring in the wrong order can
// never quietly ruin a plan. What it *cannot* do is come back apart: a colour
// only ever grows. That is the whole risk in the game, and it is legible at a
// glance rather than hidden in a decimal.

export const RED = 1
export const YELLOW = 2
export const BLUE = 4

/** Which primaries are in a drop, as the three bits R, Y, B. */
export type Hue = number

export const HUE = {
  clear: 0,
  red: RED,
  yellow: YELLOW,
  orange: RED | YELLOW,
  blue: BLUE,
  violet: RED | BLUE,
  green: YELLOW | BLUE,
  ink: RED | YELLOW | BLUE,
} as const

export type HueName = keyof typeof HUE

const NAMES = Object.entries(HUE) as [HueName, Hue][]
export const nameOf = (h: Hue): HueName => NAMES.find(([, v]) => v === h)?.[0] ?? 'clear'

/**
 * The seven colours, chosen flat and bright rather than blended.
 *
 * They sit inside glass over a dark sky and each one has to be nameable across
 * a room — the muted mineral wash the old model produced was honest paint and
 * six shades of the same guess to look at.
 */
const PAINT: Record<Hue, string> = {
  [HUE.clear]: '226, 236, 246',
  [HUE.red]: '235, 61, 52',
  [HUE.yellow]: '244, 202, 46',
  [HUE.orange]: '245, 134, 32',
  [HUE.blue]: '48, 124, 214',
  [HUE.violet]: '146, 76, 194',
  [HUE.green]: '46, 168, 92',
  // all three: not black, which would be a hole in the sky, but the deep
  // plum-grey a full pot actually goes
  [HUE.ink]: '104, 88, 116',
}

/** …as the `r, g, b` triplet the stylesheet wants. */
export const tint = (h: Hue): string => PAINT[h] ?? PAINT[HUE.clear]

/** Everything in the pot at once. The pot does not care about the order. */
export const blend = (...hues: Hue[]): Hue => hues.reduce((a, b) => a | b, 0)

/** The same colour, exactly. There is no nearly, and no tolerance to tune. */
export const same = (a: Hue, b: Hue) => a === b

/** Whether everything in `a` is already in `b` — a red belongs in an orange. */
export const within = (a: Hue, b: Hue) => (a & b) === a

/** The primaries a colour is made of, for the pips that spell the core out. */
export const primaries = (h: Hue): Hue[] => [RED, YELLOW, BLUE].filter((p) => h & p)

/** What a drop of this colour still needs to become that one, if it can. */
export const missing = (from: Hue, to: Hue): Hue => (within(from, to) ? to & ~from : -1)
