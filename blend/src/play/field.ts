// Where everything sits, and how it will not sit still.
//
// The rules never mention a pixel. This is the other half: it takes a board —
// drops, skins, a core — and works out a place for all of it on whatever glass
// the player is holding, then keeps that place gently alive. Nothing here can
// change the game; it can only show it.
import { contact, disc, type Body } from '@/world/shape'
import type { Level, State } from '@/game/rules'

/** A drop's size comes from its mass by area, the way a real one would. */
export const dropR = (mass: number) => 20 * Math.sqrt(mass) + 10
/** The core swells as it drinks, but slowly — it has a whole sky to take in. */
export const coreR = (mass: number) => 40 + 6 * Math.sqrt(mass)

export interface Node {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  /** what it is now, which chases `want` rather than jumping to it */
  r: number
  want: number
  seed: number
  where: string | null
  /** ms since it was placed, for the swelling it arrives with */
  born: number
}

export interface Ring {
  id: string
  parent: string | null
  x: number
  y: number
  R: number
  pore: number
  seed: number
}

export interface Scene {
  rings: Ring[]
  core: { x: number; y: number; R: number }
  /** where each drop would rather be, when nothing is happening to it */
  homes: Record<string, { x: number; y: number }>
  /** how far everything had to be shrunk to fit this glass */
  scale: number
  top: number
  bottom: number
  w: number
}

const seedOf = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (Math.abs(h) % 10000) / 10000
}

/** Room left for the bar of numbers at the top and the line of words below. */
const TOP = 104
const BOT = 108

/** Where a lone skin goes, then two, then three, as a fraction of the field. */
const ANCHORS: Record<number, readonly [number, number][]> = {
  1: [[0.5, 0.2]],
  2: [
    [0.21, 0.24],
    [0.79, 0.24],
  ],
  3: [
    [0.19, 0.22],
    [0.81, 0.22],
    [0.5, 0.9],
  ],
  4: [
    [0.19, 0.2],
    [0.81, 0.2],
    [0.19, 0.86],
    [0.81, 0.86],
  ],
}

/** How big a skin has to be to hold what is in it, before anything is scaled. */
function ringSize(id: string, s: State, level: Level): number {
  const items = [
    ...s.drops.filter((d) => d.where === id).map((d) => dropR(d.mass)),
    ...s.membranes.filter((m) => m.parent === id).map((m) => ringSize(m.id, s, level) + 8),
  ]
  if (!items.length) return 60
  const big = [...items].sort((a, b) => b - a)
  if (big.length === 1) return big[0] + 14
  // two ways of being too small, and it has to beat both: not enough room in
  // total, and no room for the two largest things to sit side by side
  const area = 1.32 * Math.sqrt(items.reduce((n, r) => n + r * r, 0)) + 14
  return Math.max(area, big[0] + big[1] + 16)
}

/** Items laid round a small circle inside their skin — never a stack. */
function ringHomes(cx: number, cy: number, R: number, n: number, i: number): { x: number; y: number } {
  if (n <= 1) return { x: cx, y: cy }
  const a = (i / n) * Math.PI * 2 - Math.PI / 2
  const d = R * (n <= 3 ? 0.4 : 0.5)
  return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d }
}

/**
 * A place for everything, at whatever size this glass allows.
 *
 * Laid out at its natural size first and then shrunk to fit, rather than laid
 * out to fit: it means a level looks like itself on a phone and on a desk, one
 * smaller than the other, instead of two different arrangements of the same
 * puzzle.
 */
