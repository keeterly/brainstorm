// The sky is alive, by three pixels.
//
// Pulled out of the render loop because it is the one piece of the physics
// that got the maths wrong in a way nothing could see, and because the
// difference between the two versions is a single word.
//
// It used to read:
//
//     p.x += Math.sin(t * 0.09 + i * 2.1) * 0.06
//
// Adding a sine to a position sixty times a second does not wobble a thing —
// it *integrates* it. The excursion of an integrated sine is its amplitude
// over its frequency, and with `t` advancing 0.016 a frame that works out at
// 0.06/0.016 = 3.75 per unit of t, over 0.09, which is **forty-two pixels**.
// Another forty-three in y, ninety degrees out of phase, on a seventy-second
// round trip.
//
// Measured on the built app: every drop wandered between thirty and a hundred
// and one pixels away from where it had been put, and then slowly came back,
// for as long as the app was open. Nobody wrote that on purpose. What was
// wanted was a sky that breathes.
//
// So it returns an offset. The drop's real position never moves — see
// Pos.bx/by and glide — which means the arrangement you made survives, a
// layout saved mid-breath saves where things belong rather than wherever the
// sine happened to be, and the sky still visibly lives.

/** How far, in pixels. Small enough to read as breathing, not as travelling. */
export const BREATH_X = 3.2
export const BREATH_Y = 2.6
/**
 * How fast.
 *
 * Six times the old figure, and that is not a fix so much as the other half of
 * the same misunderstanding: at 0.09 the cycle took seventy seconds, which is
 * far too slow to read as breath even at the right amplitude — a thing that
 * takes a minute to move and come back is not breathing, it is wandering. At
 * 0.55 a cycle is about eleven seconds, which is roughly the pace of something
 * asleep.
 */
export const BREATH_RATE = 0.55

/**
 * Where this drop is, relative to where it belongs.
 *
 * `i` only spaces the phases out so a sky full of drops never falls into step
 * and pulses as one.
 */
export function breath(t: number, i: number): { x: number; y: number } {
  const a = t * BREATH_RATE + i * 2.1
  return { x: Math.sin(a) * BREATH_X, y: Math.cos(a * 0.8) * BREATH_Y }
}

/** The furthest from home the breath can ever carry anything. */
export const BREATH_MAX = Math.hypot(BREATH_X, BREATH_Y)
