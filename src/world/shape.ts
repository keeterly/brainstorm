// Not everything in the sky is a disc.
//
// A thought you have opened to read is a card — wide, short, with its own
// corners. Once one body in a crowd is a different shape from the rest, every
// question the crowd asks about itself has to be asked in terms of that shape:
// how far apart are we really, which way do I move to get out of your way,
// where exactly do our surfaces meet. Answering those with bounding circles is
// what makes a layout look computed — things stop at a polite distance from a
// circle that is not there, and the gaps read as wrong without being nameable.
//
// So every body is described the same way: a rounded rectangle. A disc is the
// case where the corners have eaten the whole thing. One distance function then
// answers all of it exactly, for every pair, because the Minkowski sum of two
// rounded rectangles is another rounded rectangle.

/** A body in the sky. A disc is `hw === hh === r`. */
export interface Body {
  x: number
  y: number
  /** half width */
  hw: number
  /** half height */
  hh: number
  /** corner radius */
  r: number
}

export const disc = (x: number, y: number, r: number): Body => ({ x, y, hw: r, hh: r, r })

export const card = (x: number, y: number, hw: number, hh: number, r: number): Body => ({
  x,
  y,
  hw,
  hh,
  r: Math.max(0, Math.min(r, Math.min(hw, hh))),
})

/**
 * Signed distance from a point to the body's surface: negative inside,
 * positive outside, and in both cases the true distance in pixels.
 */
export function sd(b: Body, px: number, py: number): number {
  // measured against the core box — the rectangle left when the corner radius
  // is peeled off every side — which is what makes the corners round
  const qx = Math.abs(px - b.x) - (b.hw - b.r)
  const qy = Math.abs(py - b.y) - (b.hh - b.r)
  const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return out + Math.min(Math.max(qx, qy), 0) - b.r
}

/** The outward direction at a point — the way out, along the shortest path. */
export function normal(b: Body, px: number, py: number): [number, number] {
  const e = 0.4
  const nx = sd(b, px + e, py) - sd(b, px - e, py)
  const ny = sd(b, px, py + e) - sd(b, px, py - e)
  const m = Math.hypot(nx, ny)
  if (m > 1e-6) return [nx / m, ny / m]
  // dead centre of a body: the gradient vanishes, so fall back to radial
  const dx = px - b.x
  const dy = py - b.y
  const d = Math.hypot(dx, dy)
  return d > 1e-6 ? [dx / d, dy / d] : [1, 0]
}

/**
 * Where two bodies touch, if they are within `gap` of each other.
 *
 * Exact for any pair, because the set of positions at which B overlaps A is
 * itself a rounded rectangle — A grown by B's extents. So the same distance
 * function that measures a point against a body measures a body against a
 * body, with no bounding circles and no special cases.
 *
 * `depth` is how far they have to move apart to sit `gap` from each other;
 * `nx, ny` points from A toward B.
 */
export function contact(a: Body, b: Body, gap = 0): { depth: number; nx: number; ny: number } | null {
  const sum: Body = { x: a.x, y: a.y, hw: a.hw + b.hw, hh: a.hh + b.hh, r: a.r + b.r }
  const d = sd(sum, b.x, b.y)
  if (d >= gap) return null
  const [nx, ny] = normal(sum, b.x, b.y)
  return { depth: gap - d, nx, ny }
}

/** How much clear air is between two surfaces. Negative once they overlap. */
export const clearance = (a: Body, b: Body): number =>
  sd({ x: a.x, y: a.y, hw: a.hw + b.hw, hh: a.hh + b.hh, r: a.r + b.r }, b.x, b.y)

/**
 * The point on a body's surface in a given direction from its centre.
 *
 * Found by bisection rather than by formula: the boundary of a rounded
 * rectangle is three different curves depending on where you hit it, and a
 * body is convex and contains its own centre, so the distance function along
 * any ray out of it crosses zero exactly once. Twenty-two halvings put that
 * crossing well inside a thousandth of a pixel.
 */
export function rim(b: Body, angle: number): [number, number] {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  let lo = 0
  let hi = Math.hypot(b.hw, b.hh) + 1
  for (let i = 0; i < 22; i++) {
    const s = (lo + hi) / 2
    if (sd(b, b.x + ux * s, b.y + uy * s) < 0) lo = s
    else hi = s
  }
  const s = (lo + hi) / 2
  return [b.x + ux * s, b.y + uy * s]
}