export function layout(s: State, level: Level, w: number, h: number): Scene {
  const top = TOP
  const bottom = Math.max(top + 200, h - BOT)
  const cx = w / 2
  const cy = (top + bottom) / 2
  const natural: Record<string, number> = {}
  for (const m of s.membranes) natural[m.id] = ringSize(m.id, s, level)
  const core = coreR(s.core)
  const roots = s.membranes.filter((m) => !m.parent)
  const anchors = ANCHORS[Math.min(4, Math.max(1, roots.length))]

  // Shrink until every skin is inside the field and clear of the core. Rings
  // sit at fixed fractions of the field, so scaling the sizes really does open
  // the gaps — it is the one knob that always works.
  let scale = 1
  for (let pass = 0; pass < 26; pass++) {
    let ok = true
    roots.forEach((m, i) => {
      const [ax, ay] = anchors[i % anchors.length]
      const x = ax * w
      const y = top + ay * (bottom - top)
      const R = natural[m.id] * scale
      if (x - R < 8 || x + R > w - 8 || y - R < top || y + R > bottom) ok = false
      if (Math.hypot(x - cx, y - cy) < R + core * scale + 26) ok = false
    })
    if (ok) break
    scale *= 0.94
  }

  const rings: Ring[] = []
  const place = (m: (typeof s.membranes)[number], x: number, y: number) => {
    const R = natural[m.id] * scale
    rings.push({ id: m.id, parent: m.parent, x, y, R, pore: m.pore, seed: seedOf(m.id) * 9.3 })
    const kids = s.membranes.filter((c) => c.parent === m.id)
    kids.forEach((c, i) => {
      const kR = natural[c.id] * scale
      const a = (i / Math.max(1, kids.length)) * Math.PI * 2 - Math.PI / 2
      const d = kids.length === 1 && s.drops.some((dr) => dr.where === m.id) ? R - kR - 12 : 0
      place(c, x + Math.cos(a) * d * 0.62, y + Math.sin(a) * d * 0.62)
    })
  }
  roots.forEach((m, i) => {
    const [ax, ay] = anchors[i % anchors.length]
    place(m, ax * w, top + ay * (bottom - top))
  })

  const homes: Record<string, { x: number; y: number }> = {}
  for (const ring of rings) {
    const mine = s.drops.filter((d) => d.where === ring.id)
    const kids = rings.filter((r) => r.parent === ring.id)
    mine.forEach((d, i) => {
      // a drop sharing its skin with a child ring keeps to the free side
      const spot = ringHomes(ring.x, ring.y, ring.R * (kids.length ? 0.78 : 1), mine.length, i)
      if (kids.length) {
        const k = kids[0]
        const away = Math.atan2(ring.y - k.y, ring.x - k.x)
        const d2 = ring.R - dropR(1) * scale - 10
        homes[d.id] = { x: ring.x + Math.cos(away) * d2 * 0.55, y: ring.y + Math.sin(away) * d2 * 0.55 }
      } else homes[d.id] = spot
    })
  }

  // Loose drops ride a ring around the core, on whichever of sixteen bearings
  // is furthest from every skin — so nothing spawns pressed against one.
  const loose = s.drops.filter((d) => d.where === null)
  const orbit = core * scale + 46 * scale + 52
  loose.forEach((d, i) => {
    let best = { x: cx, y: cy - orbit, far: -1 }
    for (let k = 0; k < 16; k++) {
      const a = (i / Math.max(1, loose.length)) * Math.PI * 2 + (k * Math.PI) / 8 - Math.PI / 2
      const x = Math.min(w - 40, Math.max(40, cx + Math.cos(a) * orbit))
      const y = Math.min(bottom - 40, Math.max(top + 40, cy + Math.sin(a) * orbit))
      const far = rings.length
        ? Math.min(...rings.map((r) => Math.hypot(x - r.x, y - r.y) - r.R))
        : 1e6
      if (far > best.far) best = { x, y, far }
    }
    homes[d.id] = { x: best.x, y: best.y }
  })

  return { rings, core: { x: cx, y: cy, R: core * scale }, homes, scale, top, bottom, w }
}

const bodyOf = (n: Node): Body => disc(n.x, n.y, n.r, n.seed)

