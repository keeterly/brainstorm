// The ring this world sends out from a point that was touched.
//
// There were two unrelated answers to "something happened here". The sky's live
// drops sent out `echoRing` — a wobbled closed curve, stacked in layers that
// never line up, each layer's shape fixed by its seed so it keeps that shape as
// it travels. Everything else sent out a `div` with `border-radius: 50%`: a
// compass circle, the one shape nothing else in this world has. Side by side
// the difference is not subtle, and the circle is plainly the worse of the two.
//
// So there is one ripple now, and it is the amorphous one. Same curve, same
// harmonics, same rule that a shape is fixed by its seed rather than boiling as
// it grows — a press on a button and a drop coming alive are the same water
// answering, at different volumes.
//
// Drawn as SVG rather than a bordered box because a wobble cannot be expressed
// as a border-radius. Grown with a CSS `transform` rather than by redrawing the
// path per frame, so the ring travels outward without changing shape, and
// `non-scaling-stroke` keeps the line a hairline the whole way out rather than
// thickening into a donut.
import { echoRing } from './echo'

const NS = 'http://www.w3.org/2000/svg'

export interface RippleSpec {
  /** `[diameter, delay in ms]` for each ring, in the order they leave. */
  rings: readonly (readonly [number, number])[]
  /** How long one ring takes to travel out and fade. */
  life?: number
  /** How far from round. The sky's live echoes sit around 0.03–0.09. */
  wobble?: number
  /** Squashed toward the horizontal, for a ring spreading across a surface. */
  flatten?: number
  /** How bright the ring is as it leaves. */
  lit?: number
  /** How it travels — out fast, then easing off, like a wave losing its push. */
  ease?: string
  /**
   * The diameter each ring is already at when it leaves.
   *
   * Left out, a ring grows from a fifth of its size — near enough to a point,
   * which is right for a fingertip on a surface. It is wrong for something
   * that came out of an object: the first rings are then born *inside* the
   * thing and the ripple reads as happening under it rather than off it. Set
   * this to the thing's own diameter and every ring leaves its rim.
   */
  start?: number
  /**
   * Fixes the shape. The same point ripples the same way every time, which is
   * the rule the rest of this world's geometry follows; left out, it is taken
   * from the coordinates so a double-tap in one place agrees with itself.
   */
  seed?: number
}

/** How much the wobble can push a ring past its nominal radius. */
const OVERSHOOT = 1.1

/** The two shapes the app makes over and over, named rather than repeated. */
export const TOUCH: RippleSpec = {
  rings: [
    [34, 0],
    [64, 90],
  ],
  life: 900,
}

/**
 * A press-and-hold, which is a longer and softer act than a tap.
 *
 * Four rings over the first third of a second, growing as they go, running out
 * ahead of the page into the sky it has not reached yet.
 */
export const WAKE: RippleSpec = {
  rings: [
    [64, 0],
    [128, 90],
    [230, 200],
    [360, 330],
  ],
  life: 1300,
  lit: 0.62,
  wobble: 0.075,
  ease: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
}

/** How far past the rim each ring gets, in order. */
const ROUSED_REACH = [17, 41, 72, 110] as const

/**
 * Something in the sky, roused by a finger held on it.
 *
 * Leaving its rim rather than its middle — a ripple whose first ring is
 * smaller than the bubble it came out of looks like weather behind the bubble,
 * not the bubble answering. Four rings, each reaching further and each a
 * little less bright, over the beat in which its actions arrive.
 *
 * The reach is **added** to the rim, not multiplied by it. Multiplying was the
 * obvious thing and it was wrong: at three and a half times its diameter, an
 * open group threw a ring wider than the phone, so what you saw was a curve
 * crossing the whole screen with its centre nowhere in sight and no visible
 * relationship to the thing that sent it. Adding gives a halo of the same
 * thickness whatever it came off, which is what makes it legible as *this
 * thing's* answer — a big group and a small drop both get a ring hugging their
 * own edge.
 *
 * @param d the thing's diameter, measured, because a drop, an opened card and
 *   a group are three very different sizes.
 */
export function roused(d: number, seed?: number): RippleSpec {
  const w = Math.max(44, d)
  return {
    rings: ROUSED_REACH.map((reach, i) => [w + reach * 2, [0, 95, 205, 330][i]] as const),
    start: w,
    life: 1150,
    // brighter than the ambient pulse it has to be told apart from: this one
    // is an answer to something you just did, not weather
    lit: 0.86,
    wobble: 0.062,
    ease: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    seed,
  }
}

/** Something landing on the surface, seen from just above it. */
export const SPLASH: RippleSpec = {
  rings: [
    [26, 0],
    [48, 60],
  ],
  life: 950,
  flatten: 0.32,
}

/** The shape of a disturbance at this point, so it is the same one twice. */
function seedAt(x: number, y: number): number {
  return ((x * 0.618033 + y * 0.318309) % 1) * 9.7
}

/**
 * Ring the surface at a point on the screen.
 *
 * Coordinates are viewport coordinates — what a pointer event gives you.
 * Returns the element, so a caller that wants it gone early can take it away;
 * it clears itself up otherwise.
 */
export function rippleAt(x: number, y: number, spec: RippleSpec): SVGSVGElement | null {
  if (typeof document === 'undefined' || !spec.rings.length) return null
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null

  const { rings, life = 900, wobble = 0.055, flatten = 1, lit = 0.9, ease = 'ease-out', start = 0 } = spec
  const seed = spec.seed ?? seedAt(x, y)

  // one box, big enough for the widest ring at full wobble, centred on the
  // point — so every ring's origin is the local 0,0 and the whole disturbance
  // is one element to put up and take down
  const reach = Math.max(...rings.map(([d]) => d)) * 0.5 * OVERSHOOT
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'ripple-echo')
  svg.setAttribute('viewBox', `${-reach} ${-reach} ${reach * 2} ${reach * 2}`)
  svg.style.width = svg.style.height = `${reach * 2}px`
  svg.style.left = `${x - reach}px`
  svg.style.top = `${y - reach}px`
  if (flatten !== 1) svg.style.transform = `scaleY(${flatten})`

  let last = 0
  rings.forEach(([diameter, delay], i) => {
    const p = document.createElementNS(NS, 'path')
    // each ring is drawn at its own final size and grown from nearly nothing,
    // and wobbles a little more the further out it is going — the way a wave
    // loses its edge with distance
    p.setAttribute('d', echoRing(0, 0, diameter / 2, seed + i * 2.7, wobble + i * 0.014))
    // …from the rim of whatever sent it, when there is one. Capped below the
    // ring itself: a ring that starts where it ends never travels.
    if (start > 0) p.style.setProperty('--from', String(Math.min(0.92, start / diameter)))
    p.style.setProperty('--life', `${life}ms`)
    p.style.setProperty('--wait', `${delay}ms`)
    p.style.setProperty('--lit', String(lit * (1 - i * 0.12)))
    p.style.animationTimingFunction = ease
    svg.appendChild(p)
    last = Math.max(last, delay + life)
  })

  document.body.appendChild(svg)
  setTimeout(() => svg.remove(), last + 120)
  return svg
}
