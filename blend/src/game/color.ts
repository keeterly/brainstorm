// Colour, the way a child mixes paint rather than the way a screen adds light.
//
// Every drop carries its colour as a point in RYB — how much red, how much
// yellow, how much blue is in the pot. That space is chosen for one reason:
// blue and yellow have to make green. In RGB they make grey, and a game about
// blending colours whose blends are wrong is a game about nothing.
//
// Two rules hold this whole game together, and both live here:
//
//   1. **A blend is the mass-weighted mean of what went in.** Nothing else.
//      No normalising, no brightening, no clever saturation recovery — every
//      one of those makes the mix depend on the order you poured, and an order
//      you cannot see is a puzzle you cannot plan. Because it is a plain mean,
//      merging a set of drops gives the same colour whichever way you pair
//      them up, and the solver can reason about sets instead of sequences.
//
//   2. **The screen may flatter it; the maths may not.** Pigment mixing dulls,
//      truthfully and unattractively — three primaries in a pot is mud. So the
//      chroma is lifted on the way to the screen, in OKLab, where lifting
//      chroma does not drag the hue with it. That happens at paint time only.
//      What the rules compare is always the honest number.

/** How much red, yellow and blue is in the pot. Each 0…1. */
export type RYB = readonly [number, number, number]
/** sRGB, 0…255. */
export type RGB = readonly [number, number, number]

/**
 * The eight corners of the RYB cube, in sRGB — Gosset & Chen's values, which
 * are the ones that make yellow + blue read as a leaf rather than as a bruise.
 * Note the ends: (0,0,0) is *white* here, an empty pot, and (1,1,1) is the
 * black you get by tipping all three in.
 */
const CUBE: Record<string, RGB> = {
  '000': [255, 255, 255], // nothing in the pot
  '100': [255, 39, 39], //   red
  '010': [255, 228, 32], //  yellow
  '001': [42, 95, 153], //   blue
  '110': [255, 145, 20], //  orange
  '101': [130, 44, 148], //  violet
  '011': [22, 168, 82], //   green
  '111': [26, 20, 18], //    all three: near black
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** The colour a pot of this recipe actually is, before any flattery. */
export function rybToRgb(c: RYB): RGB {
  const [r, y, b] = [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])]
  const out: number[] = []
  for (let i = 0; i < 3; i++) {
    const x00 = lerp(CUBE['000'][i], CUBE['100'][i], r)
    const x10 = lerp(CUBE['010'][i], CUBE['110'][i], r)
    const x01 = lerp(CUBE['001'][i], CUBE['101'][i], r)
    const x11 = lerp(CUBE['011'][i], CUBE['111'][i], r)
    out.push(lerp(lerp(x00, x10, y), lerp(x01, x11, y), b))
  }
  return [out[0], out[1], out[2]]
}

/* ── OKLab, for two jobs: judging sameness, and lifting chroma ───────────── */

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

export function oklab(rgb: RGB): [number, number, number] {
  const r = toLinear(clamp01(rgb[0] / 255))
  const g = toLinear(clamp01(rgb[1] / 255))
  const b = toLinear(clamp01(rgb[2] / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function unOklab(lab: [number, number, number]): RGB {
  const [L, A, B] = lab
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [
    Math.round(clamp01(toSrgb(r)) * 255),
    Math.round(clamp01(toSrgb(g)) * 255),
    Math.round(clamp01(toSrgb(b)) * 255),
  ]
}

/** How far apart two colours look. Zero is the same colour. */
export function delta(a: RYB, b: RYB): number {
  const p = oklab(rybToRgb(a))
  const q = oklab(rybToRgb(b))
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/**
 * Close enough to be the same colour.
 *
 * Every level is built so that its answers are exact, so this is float slack
 * and nothing else: wide enough that a mean of thirds lands inside it, far
 * too narrow for a wrong mix to sneak through. A near miss is a miss, and the
 * drop bumps off the core rather than half-joining it.
 */
export const SAME = 0.012
export const same = (a: RYB, b: RYB) => delta(a, b) <= SAME

/** What the drop looks like on the glass — the honest colour, chroma lifted. */
export function paint(c: RYB, lift = 1.34): RGB {
  const rgb = rybToRgb(c)
  const [L, A, B] = oklab(rgb)
  return unOklab([L, A * lift, B * lift])
}

/** …as the `r, g, b` triplet the stylesheet wants. */
export function tint(c: RYB, lift?: number): string {
  const [r, g, b] = paint(c, lift)
  return `${r}, ${g}, ${b}`
}

/**
 * A blend: everything in the pot at once, each pulling its own weight.
 *
 * Weighted by mass, so a big drop of red and a small one of blue is not a
 * halfway violet — it is red with a bruise. That is the whole of the game's
 * arithmetic, and the reason a drop's size is worth reading before you drag it.
 */
export function blend(parts: readonly { color: RYB; mass: number }[]): RYB {
  let m = 0
  const sum = [0, 0, 0]
  for (const p of parts) {
    m += p.mass
    for (let i = 0; i < 3; i++) sum[i] += p.color[i] * p.mass
  }
  if (m <= 0) return [0, 0, 0]
  return [sum[0] / m, sum[1] / m, sum[2] / m]
}

/**
 * The pots on the shelf. Levels are written in these names, so a level reads
 * as a recipe rather than as a table of numbers.
 */
export const PIGMENT = {
  red: [1, 0, 0],
  yellow: [0, 1, 0],
  blue: [0, 0, 1],
  orange: [0.5, 0.5, 0],
  green: [0, 0.5, 0.5],
  violet: [0.5, 0, 0.5],
  clear: [0, 0, 0],
  ink: [1, 1, 1],
} as const satisfies Record<string, RYB>

export type Pigment = keyof typeof PIGMENT