export interface StepOpts {
  /** the drop under the finger, which obeys the finger and nothing else */
  dragging: string | null
  /** where that finger is */
  pointer: { x: number; y: number } | null
  /** slow everything to a held breath while a level is being read */
  calm: boolean
  reduced: boolean
}

/**
 * One frame of weather.
 *
 * Everything is a spring: to where it belongs, away from what it is touching,
 * back inside the skin it is behind. No drop is ever teleported — a rule that
 * costs a few lines here and buys the whole feeling that the sky is a place
 * with things in it rather than a diagram being redrawn.
 */
export function step(nodes: Node[], scene: Scene, t: number, dt: number, o: StepOpts) {
  const k = Math.min(2.4, dt / 16.7)
  for (const n of nodes) {
    n.born += dt
    n.r += (n.want - n.r) * Math.min(1, 0.12 * k)
    if (o.dragging === n.id && o.pointer) {
      n.vx = (o.pointer.x - n.x) * 0.38
      n.vy = (o.pointer.y - n.y) * 0.38
      n.x += n.vx * k
      n.y += n.vy * k
      continue
    }
    const home = scene.homes[n.id]
    if (home) {
      n.vx += (home.x - n.x) * 0.0075 * k
      n.vy += (home.y - n.y) * 0.0075 * k
    }
    if (!o.reduced) {
      // the breath: a few pixels of wandering, its own for each drop, so a
      // settled sky is still awake
      const s = n.seed * 6.283
      const slow = o.calm ? 0.35 : 1
      n.vx += Math.cos(t * 0.0004 + s) * 0.017 * slow * k
      n.vy += Math.sin(t * 0.00051 + s * 1.7) * 0.017 * slow * k
    }
    n.vx *= 0.93
    n.vy *= 0.93
    n.x += n.vx * k
    n.y += n.vy * k
  }

  // nothing overlaps anything, except what a finger is deliberately pushing
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      if (o.dragging === a.id || o.dragging === b.id) continue
      const c = contact(bodyOf(a), bodyOf(b), 5)
      if (!c) continue
      const push = c.depth * 0.5
      a.x -= c.nx * push
      a.y -= c.ny * push
      b.x += c.nx * push
      b.y += c.ny * push
    }
  }

  for (const n of nodes) {
    if (o.dragging === n.id) continue
    const ring = n.where ? scene.rings.find((r) => r.id === n.where) : null
    if (ring) {
      // held: kept inside its own skin
      const d = Math.hypot(n.x - ring.x, n.y - ring.y)
      const max = ring.R - n.r - 7
      if (d > max && d > 0.001) {
        const f = max / d
        n.x = ring.x + (n.x - ring.x) * f
        n.y = ring.y + (n.y - ring.y) * f
        n.vx *= 0.4
        n.vy *= 0.4
      }
      // …and out of any skin nested inside it
      for (const kid of scene.rings.filter((r) => r.parent === ring.id)) keepOut(n, kid.x, kid.y, kid.R)
    } else {
      // free: inside the field, out of every skin, off the core
      n.x = Math.min(scene.w - n.r - 6, Math.max(n.r + 6, n.x))
      n.y = Math.min(scene.bottom - n.r - 2, Math.max(scene.top + n.r + 2, n.y))
      for (const r of scene.rings) if (!r.parent) keepOut(n, r.x, r.y, r.R)
      keepOut(n, scene.core.x, scene.core.y, scene.core.R + 2)
    }
  }
}

function keepOut(n: Node, cx: number, cy: number, R: number) {
  const dx = n.x - cx
  const dy = n.y - cy
  const d = Math.hypot(dx, dy)
  const min = R + n.r + 4
  if (d >= min) return
  if (d < 0.001) {
    n.x = cx + min
    return
  }
  n.x = cx + (dx / d) * min
  n.y = cy + (dy / d) * min
  n.vx *= 0.5
  n.vy *= 0.5
}