/**
 * How strongly two bodies are pulling on each other, 0 → 1.
 *
 * Reach is very nearly a constant. Surface tension draws a bridge about as far
 * as it can draw one, whatever the size of the bodies either end — scaling it
 * with the drop meant big drops threw long faint necks across empty sky at each
 * other while small ones in a crowd barely joined at all.
 */
export const REACH = (a: Body, b: Body) => 18 + Math.min(Math.min(a.hw, a.hh), Math.min(b.hw, b.hh)) * 0.16

export function pull(a: Body, b: Body): number {
  const gap = clearance(a, b)
  const reach = REACH(a, b)
  if (gap > reach) return 0
  return Math.max(0, Math.min(1, 1 - gap / reach))
}

/**
 * The waist two bodies draw between them as they come into reach.
 *
 * Oil does not join by overlapping. Surface tension pulls a neck out of each
 * body toward the other and the two necks meet in a pinched waist, which
 * thickens and finally disappears into a single mass as they close. The ends
 * of that neck sit on each body's *real* surface and leave it along the *real*
 * tangent there — so against a card it grows off the flat of the edge, and
 * against a drop it grows off the curve, and neither looks stuck on.
 *
 * Comes back as two paths, because a drop is glass and not a silhouette. The
 * `fill` is closed with a straight chord through each body — hidden inside
 * them, so it never shows — and the `rim` is only the two outer curves, which
 * are the part of the join that is genuinely a new edge. Filling and stroking
 * one closed path would draw the chords too, straight across the face of a
 * translucent drop.
 */
export function oilPath(a: Body, b: Body, amount = pull(a, b)): { fill: string; rim: string } | null {
  if (amount <= 0.002) return null
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  if (!Number.isFinite(ang)) return null
  // how far round each body the neck attaches. It starts as a narrow thread
  // and opens out as they close, which is what makes the join look like it is
  // being drawn out of them rather than laid between them.
  const t = (Math.PI / 2.7) * (0.24 + amount * 0.76)

  const p1 = rim(a, ang + t)
  const p2 = rim(a, ang - t)
  const p3 = rim(b, ang + Math.PI - t)
  const p4 = rim(b, ang + Math.PI + t)

  // leave each surface along its own tangent, heading for the other body
  const tangent = (body: Body, p: [number, number], toward: Body): [number, number] => {
    const [nx, ny] = normal(body, p[0], p[1])
    const tx = -ny
    const ty = nx
    const ahead = (toward.x - p[0]) * tx + (toward.y - p[1]) * ty
    return ahead >= 0 ? [tx, ty] : [-tx, -ty]
  }
  const span = Math.hypot(p3[0] - p1[0], p3[1] - p1[1])
  const span2 = Math.hypot(p4[0] - p2[0], p4[1] - p2[1])
  // longer handles pinch the waist harder; as they close there is less room
  // for a waist and the neck straightens out into plain mass
  const len = 0.42 * (1 - amount * 0.45)
  const [t1x, t1y] = tangent(a, p1, b)
  const [t3x, t3y] = tangent(b, p3, a)
  const [t4x, t4y] = tangent(b, p4, a)
  const [t2x, t2y] = tangent(a, p2, b)
  const h1 = [p1[0] + t1x * span * len, p1[1] + t1y * span * len]
  const h3 = [p3[0] + t3x * span * len, p3[1] + t3y * span * len]
  const h4 = [p4[0] + t4x * span2 * len, p4[1] + t4y * span2 * len]
  const h2 = [p2[0] + t2x * span2 * len, p2[1] + t2y * span2 * len]

  const n = (v: number) => v.toFixed(1)
  const side1 =
    `M ${n(p1[0])} ${n(p1[1])}` +
    ` C ${n(h1[0])} ${n(h1[1])}, ${n(h3[0])} ${n(h3[1])}, ${n(p3[0])} ${n(p3[1])}`
  const side2 =
    `M ${n(p4[0])} ${n(p4[1])}` +
    ` C ${n(h4[0])} ${n(h4[1])}, ${n(h2[0])} ${n(h2[1])}, ${n(p2[0])} ${n(p2[1])}`
  const fill = `${side1} L ${n(p4[0])} ${n(p4[1])}` + side2.slice(side2.indexOf(' C')) + ' Z'
  return /NaN|Infinity/.test(fill) ? null : { fill, rim: `${side1} ${side2}` }
}
