// The Sky — the app's home. The interface IS the water world from the
// prototype: glass drops backed by real thoughts, pools backed by goals,
// threads backed by relationships, the ocean backed by done, the high
// clouds backed by snooze. No cards, no forms — hold the sky and write.
import { useEffect, useRef } from 'react'
import { useGraph } from '@/store/graph'
import { parseCapture } from '@/domain/parse-blocks'
import { runAction } from '@/ai/client'
import type { ClassifyOutput } from '@shared/ai/actions/classify-thought'
import { nameThePool, organizeText, tidySky } from './absorbFlow'
import { seaLineAt, waterlineY } from '@/world/water'
import { armUpright, stepUpright, worldTilt } from '@/world/upright'
import { haptics } from '@/lib/haptics'
import { echoRing } from '@/world/echo'
import type { Thought } from '@/domain/types'
import './sky.css'

export default function SkyPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => mountSky(rootRef.current as HTMLDivElement), [])
  return (
    <div ref={rootRef} className="sky-root">
      <div className="sky-stage" data-sky="stage">
        <svg className="sky-links" aria-hidden="true">
          <g data-sky="links">
            <g className="sky-echo" data-sky="echo" />
            <path className="sky-goo" data-sky="goo" />
          </g>
        </svg>
        <div data-sky="field" />
      </div>
      <header className="sky-head">
        <div className="hint" data-sky="hint" />
      </header>
      <div className="sky-tide" data-sky="tide" aria-hidden="true" />
      <div className="sky-sea-word" data-sky="seaword" aria-hidden="true" />
      <div className="sky-meter" data-sky="meter" aria-hidden="true" />
      <button className="sky-rest" data-sky="rest" aria-label="Resting thoughts">
        ☁
      </button>
      <button className="sky-tidy" data-sky="tidy" aria-label="Gather loose thoughts into pools">
        ✦ tidy
      </button>
      <div className="sky-undo" data-sky="undo">
        <span className="lb" data-sky="undoLb" />
        <b data-sky="undoGo">bring it back</b>
      </div>
      <div className="sky-page" data-sky="page" role="dialog" aria-label="Write">
        <div className="top">
          <div className="pq" data-sky="pageQ" />
          <button className="x" data-sky="pageX" aria-label="Close">
            ×
          </button>
        </div>
        <textarea data-sky="pageT" />
        <div className="pans" data-sky="pageA" style={{ display: 'none' }} />
        <div className="bot">
          <div className="tools">
            <button className="tool" data-sky="pageMic" aria-label="Speak">
              <Ico d="M12 3.4a2.6 2.6 0 0 0-2.6 2.6v5a2.6 2.6 0 0 0 5.2 0V6A2.6 2.6 0 0 0 12 3.4ZM6.2 10.6a5.8 5.8 0 0 0 11.6 0M12 16.4v4.2" />
            </button>
            <button className="tool" data-sky="pagePic" aria-label="Add a photo">
              <Ico d="M3.6 6.8a2 2 0 0 1 2-2h12.8a2 2 0 0 1 2 2v10.4a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2V6.8ZM3.9 16l4.6-4.3a1.7 1.7 0 0 1 2.3 0l4 3.7M14 13.4l1.6-1.5a1.7 1.7 0 0 1 2.3 0l2.2 2M9 9.4a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z" />
            </button>
            <button
              className="tool"
              data-sky="pageAbsorb"
              aria-label="Organize this"
              title="Read it through, gather the themes, draw the threads"
            >
              <Ico d="M12 3.2c.7 4.2 1.9 5.4 6.1 6.1-4.2.7-5.4 1.9-6.1 6.1-.7-4.2-1.9-5.4-6.1-6.1 4.2-.7 5.4-1.9 6.1-6.1ZM17.6 15.2c.35 2 .95 2.6 2.95 2.95-2 .35-2.6.95-2.95 2.95-.35-2-.95-2.6-2.95-2.95 2-.35 2.6-.95 2.95-2.95Z" />
            </button>
            <button className="tool" data-sky="pageLater" aria-label="Let it rest">
              <Ico d="M7.2 18.4a4.2 4.2 0 0 1-.5-8.37 5.6 5.6 0 0 1 10.75-1.2 3.8 3.8 0 0 1 .35 7.55 4 4 0 0 1-.6.04H7.2Z" />
            </button>
            <span className="note" data-sky="pageN" />
          </div>
          <button className="done" data-sky="pageD">
            Done
          </button>
        </div>
      </div>
      <input type="file" data-sky="pageFile" accept="image/*" style={{ display: 'none' }} />
    </div>
  )
}

// one drawn family for every tool, so nothing is a stray emoji
function Ico({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden focusable="false">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// the engine — imperative, like the prototype, so nothing re-renders per frame
// ---------------------------------------------------------------------------

interface Step {
  ph: string
  pt: string
  detail: string
}
interface TL {
  kind: 'drop' | 'pool'
  t: Thought
  members: Thought[]
}
interface Pos {
  x: number
  y: number
  rx: number
  ry: number
  s: number
  vx: number
  vy: number
  // how far this drop is leaning toward another — mk eases toward mt, and
  // mx/my is the unit direction of the pull
  mk: number
  mt: number
  mx: number
  my: number
}

const QUESTIONS = [
  'What makes this one matter?',
  'What is the smallest true version?',
  'Who is it really for?',
]
const STOP = new Set(['what', 'when', 'where', 'which', 'would', 'could', 'should', 'about', 'with', 'this', 'that', 'than', 'then', 'like', 'look', 'from', 'have', 'over', 'into', 'your', 'their', 'there', 'they', 'want', 'need', 'make', 'build', 'helps', 'really', 'thing', 'something', 'anything'])
const STRONG = 2

// the same drawn family as the page tools — no stray emoji in the sky
const MOON_ICONS: Record<string, string> = {
  grow: 'M12 3.4c.72 4.3 1.94 5.52 6.24 6.24-4.3.72-5.52 1.94-6.24 6.24-.72-4.3-1.94-5.52-6.24-6.24 4.3-.72 5.52-1.94 6.24-6.24ZM17.7 15.6c.32 1.9.88 2.46 2.78 2.78-1.9.32-2.46.88-2.78 2.78-.32-1.9-.88-2.46-2.78-2.78 1.9-.32 2.46-.88 2.78-2.78Z',
  gather: 'M3.2 12h5.4M20.8 12h-5.4M6.2 9.2 8.9 12l-2.7 2.8M17.8 9.2 15.1 12l2.7 2.8',
  rain: 'M7.6 13.6a3.7 3.7 0 0 1-.44-7.37 4.95 4.95 0 0 1 9.5-1.06 3.36 3.36 0 0 1 .3 6.67 3.6 3.6 0 0 1-.53.03H7.6M8.4 16.4l-1 3M13 16.4l-1 3M17.6 16.4l-1 3',
}
function moonSvg(key: string) {
  return (
    `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">` +
    `<path d="${MOON_ICONS[key] ?? MOON_ICONS.grow}" stroke="currentColor" stroke-width="1.5" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}

// Wabi-sabi: a real droplet is never a true circle. Each drop gets its own
// quiet asymmetry, derived from its id so it is the same one every time.
function blobOf(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const v = (n: number) => {
    const x = Math.sin(h * 0.0001 + n * 12.9898) * 43758.5453
    return (46.6 + (x - Math.floor(x)) * 6.8).toFixed(1)
  }
  return `${v(1)}% ${v(2)}% ${v(3)}% ${v(4)}% / ${v(5)}% ${v(6)}% ${v(7)}% ${v(8)}%`
}

// How much of a drop's stretch toward its partner is paid for by narrowing
// across it. Water has a volume; a body that reaches has to thin somewhere.
export const MORPH_PERP = 0.55
export { echoRing }

// The neck two droplets form as they reach for each other. Circles do not
// merge by overlapping — surface tension draws a waisted bridge between them
// that thickens as they close. Drawn as a path rather than an SVG blur filter,
// because that filter renders as flat grey rectangles on iOS.
//
// k1/k2 are how far each body has deformed toward the other: 0 leaves it a
// circle, 0.16 stretches it 16% along the line between them and narrows it
// across. The drop elements are transformed by exactly the same amounts, so
// the silhouette this path traces is the silhouette you see.
export function metaballPath(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
  k1 = 0,
  k2 = 0,
): string | null {
  const dx = x2 - x1
  const dy = y2 - y1
  const d = Math.hypot(dx, dy)
  // semi-axes: a along the line between them, b across it
  const a1r = r1 * (1 + k1)
  const b1r = r1 * (1 - k1 * MORPH_PERP)
  const a2r = r2 * (1 + k2)
  const b2r = r2 * (1 - k2 * MORPH_PERP)
  const maxReach = (a1r + a2r) * 1.62
  if (d <= 0 || d > maxReach) return null
  const angle = Math.atan2(dy, dx)
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const deg = ((angle * 180) / Math.PI).toFixed(1)
  // a point on a body, at parameter t measured from the line between them
  const rim = (cx: number, cy: number, a: number, b: number, t: number) => {
    const lx = a * Math.cos(t)
    const ly = b * Math.sin(t)
    return [cx + lx * ca - ly * sa, cy + lx * sa + ly * ca]
  }

  if (d <= Math.abs(a1r - a2r)) {
    // fully inside one another: there is no neck left, only one surface
    const [cx, cy, a, b] = a1r >= a2r ? [x1, y1, a1r, b1r] : [x2, y2, a2r, b2r]
    const [sx, sy] = rim(cx, cy, a, b, Math.PI)
    const [ex, ey] = rim(cx, cy, a, b, 0)
    return (
      `M ${sx.toFixed(1)} ${sy.toFixed(1)}` +
      ` A ${a.toFixed(1)} ${b.toFixed(1)} ${deg} 1 0 ${ex.toFixed(1)} ${ey.toFixed(1)}` +
      ` A ${a.toFixed(1)} ${b.toFixed(1)} ${deg} 1 0 ${sx.toFixed(1)} ${sy.toFixed(1)} Z`
    )
  }

  // how far into the reach we are, 0 (just touching range) → 1 (overlapping)
  const v = Math.max(0, Math.min(1, 1 - (d - (a1r + a2r) * 0.42) / (maxReach - (a1r + a2r) * 0.42)))
  const spread = Math.PI / 2.6

  let u1 = 0
  let u2 = 0
  if (d < a1r + a2r) {
    u1 = Math.acos(Math.max(-1, Math.min(1, (a1r * a1r + d * d - a2r * a2r) / (2 * a1r * d))))
    u2 = Math.acos(Math.max(-1, Math.min(1, (a2r * a2r + d * d - a1r * a1r) / (2 * a2r * d))))
  }
  // the neck attaches no further round than where the two surfaces already
  // cross — past that it would be cutting into the body it is joining
  const t1 = u1 + Math.max(0, spread - u1) * v
  const t2 = -t1
  const t3 = Math.PI - u2 - Math.max(0, Math.PI - u2 - spread) * v
  const t4 = -t3

  const [p1x, p1y] = rim(x1, y1, a1r, b1r, t1)
  const [p2x, p2y] = rim(x1, y1, a1r, b1r, t2)
  const [p3x, p3y] = rim(x2, y2, a2r, b2r, t3)
  const [p4x, p4y] = rim(x2, y2, a2r, b2r, t4)

  // the waist: control handles run along each rim toward it, shortening as
  // the two close. `sign` picks which way around the body the handle leaves.
  const handle = (px: number, py: number, a: number, b: number, t: number, len: number, sign: number) => {
    const lx = -a * Math.sin(t) * sign
    const ly = b * Math.cos(t) * sign
    const m = Math.hypot(lx, ly) || 1
    const ux = (lx / m) * len
    const uy = (ly / m) * len
    return [px + ux * ca - uy * sa, py + ux * sa + uy * ca]
  }
  const totalRadius = a1r + a2r
  // once the two are genuinely inside one another the union is already the
  // shape; the neck stands down rather than bulging out past it
  const over = Math.max(0, (totalRadius - d) / totalRadius)
  const d2 =
    Math.min(v * 0.7, Math.hypot(p1x - p3x, p1y - p3y) / totalRadius) *
    Math.min(1, (d * 2) / totalRadius) *
    Math.max(0, 1 - over * 1.7)
  const h1 = a1r * d2 * 2.4
  const h2 = a2r * d2 * 2.4
  const c1 = handle(p1x, p1y, a1r, b1r, t1, h1, -1)
  const c2 = handle(p3x, p3y, a2r, b2r, t3, h2, 1)
  const c3 = handle(p4x, p4y, a2r, b2r, t4, h2, -1)
  const c4 = handle(p2x, p2y, a1r, b1r, t2, h1, 1)

  return (
    `M ${p1x.toFixed(1)} ${p1y.toFixed(1)}` +
    ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p3x.toFixed(1)} ${p3y.toFixed(1)}` +
    ` A ${a2r.toFixed(1)} ${b2r.toFixed(1)} ${deg} 0 1 ${p4x.toFixed(1)} ${p4y.toFixed(1)}` +
    ` C ${c3[0].toFixed(1)} ${c3[1].toFixed(1)}, ${c4[0].toFixed(1)} ${c4[1].toFixed(1)}, ${p2x.toFixed(1)} ${p2y.toFixed(1)}` +
    ` A ${a1r.toFixed(1)} ${b1r.toFixed(1)} ${deg} 0 1 ${p1x.toFixed(1)} ${p1y.toFixed(1)} Z`
  )
}

function mountSky(root: HTMLDivElement) {
  const $ = <T extends HTMLElement>(k: string) => root.querySelector(`[data-sky="${k}"]`) as T
  const stage = $('stage')
  const field = $('field')
  const links = root.querySelector('[data-sky="links"]') as unknown as SVGGElement
  const hint = $('hint')
  const meter = $('meter')
  const tide = $('tide')
  const goo = root.querySelector('[data-sky="goo"]') as unknown as SVGPathElement
  const echoG = root.querySelector('[data-sky="echo"]') as unknown as SVGGElement
  const seaWord = $('seaword')
  const restEl = $('rest')
  const tidyEl = $('tidy')
  const undoEl = $('undo')
  const undoLb = $('undoLb')
  const undoGo = $('undoGo')
  const page = $('page')
  const pageQ = $('pageQ')
  const pageT = $<HTMLTextAreaElement>('pageT')
  const pageA = $('pageA')
  const pageN = $('pageN')
  const pageD = $('pageD')
  const pageX = $('pageX')
  const pageMic = $('pageMic')
  const pagePic = $('pagePic')
  const pageAbsorb = $('pageAbsorb')
  const pageLater = $('pageLater')
  const pageFile = root.querySelector('[data-sky="pageFile"]') as HTMLInputElement

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  document.body.classList.add('sky-held')
  // how close a dragged drop is to the sea, 0 → 1, and whether it would go
  let seaNear = 0
  function showTide(near: number, ready: boolean) {
    if (near === seaNear) return
    seaNear = near
    const line = waterlineY()
    tide.style.top = line - 120 + 'px'
    tide.style.height = 260 + 'px'
    tide.style.background =
      `linear-gradient(rgba(var(--accent-rgb), 0) 0%, rgba(var(--accent-rgb), ${(0.05 * near).toFixed(3)}) 44%,` +
      ` rgba(150,215,255,${(0.16 * near).toFixed(3)}) 47%, rgba(90,170,230,${(0.1 * near).toFixed(3)}) 60%, transparent 100%)`
    tide.classList.toggle('on', near > 0.02)
    seaWord.style.top = line - 52 + 'px'
    seaWord.textContent = ready ? 'let go' : 'the ocean keeps what’s done'
    seaWord.classList.toggle('on', near > 0.25)
    seaWord.classList.toggle('ready', ready)
  }
  function hideTide() {
    if (seaNear === 0 && !tide.classList.contains('on')) return
    seaNear = 0
    tide.classList.remove('on')
    seaWord.classList.remove('on', 'ready')
  }
  const S = () => useGraph.getState()
  const todayISO = () => new Date().toISOString().slice(0, 10)
  const ex = (t: Thought) => (t.extra ?? {}) as Record<string, unknown>
  const label = (t: Thought) => t.title || t.raw_content
  const answersOf = (t: Thought) => (ex(t).answers as string[] | undefined) ?? []
  const isKept = (t: Thought) => ex(t).kept === true
  const isRipe = (t: Thought) => !isKept(t) && answersOf(t).length >= 1
  const imgOf = (t: Thought) => ex(t).img as string | undefined
  const patchExtra = (t: Thought, patch: Record<string, unknown>) =>
    S().updateThought(t.id, { extra: { ...ex(t), ...patch } })

  let W = innerWidth
  let H = stage.clientHeight || innerHeight
  // The world is bigger than the glass you look through it with. Everything
  // below works in world coordinates; the camera maps them to the screen.
  const cam = { x: 0, y: 0, k: 1 }
  const MIN_K = 0.35
  const MAX_K = 1.8
  const worldW = () => W * 1.9
  const worldH = () => (waterlineY() - 74) * 1.7
  const toWorldX = (sx: number) => (sx - cam.x) / cam.k
  const toWorldY = (sy: number) => (sy - cam.y) / cam.k
  function applyCam() {
    const t = `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`
    field.style.transform = t
    field.style.transformOrigin = '0 0'
    links.setAttribute('transform', `translate(${cam.x} ${cam.y}) scale(${cam.k})`)
  }
  function zoomAt(sx: number, sy: number, k: number) {
    const next = Math.max(MIN_K, Math.min(MAX_K, k))
    const wx = toWorldX(sx)
    const wy = toWorldY(sy)
    cam.k = next
    cam.x = sx - wx * next
    cam.y = sy - wy * next
    applyCam()
  }
  /** The world's occupied box, or null when there is nothing in it. */
  function contentBox() {
    const tls = view.tls
    if (!tls.length) return null
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const tl of tls) {
      const p = posOf(tl.t.id)
      const r = radiusOf(tl) + 12
      x0 = Math.min(x0, p.x - r)
      y0 = Math.min(y0, p.y - r)
      x1 = Math.max(x1, p.x + r)
      y1 = Math.max(y1, p.y + r)
    }
    return { x0, y0, x1, y1 }
  }
  /** Is there anywhere to pan to? If the sky already fits, dragging the water
   *  should do nothing — otherwise every near-miss on a drop slides the world. */
  function canPan() {
    const b = contentBox()
    if (!b) return false
    return (b.x1 - b.x0) * cam.k > W + 12 || (b.y1 - b.y0) * cam.k > waterlineY() - 94
  }
  /** Frame everything, with a little air. */
  function fitAll(animate = true) {
    const b = contentBox()
    if (!b) return
    const { x0, y0, x1, y1 } = b
    const top = 76
    const bottom = waterlineY() - 18
    // framing, never magnifying: a nearly empty sky used to zoom in past 1:1
    // and push what little was in it off the edges
    const k = Math.max(MIN_K, Math.min(1, Math.min(W / Math.max(1, x1 - x0), (bottom - top) / Math.max(1, y1 - y0))))
    const target = {
      k,
      x: (W - (x1 - x0) * k) / 2 - x0 * k,
      y: top + (bottom - top - (y1 - y0) * k) / 2 - y0 * k,
    }
    if (!animate || reduced) {
      cam.k = target.k
      cam.x = target.x
      cam.y = target.y
      applyCam()
      return
    }
    camTarget = target
  }
  /** Frame one opened pool and the whole ring it lays out, and nothing else. */
  function frameOpen(g: TL) {
    const p = posOf(g.t.id)
    const reach = orbitR(g) + memberR(g.members.length) + 22
    // keep the ring inside the world so no part of it can be clamped away
    p.x = Math.max(Math.min(reach, worldW() / 2), Math.min(worldW() - reach, p.x))
    p.y = Math.max(Math.min(reach, worldH() / 2), Math.min(worldH() - reach, p.y))
    const top = 76
    // the pool's own actions wait below it; leave them room
    const bottom = waterlineY() - 118
    const k = Math.max(MIN_K, Math.min(MAX_K, Math.min(W / (reach * 2), (bottom - top) / (reach * 2))))
    const target = { k, x: W / 2 - p.x * k, y: (top + bottom) / 2 - p.y * k }
    if (reduced) {
      cam.k = target.k
      cam.x = target.x
      cam.y = target.y
      applyCam()
      return
    }
    camTarget = target
  }
  let camTarget: { x: number; y: number; k: number } | null = null
  const onResize = () => {
    W = innerWidth
    H = stage.clientHeight || innerHeight
  }
  addEventListener('resize', onResize)

  // ---------- world view over the store ----------
  let ver = 0
  let view: { tls: TL[]; byId: Map<string, TL>; threads: { a: string; b: string; id: string }[] } = {
    tls: [],
    byId: new Map(),
    threads: [],
  }
  function rebuild() {
    const s = S()
    const open = s.thoughts.filter((t) => t.status === 'open')
    const goals = open.filter((t) => t.type === 'goal')
    const goalIds = new Set(goals.map((g) => g.id))
    const memberOf = new Map<string, string>()
    for (const r of s.relationships) {
      if (r.type === 'part_of' && goalIds.has(r.to_id)) memberOf.set(r.from_id, r.to_id)
    }
    const membersByGoal = new Map<string, Thought[]>()
    for (const t of open) {
      const g = memberOf.get(t.id)
      if (g && t.type !== 'goal') {
        if (!membersByGoal.has(g)) membersByGoal.set(g, [])
        ;(membersByGoal.get(g) as Thought[]).push(t)
      }
    }
    const tls: TL[] = [
      ...open
        .filter((t) => t.type !== 'goal' && !memberOf.has(t.id))
        .map((t) => ({ kind: 'drop' as const, t, members: [] })),
      ...goals.map((g) => ({ kind: 'pool' as const, t: g, members: membersByGoal.get(g.id) ?? [] })),
    ]
    const byId = new Map(tls.map((tl) => [tl.t.id, tl]))
    const topIds = new Set(byId.keys())
    const threads = s.relationships
      .filter((r) => r.type === 'relates_to' && topIds.has(r.from_id) && topIds.has(r.to_id))
      .map((r) => ({ a: r.from_id, b: r.to_id, id: r.id }))
    // a pool that has lost its members is just a label in the way
    for (const g of goals) {
      const n = (membersByGoal.get(g.id) ?? []).length
      const born = Date.now() - new Date(g.created_at).getTime()
      if (n < 2 && born > 8000) {
        for (const m of membersByGoal.get(g.id) ?? []) {
          const rel = s.relationships.find((r) => r.type === 'part_of' && r.from_id === m.id && r.to_id === g.id)
          if (rel) s.deleteRelationship(rel.id)
        }
        s.deleteThought(g.id)
      }
    }
    view = { tls, byId, threads }
    ver++
  }

  // ---------- positions (persisted to the layouts table) ----------
  const pos = new Map<string, Pos>()
  const savedLayout: Record<string, { x: number; y: number }> = S().layouts['sky'] ?? {}
  function posOf(id: string): Pos {
    let p = pos.get(id)
    if (!p) {
      const saved = savedLayout[id]
      const x = saved ? saved.x * W : W * (0.2 + Math.random() * 0.6)
      const y = saved ? saved.y * H : H * (0.2 + Math.random() * 0.5)
      // a drop that has never been placed rises into the sky and settles;
      // one returning from a saved layout is simply already there
      const born = !saved && !reduced
      p = {
        x,
        y,
        rx: x,
        ry: born ? Math.min(y + 96, waterlineY() + 10) : y,
        s: born ? 0.42 : 1,
        vx: 0,
        vy: 0,
        mk: 0,
        mt: 0,
        mx: 1,
        my: 0,
      }
      pos.set(id, p)
    }
    return p
  }
  let layoutT: ReturnType<typeof setTimeout> | null = null
  function persistLayout() {
    if (layoutT) clearTimeout(layoutT)
    layoutT = setTimeout(() => {
      const out: Record<string, { x: number; y: number }> = {}
      for (const tl of view.tls) {
        const p = pos.get(tl.t.id)
        if (p) out[tl.t.id] = { x: p.x / W, y: p.y / H }
      }
      S().saveLayout('sky', out)
    }, 1200)
  }

  // ---------- language ----------
  function words(text: string) {
    return new Set(
      String(text || '')
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    )
  }
  function trim(s: string, n: number) {
    s = String(s).replace(/\s+/g, ' ').trim()
    return s.length > n ? s.slice(0, n - 1) + '…' : s
  }
  const wordCache = new Map<string, Set<string>>()
  let wordV = -1
  function tlWords(tl: TL): Set<string> {
    if (wordV !== ver) {
      wordCache.clear()
      wordV = ver
    }
    const hit = wordCache.get(tl.t.id)
    if (hit) return hit
    let w: Set<string>
    if (tl.kind === 'drop') w = words(label(tl.t) + ' ' + answersOf(tl.t).join(' '))
    else {
      w = words(label(tl.t))
      for (const m of tl.members) for (const x of words(label(m))) w.add(x)
    }
    wordCache.set(tl.t.id, w)
    return w
  }
  function kinOf(tl: TL) {
    const mine = tlWords(tl)
    const out: { tl: TL; shared: number }[] = []
    for (const other of view.tls) {
      if (other.t.id === tl.t.id) continue
      let shared = 0
      for (const w of tlWords(other)) if (mine.has(w)) shared++
      if (shared > 0) out.push({ tl: other, shared })
    }
    return out.sort((a, b) => b.shared - a.shared)
  }
  let kinCache: { v: number; pairs: { a: TL; b: TL; shared: number }[] } = { v: -1, pairs: [] }
  function allKinPairs() {
    if (kinCache.v === ver) return kinCache.pairs
    const pairs: { a: TL; b: TL; shared: number }[] = []
    for (let i = 0; i < view.tls.length; i++) {
      const wi = tlWords(view.tls[i])
      for (let j = i + 1; j < view.tls.length; j++) {
        let shared = 0
        for (const w of tlWords(view.tls[j])) if (wi.has(w)) shared++
        if (shared > 0) pairs.push({ a: view.tls[i], b: view.tls[j], shared })
      }
    }
    kinCache = { v: ver, pairs: pairs.sort((a, b) => b.shared - a.shared).slice(0, 12) }
    return kinCache.pairs
  }
  function hasThread(a: string, b: string) {
    return view.threads.some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a))
  }
  function sharedConcept(texts: string[]): string | null {
    const counts = new Map<string, number>()
    for (const t of texts) for (const w of words(t)) counts.set(w, (counts.get(w) ?? 0) + 1)
    let best: string | null = null
    for (const [w, n] of counts) if (n >= 2 && (!best || n > (counts.get(best) ?? 0))) best = w
    return best ? best[0].toUpperCase() + best.slice(1) : null
  }
  function conceptName(texts: string[]) {
    const counts = new Map<string, number>()
    for (const t of texts) for (const w of words(t)) counts.set(w, (counts.get(w) ?? 0) + 1)
    let best: string | null = null
    for (const [w, n] of counts) if (n >= 2 && (!best || n > (counts.get(best) ?? 0))) best = w
    if (best) return best[0].toUpperCase() + best.slice(1)
    const first = String(texts[0] || 'Pool')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    return first.slice(0, 2).join(' ') || 'Pool'
  }
  function sigOf(tl: TL) {
    return tl.kind === 'pool'
      ? tl.members.map((m) => label(m)).sort().join('|')
      : label(tl.t) + '·' + answersOf(tl.t).length
  }

  // ---------- radii ----------
  const looseCount = () => view.tls.filter((tl) => tl.kind === 'drop').length
  function radiusOf(tl: TL) {
    if (tl.kind === 'pool') return Math.min(126, 78 + tl.members.length * 9)
    if (openPool && memberShown(tl.t)) return 50
    const shrink = Math.min(22, Math.max(0, (looseCount() - 5) * 2.5))
    return Math.max(36, Math.min(112, 62 + answersOf(tl.t).length * 13 - shrink))
  }
  const memberShown = (_t: Thought) => false // members render via their own paint path

  // ---------- painting ----------
  const els = new Map<string, HTMLDivElement>()
  function mountEl(id: string, cls: string) {
    const el = document.createElement('div')
    el.className = cls
    el.dataset.id = id
    el.style.setProperty('--blob', blobOf(id))
    field.appendChild(el)
    els.set(id, el)
    return el
  }
  function unmountEl(id: string) {
    els.get(id)?.remove()
    els.delete(id)
  }
  // A pool with a lot inside it holds smaller members, so the ring it needs
  // does not run away with the whole sky.
  function memberR(n = 1) {
    return Math.max(34, Math.min(50, 54 - n * 1.6))
  }
  // The ring an opened pool lays its members out on. Big enough to clear the
  // pool's own body and its name, and big enough that no two members touch —
  // whichever of those is the larger demand.
  function orbitR(g: TL) {
    const n = Math.max(1, g.members.length)
    const mr = memberR(n)
    const apart = n > 1 ? (mr + 9) / Math.sin(Math.PI / n) : 0
    return Math.max(radiusOf(g) + mr + 18, apart)
  }
  function paintDropEl(t: Thought, el: HTMLDivElement, r: number, asMember: boolean) {
    el.style.width = el.style.height = r * 2 + 'px'
    el.classList.toggle('saturated', isRipe(t))
    el.classList.toggle('member', asMember)
    el.classList.toggle('small', r < 50)
    const dots = answersOf(t).length
      ? `<div class="dots">${'<i></i>'.repeat(Math.min(3, answersOf(t).length))}</div>`
      : ''
    const st = isRipe(t)
      ? `<div class="state blue">saturated</div>`
      : isKept(t)
        ? `<div class="state">has a path</div>`
        : dots
    const photo = imgOf(t) ? `<div class="photo"></div>` : ''
    el.innerHTML = (isRipe(t) ? `<div class="ring"></div>` : '') + photo + `<div class="t"></div>${r < 50 ? '' : st}`
    const ph = el.querySelector('.photo') as HTMLDivElement | null
    if (ph && imgOf(t)) ph.style.backgroundImage = `url(${imgOf(t)})`
    const tx = el.querySelector('.t') as HTMLDivElement
    // type grows with the drop, so a big idea reads big and a small one stays quiet
    tx.style.fontSize = Math.round(Math.max(10.5, Math.min(17, 6 + r * 0.105)) * 10) / 10 + 'px'
    tx.textContent = trim(label(t), r < 50 ? 40 : 92)
  }
  function paintAll() {
    const alive = new Set<string>()
    for (const tl of view.tls) {
      alive.add(tl.t.id)
      const el = els.get(tl.t.id) ?? mountEl(tl.t.id, tl.kind === 'pool' ? 'skyb pool' : 'skyb')
      el.classList.toggle('pool', tl.kind === 'pool')
      // an open pool takes the stage; everything else steps back
      el.classList.toggle('recede', !!openPool && openPool !== tl.t.id)
      if (tl.kind === 'pool') {
        const r = radiusOf(tl)
        el.style.width = el.style.height = r * 2 + 'px'
        const shifted = isKept(tl.t) && !!ex(tl.t).planSig && ex(tl.t).planSig !== sigOf(tl)
        const open = openPool === tl.t.id
        const st = open
          ? ''
          : shifted
            ? 'the sky shifted'
            : isKept(tl.t)
              ? 'has a path'
              : `${tl.members.length} inside`
        const next = tl.members[0]
        const peek = !open && next ? `<div class="peek"></div>` : ''
        el.innerHTML =
          `<div class="t" style="font-weight:600"></div>` + peek + (st ? `<div class="state ${shifted ? 'blue' : ''}"></div>` : '')
        const nameEl = el.querySelector('.t') as HTMLDivElement
        nameEl.style.fontSize = Math.round(Math.max(12, Math.min(18, 7 + r * 0.1)) * 10) / 10 + 'px'
        nameEl.textContent = label(tl.t)
        if (st) (el.querySelector('.state') as HTMLDivElement).textContent = st
        if (peek) (el.querySelector('.peek') as HTMLDivElement).textContent = '→ ' + trim(label(next), 34)
      } else {
        paintDropEl(tl.t, el, radiusOf(tl), false)
      }
      // open pool renders its members in orbit
      if (tl.kind === 'pool' && openPool === tl.t.id) {
        for (const m of tl.members) {
          alive.add(m.id)
          const me = els.get(m.id) ?? mountEl(m.id, 'skyb')
          me.classList.remove('recede')
          paintDropEl(m, me, memberR(), true)
        }
      }
    }
    for (const [id] of els) if (!alive.has(id)) unmountEl(id)
    const resting = S().thoughts.filter((t) => t.status === 'snoozed').length
    restEl.textContent = `☁ ${resting} resting`
    restEl.classList.toggle('show', resting > 0)
    // first-run invite
    inviteEl.style.display = view.tls.length === 0 ? '' : 'none'
  }

  // the question bubble — pure invitation, not a stored thought
  const inviteEl = document.createElement('div')
  inviteEl.className = 'skyb'
  inviteEl.dataset.id = '__invite'
  inviteEl.style.width = inviteEl.style.height = '192px'
  inviteEl.innerHTML = `<div class="q">What’s on your mind?</div>`
  field.appendChild(inviteEl)
  const invitePos: Pos = { x: W / 2, y: H * 0.34, rx: W / 2, ry: H * 0.34, s: 1, vx: 0, vy: 0, mk: 0, mt: 0, mx: 1, my: 0 }

  // ---------- splash / say ----------
  function splash(x: number) {
    for (const s of [26, 48]) {
      const r = document.createElement('div')
      r.className = 'sky-ripple'
      r.style.width = r.style.height = s + 'px'
      r.style.left = x - s / 2 + 'px'
      r.style.top = waterlineY() - 5 + 'px'
      r.style.transform = 'scaleY(0.32)'
      stage.appendChild(r)
      setTimeout(() => r.remove(), 950)
    }
  }
  let sayT: ReturnType<typeof setTimeout> | null = null
  function say(msg: string) {
    hint.textContent = msg
    hint.style.opacity = '1'
    if (sayT) clearTimeout(sayT)
    sayT = setTimeout(() => {
      hint.style.opacity = '0'
    }, 4200)
  }

  // ---------- undo / ocean / clouds ----------
  let undoFn: (() => void) | null = null
  let undoT: ReturnType<typeof setTimeout> | null = null
  function offerUndo(lb: string, fn: () => void) {
    undoLb.textContent = lb
    undoFn = fn
    undoEl.classList.add('show')
    if (undoT) clearTimeout(undoT)
    undoT = setTimeout(() => hideUndo(), 6000)
  }
  function hideUndo() {
    undoEl.classList.remove('show')
    undoFn = null
  }
  undoGo.addEventListener('click', () => {
    if (!undoFn) return
    const f = undoFn
    hideUndo()
    f()
  })

  function completeDrop(t: Thought) {
    const el = els.get(t.id)
    const p = posOf(t.id)
    const poolId = view.tls.find((tl) => tl.kind === 'pool' && tl.members.some((m) => m.id === t.id))?.t.id
    S().updateThought(t.id, { status: 'done', completed_at: new Date().toISOString() })
    let poolDone = false
    if (poolId) {
      const remaining = view.byId.get(poolId)?.members.filter((m) => m.id !== t.id).length ?? 0
      if (remaining === 0) {
        S().updateThought(poolId, { status: 'done', completed_at: new Date().toISOString() })
        poolDone = true
      }
    }
    if (el) {
      els.delete(t.id)
      const r = el.clientWidth / 2 || 40
      const line = waterlineY()
      // pulled under: it flattens as it meets the surface, then goes down
      el.style.transition = 'transform 560ms cubic-bezier(0.35, 0, 0.7, 0.55), opacity 560ms ease-in 180ms'
      el.style.transform = `translate3d(${p.rx - r}px, ${(line - cam.y) / cam.k - r}px, 0) scale(1.06, 0.7)`
      setTimeout(() => {
        el.style.transition = 'transform 620ms cubic-bezier(0.5, 0, 0.9, 0.5), opacity 620ms'
        el.style.transform = `translate3d(${p.rx - r}px, ${(line + 90 - cam.y) / cam.k - r}px, 0) scale(0.3, 0.24)`
        el.style.opacity = '0'
      }, reduced ? 0 : 420)
      setTimeout(() => el.remove(), reduced ? 0 : 1120)
    }
    setTimeout(() => splash(p.rx * cam.k + cam.x), reduced ? 0 : 420)
    haptics.sink()
    say(poolDone ? 'returned to the ocean — the pool with it' : 'returned to the ocean')
    offerUndo(`“${trim(label(t), 26)}” returned to the ocean`, () => {
      S().updateThought(t.id, { status: 'open', completed_at: null })
      if (poolDone && poolId) S().updateThought(poolId, { status: 'open', completed_at: null })
      say('back from the ocean')
    })
  }
  function restDrop(t: Thought) {
    const until = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    S().updateThought(t.id, { status: 'snoozed', snooze_until: until })
    clearAll()
    say('rising into the high clouds — back tomorrow')
    offerUndo(`“${trim(label(t), 26)}” is resting`, () => {
      S().updateThought(t.id, { status: 'open', snooze_until: null })
    })
  }
  let tidying = false
  tidyEl.addEventListener('click', async () => {
    if (tidying) return
    tidying = true
    tidyEl.textContent = 'tidying…'
    const res = await tidySky((goalId, i, total) => {
      const p = posOf(goalId)
      const ang = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
      p.x = p.rx = worldW() / 2 + Math.cos(ang) * 220
      p.y = p.ry = worldH() / 2 + Math.sin(ang) * 180
    })
    tidying = false
    tidyEl.textContent = '✦ tidy'
    if (res.kind === 'tidied') {
      haptics.join()
      fitWhenSettled()
      const bits: string[] = []
      if (res.made) bits.push(`${res.made} new pool${res.made === 1 ? '' : 's'}`)
      if (res.joined) bits.push(`${res.joined} gathered`)
      say(res.note || bits.join(' · '))
      if (res.focus) setTimeout(() => say(`worth your attention: ${res.focus}`), 4400)
    } else say(res.kind === 'failed' ? 'could not tidy just now' : 'nothing obvious to gather')
  })
  restEl.addEventListener('click', () => {
    for (const t of S().thoughts) {
      if (t.status === 'snoozed') S().updateThought(t.id, { status: 'open', snooze_until: null })
    }
    say('the clouds part — they return')
  })
  // wake anything whose rest is over
  for (const t of S().thoughts) {
    if (t.status === 'snoozed' && t.snooze_until && t.snooze_until <= todayISO()) {
      S().updateThought(t.id, { status: 'open', snooze_until: null })
    }
  }

  // ---------- pools / threads ----------
  function partOfRel(childId: string) {
    return S().relationships.find((r) => r.type === 'part_of' && r.from_id === childId)
  }
  // Two drops do not blink into a pool — they rush together, meet, and the
  // pool grows out of where they met.
  function coalesce(from: { x: number; y: number; r: number }[], at: { x: number; y: number }) {
    if (reduced) return
    for (const f of from) {
      const g = document.createElement('div')
      g.className = 'sky-ghost'
      g.style.width = g.style.height = f.r * 2 + 'px'
      g.style.transform = `translate3d(${f.x - f.r}px, ${f.y - f.r}px, 0) scale(1)`
      field.appendChild(g)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          g.style.transform = `translate3d(${at.x - f.r}px, ${at.y - f.r}px, 0) scale(0.22)`
          g.style.opacity = '0'
        }),
      )
      setTimeout(() => g.remove(), 640)
    }
    const ring = document.createElement('div')
    ring.className = 'sky-join'
    const rr = Math.max(...from.map((f) => f.r)) * 2.1
    ring.style.width = ring.style.height = rr + 'px'
    ring.style.transform = `translate3d(${at.x - rr / 2}px, ${at.y - rr / 2}px, 0)`
    field.appendChild(ring)
    setTimeout(() => ring.remove(), 1160)
  }

  function poolTogether(a: TL, b: TL, at: { x: number; y: number }) {
    const pa = posOf(a.t.id)
    const pb = posOf(b.t.id)
    coalesce(
      [
        { x: pa.x, y: pa.y, r: radiusOf(a) },
        { x: pb.x, y: pb.y, r: radiusOf(b) },
      ],
      at,
    )
    if (a.kind === 'pool' && b.kind === 'pool') {
      for (const m of b.members) {
        const rel = partOfRel(m.id)
        if (rel) S().deleteRelationship(rel.id)
        S().addRelationship(m.id, a.t.id, 'part_of')
      }
      S().deleteThought(b.t.id)
      say(`pooled into “${label(a.t)}”`)
    } else if (a.kind === 'pool' || b.kind === 'pool') {
      const pool = a.kind === 'pool' ? a : b
      const drop = a.kind === 'pool' ? b : a
      S().addRelationship(drop.t.id, pool.t.id, 'part_of')
      say(`absorbed into “${label(pool.t)}”`)
    } else {
      // the local guess lands instantly so the drag never waits; a real name
      // replaces it a moment later
      const name = conceptName([label(a.t), label(b.t)])
      const g = S().addThought({ raw_content: name, title: name, type: 'goal' })
      const p = posOf(g.id)
      p.x = p.rx = at.x
      p.y = p.ry = at.y
      p.s = 0.18 // the spring swells it out of the meeting point
      S().addRelationship(a.t.id, g.id, 'part_of')
      S().addRelationship(b.t.id, g.id, 'part_of')
      const texts = [a, b].flatMap((tl) => (tl.kind === 'pool' ? tl.members.map(label) : [label(tl.t)]))
      nameThePool(g.id, texts)
      say(`pooled — “${name}”`)
    }
    splash(at.x)
    haptics.join()
  }
  function releaseMember(t: Thought, poolId: string) {
    const rel = partOfRel(t.id)
    if (rel) S().deleteRelationship(rel.id)
    say('released from the pool')
    const remaining = view.byId.get(poolId)?.members.filter((m) => m.id !== t.id) ?? []
    if (remaining.length === 0) openPool = null
  }

  // ---------- hold-gravity ----------
  let holding: { id: string; auto: boolean; started: number } | null = null
  function startPull(tl: TL, auto: boolean) {
    const kin = kinOf(tl)
      .slice(0, 6)
      .filter((k) => k.shared >= STRONG || !hasThread(tl.t.id, k.tl.t.id))
    if (!kin.length) {
      say('nothing like-minded nearby yet')
      return
    }
    closeMoons()
    holding = { id: tl.t.id, auto, started: performance.now() }
    els.get(tl.t.id)?.classList.add('holding')
    haptics.grab()
    say(auto ? 'gathering like-minded ideas…' : 'hold — like-minded ideas are drawn in')
  }
  function stepHold() {
    if (!holding) return
    const host = view.byId.get(holding.id)
    if (!host) {
      endHold(false)
      return
    }
    const kin = kinOf(host)
    let settled = true
    for (const k of kin.slice(0, 6)) {
      const strong = k.shared >= STRONG
      if (!strong && hasThread(host.t.id, k.tl.t.id)) continue
      const hp = posOf(host.t.id)
      const kp = posOf(k.tl.t.id)
      const dx = hp.x - kp.x
      const dy = hp.y - kp.y
      const dist = Math.hypot(dx, dy) || 1
      const target = radiusOf(host) + radiusOf(k.tl) + (strong ? -8 : 52)
      if (dist > target + 12) {
        settled = false
        const speed = Math.min(strong ? 8 : 5, dist * 0.07)
        kp.x += (dx / dist) * speed
        kp.y += (dy / dist) * speed
      }
    }
    if (holding.auto && (settled || performance.now() - holding.started > 3600)) endHold(true)
  }
  function endHold(resolve: boolean) {
    if (!holding) return
    const hostId = holding.id
    els.get(hostId)?.classList.remove('holding')
    holding = null
    if (!resolve) return
    let host = view.byId.get(hostId)
    if (!host) return
    const kin = kinOf(host).slice(0, 6)
    let merged = 0
    let threaded = 0
    for (const k of kin) {
      host = view.byId.get(hostId) ?? (host.kind === 'drop' ? view.tls.find((tl) => tl.kind === 'pool' && tl.members.some((m) => m.id === hostId)) : undefined)
      if (!host) break
      const cur = view.byId.get(k.tl.t.id)
      if (!cur) continue
      if (k.shared >= STRONG) {
        const hp = posOf(host.t.id)
        poolTogether(host, cur, { x: hp.x, y: hp.y })
        rebuild()
        merged++
      } else if (!hasThread(host.t.id, cur.t.id)) {
        S().addRelationship(host.t.id, cur.t.id, 'relates_to')
        threaded++
      }
    }
    rebuild()
    paintAll()
    if (merged || threaded) {
      const bits: string[] = []
      if (merged) bits.push(`${merged + 1} became one`)
      if (threaded) bits.push(`${threaded} now share a thread`)
      say(bits.join(' · '))
    } else say('they drift near — but nothing binds yet')
  }

  // ---------- the light page ----------
  type PageMode = 'capture' | 'grow' | 'edit' | 'path'
  let pageFor: { mode: PageMode; tl?: TL; ox: number; oy: number } | null = null
  function planOf(tl: TL): Step[] {
    if (tl.kind === 'drop') {
      const a = answersOf(tl.t)
      const why = a[0] || 'the reason it surfaced at all'
      const small = a[1] || 'the smallest version you can picture'
      const who = a[2] || 'one person who would get it'
      return [
        { ph: 'first', pt: 'Sit with it', detail: `Hold on to “${trim(why, 60)}.” Notice what keeps returning.` },
        { ph: 'then', pt: 'Shape the smallest true version', detail: `${trim(small, 70)} — small enough to finish before doubt arrives.` },
        { ph: 'then', pt: 'Make one piece of it real', detail: 'One sitting, one artifact. Rough is correct.' },
        { ph: 'later', pt: `Show it to ${trim(who, 36)}`, detail: 'Not for approval — to watch what happens.' },
      ]
    }
    const steps = tl.members.slice(0, 3).map((m) => {
      const t = trim(label(m), 46)
      if (/\?$/.test(label(m).trim())) return { ph: 'then', pt: `Answer: ${t}`, detail: 'One honest paragraph is enough.' }
      return { ph: 'then', pt: `Rough out “${t}”`, detail: 'A sketch, a note, a photo — proof it can exist.' }
    })
    return [
      { ph: 'first', pt: `Name the thread: ${label(tl.t)}`, detail: 'These ideas pooled for a reason. Say it in one line.' },
      ...steps,
      { ph: 'later', pt: 'Show the pool to someone who gets it', detail: 'Not for approval — to watch what happens.' },
    ].slice(0, 5)
  }
  function openPage(mode: PageMode, tl: TL | undefined, ox: number, oy: number) {
    pageFor = { mode, tl, ox, oy }
    pageA.style.display = 'none'
    pageA.innerHTML = ''
    pageT.style.display = mode === 'path' ? 'none' : ''
    page.classList.toggle('path', mode === 'path')
    pageD.textContent = mode === 'path' ? (tl && isKept(tl.t) ? 'Keep it' : 'Keep this path') : 'Done'
    if (mode === 'path' && tl) {
      pageQ.textContent = `The rain from “${trim(label(tl.t), 44)}”`
      const stale = isKept(tl.t) && !!ex(tl.t).planSig && ex(tl.t).planSig !== sigOf(tl)
      pageN.textContent = stale ? 'the sky shifted — this is fresh' : ''
      const plan = (isKept(tl.t) && !stale && (ex(tl.t).plan as Step[] | undefined)) || planOf(tl)
      patchExtra(tl.t, { plan, planSig: sigOf(tl) })
      pageA.style.display = 'block'
      pageA.innerHTML = plan
        .map((_, i) => `<div class="step${i === 0 ? ' first' : ''}"><div class="k"></div><div class="v"></div><div class="d"></div></div>`)
        .join('')
      const stepEls = [...pageA.querySelectorAll('.step')] as HTMLDivElement[]
      stepEls.forEach((el, i) => {
        // a numeral, not "then / then / then" — repetition carries no information
        ;(el.querySelector('.k') as HTMLElement).textContent = String(i + 1)
        ;(el.querySelector('.v') as HTMLElement).textContent = plan[i].pt
        ;(el.querySelector('.d') as HTMLElement).textContent = plan[i].detail
        el.style.transitionDelay = reduced ? '0ms' : 180 + i * 90 + 'ms'
      })
    } else if (mode === 'capture') {
      pendingImage = null
      pageQ.textContent = 'What’s on your mind?'
      pageT.value = ''
      pageT.placeholder = 'Let it storm.'
      pageN.textContent = '✦ organizes · or a line, a drop'
    } else if (mode === 'grow' && tl) {
      pageQ.textContent = QUESTIONS[answersOf(tl.t).length] || 'What else wants to be said?'
      pageT.value = ''
      pageT.placeholder = 'Answer with as much or as little as you have…'
      pageN.textContent = trim(label(tl.t), 46)
    } else if (tl) {
      pageQ.textContent = 'Inside this drop'
      pageT.value = tl.t.raw_content
      pageT.placeholder = ''
      pageN.textContent = answersOf(tl.t).length ? '' : 'edits are kept'
      const answers = answersOf(tl.t)
      if (imgOf(tl.t) || answers.length) {
        pageA.style.display = 'block'
        pageA.innerHTML =
          (imgOf(tl.t) ? `<img alt="the photo in this drop" />` : '') +
          (answers.length ? `<div class="lab">what it has absorbed</div>` + answers.map(() => `<div class="a"></div>`).join('') : '')
        const im = pageA.querySelector('img')
        if (im && imgOf(tl.t)) im.src = imgOf(tl.t) as string
        ;[...pageA.querySelectorAll('.a')].forEach((el, i) => ((el as HTMLElement).textContent = answers[i]))
      }
    }
    pageMic.classList.toggle('show', speechOK && (mode === 'capture' || mode === 'grow'))
    pageMic.classList.remove('live')
    pagePic.classList.toggle('show', mode === 'capture')
    pageAbsorb.classList.toggle('show', mode === 'capture' && !S().offline)
    pageLater.classList.toggle('show', mode === 'edit')
    page.classList.add('show')
    page.style.clipPath = `circle(0px at ${ox}px ${oy}px)`
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        page.style.clipPath = `circle(${Math.hypot(W, innerHeight)}px at ${ox}px ${oy}px)`
        page.classList.add('on')
      }),
    )
    if (mode !== 'path') setTimeout(() => pageT.focus(), reduced ? 0 : 260)
  }
  function classifyQuiet(t: Thought) {
    if (S().offline) return
    void runAction<ClassifyOutput>('classify_thought', { raw_content: t.raw_content })
      .then(({ output }) =>
        S().updateThought(t.id, {
          type: output.type === 'goal' ? 'idea' : output.type,
          title: output.title,
          summary: output.summary || null,
          confidence: output.confidence,
        }),
      )
      .catch(() => {})
  }
  function closePage(commit: boolean) {
    if (!pageFor) return
    stopMic()
    const pf = pageFor
    pageFor = null
    pageT.blur()
    page.classList.remove('on')
    page.style.clipPath = `circle(0px at ${pf.ox}px ${pf.oy}px)`
    setTimeout(() => page.classList.remove('show', 'path', 'reading'), reduced ? 0 : 580)
    if (!commit) return
    const v = pageT.value
    if (pf.mode === 'capture') {
      const blocks = parseCapture(v.trim())
      if (!blocks.length) return
      let drops = 0
      let pools = 0
      for (const b of blocks) {
        if (b.children.length) {
          pools++
          const g = S().addThought({ raw_content: b.title, title: b.title, type: 'goal', due_date: b.due })
          const gp = posOf(g.id)
          gp.x = gp.rx = pf.ox + (Math.random() - 0.5) * 60
          gp.y = gp.ry = Math.max(140, pf.oy - 60)
          for (const c of b.children) {
            const child = S().addThought({ raw_content: c, title: c, type: 'action' })
            S().addRelationship(child.id, g.id, 'part_of')
          }
        } else {
          for (const line of b.body.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
            drops++
            const t = S().addThought({ raw_content: line, due_date: b.due, source: micUsed ? 'voice' : 'text' })
            const p = posOf(t.id)
            const a = Math.random() * Math.PI * 2
            const rad = drops === 1 && pools === 0 ? 0 : 100 + (drops % 3) * 46
            p.x = p.rx = Math.max(60, Math.min(W - 60, pf.ox + Math.cos(a) * rad))
            p.y = p.ry = Math.max(140, Math.min(H - 160, pf.oy + Math.sin(a) * rad * 0.8))
            classifyQuiet(t)
          }
        }
      }
      micUsed = false
      splash(pf.ox)
      persistLayout()
      say(
        pools
          ? `${pools === 1 ? 'a pool formed' : pools + ' pools formed'}${drops ? ` · ${drops} loose drop${drops > 1 ? 's' : ''}` : ''}`
          : drops > 1
            ? `the storm settles — ${drops} drops in the sky`
            : 'it’s yours — drag it, grow it, pool it',
      )
    } else if (pf.mode === 'grow' && pf.tl) {
      const ans = v.trim()
      if (!ans) return
      const t = pf.tl.t
      patchExtra(t, { answers: [...answersOf(t), ans], plan: null, planSig: null })
      absorbAnim(t.id)
      say(answersOf(t).length === 0 ? 'saturated — it’s ready to rain' : 'absorbed — the path grows richer')
    } else if (pf.mode === 'path' && pf.tl) {
      patchExtra(pf.tl.t, { kept: true })
      say('the path is kept — it will wait for you')
    } else if (pf.tl) {
      const txt = v.trim()
      if (txt) S().updateThought(pf.tl.t.id, { raw_content: txt, title: null })
    }
  }
  pageD.addEventListener('click', () => {
    if (pageFor?.mode === 'capture' && micUsed && pageT.value.trim().length > 80) {
      void runOrganize(true)
      return
    }
    closePage(true)
  })
  pageX.addEventListener('click', () => closePage(false))
  function absorbAnim(id: string) {
    const p = posOf(id)
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
    const d = document.createElement('div')
    d.className = 'sky-drop-in'
    d.style.transform = `translate(${p.x + Math.cos(a) * 140 - 13}px, ${p.y + Math.sin(a) * 140 - 13}px)`
    field.appendChild(d)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        d.style.transform = `translate(${p.x - 13}px, ${p.y - 13}px) scale(0.4)`
        d.style.opacity = '0.2'
      }),
    )
    setTimeout(() => d.remove(), reduced ? 0 : 780)
  }

  // voice + photo + absorb tools
  const SRCls =
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition ||
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
  const speechOK = !!SRCls
  let rec: SpeechRecognitionLike | null = null
  let micUsed = false
  // the stored thumbnail is far too small to read text from, so a capture also
  // keeps a legible copy in memory for as long as the page is open
  let pendingImage: { mediaType: string; dataB64: string } | null = null
  function stopMic() {
    if (rec) {
      const r = rec
      rec = null
      try {
        r.stop()
      } catch {
        /* already stopped */
      }
    }
    pageMic.classList.remove('live')
  }
  pageMic.addEventListener('click', () => {
    if (rec) {
      stopMic()
      return
    }
    if (!SRCls) return
    rec = new SRCls()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = navigator.language || 'en-US'
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (!ev.results[i].isFinal) continue
        const said = (ev.results[i][0]?.transcript || '').trim()
        if (!said) continue
        micUsed = true
        pageT.value = pageT.value.trim() ? pageT.value.replace(/\s+$/, '') + '\n' + said : said
      }
    }
    rec.onend = () => {
      rec = null
      pageMic.classList.remove('live')
    }
    rec.onerror = () => stopMic()
    try {
      rec.start()
      pageMic.classList.add('live')
      pageN.textContent = 'listening…'
    } catch {
      rec = null
    }
  })
  pagePic.addEventListener('click', () => pageFile.click())
  pageFile.addEventListener('change', () => {
    const f = pageFile.files && pageFile.files[0]
    pageFile.value = ''
    if (!f || !pageFor) return
    const url = URL.createObjectURL(f)
    const im = new Image()
    im.onload = () => {
      URL.revokeObjectURL(url)
      const draw = (max: number, q: number) => {
        const k = Math.min(1, max / Math.max(im.width, im.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(im.width * k))
        c.height = Math.max(1, Math.round(im.height * k))
        ;(c.getContext('2d') as CanvasRenderingContext2D).drawImage(im, 0, 0, c.width, c.height)
        return c.toDataURL('image/jpeg', q)
      }
      let img: string
      let readable: string
      try {
        img = draw(320, 0.8) // the drop's face — small enough to live in a row
        readable = draw(1400, 0.85) // legible enough for the model to read
      } catch {
        return
      }
      pendingImage = { mediaType: 'image/jpeg', dataB64: readable.split(',')[1] }
      // show it. Picking a photo with no visible result is indistinguishable
      // from the picker having failed.
      pageA.style.display = 'block'
      pageA.innerHTML = `<div class="lab">attached</div><img alt="the photo you just added" />`
      const prev = pageA.querySelector('img')
      if (prev) prev.src = img
      const pf = pageFor
      const t = S().addThought({ raw_content: 'Photo', title: 'Photo', extra: { img } })
      const p = posOf(t.id)
      const a = Math.random() * Math.PI * 2
      p.x = p.rx = Math.max(60, Math.min(W - 60, (pf?.ox ?? W / 2) + Math.cos(a) * 110))
      p.y = p.ry = Math.max(140, Math.min(waterlineY() - 90, (pf?.oy ?? H / 2) + Math.sin(a) * 90))
      // choosing a picture is the request to read it — no second tap needed
      if (!S().offline) void runOrganize(false, t.id)
      else pageN.textContent = 'kept — reading needs a connection'
    }
    im.onerror = () => URL.revokeObjectURL(url)
    im.src = url
  })
  // scatter what organize creates around where the dump was written
  function placeNear(ox: number, oy: number) {
    return (id: string, i: number, total: number) => {
      const p = posOf(id)
      const ang = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
      const rad = total === 1 ? 0 : 110 + (i % 3) * 52
      p.x = Math.max(60, Math.min(W - 60, ox + Math.cos(ang) * rad))
      p.y = Math.max(140, Math.min(waterlineY() - 90, oy + Math.sin(ang) * rad * 0.8))
    }
  }
  let organizing = false
  async function runOrganize(spoken: boolean, photoId?: string) {
    const v = pageT.value.trim()
    if ((!v && !pendingImage) || organizing) return
    const pf = pageFor
    const ox = pf?.ox ?? W / 2
    const oy = pf?.oy ?? H / 2
    organizing = true
    pageAbsorb.classList.add('busy')
    page.classList.add('reading')
    pageN.textContent = pendingImage ? 'reading the picture…' : spoken ? 'making sense of what you said…' : 'reading it through…'
    const res = await organizeText(v, spoken, placeNear(ox, oy), pendingImage ?? undefined)
    organizing = false
    pageAbsorb.classList.remove('busy')
    page.classList.remove('reading')
    if (res.kind === 'organized') {
      // the picture now knows what it shows
      if (photoId && res.source) S().updateThought(photoId, { title: res.source, raw_content: res.source })
      pageT.value = ''
      micUsed = false
      pendingImage = null
      closePage(false)
      splash(ox)
      haptics.arrive()
      const bits: string[] = []
      if (res.pools) bits.push(`${res.pools} pool${res.pools === 1 ? '' : 's'}`)
      if (res.links) bits.push(`${res.links} thread${res.links === 1 ? '' : 's'}`)
      say(res.note || `${res.drops} drops${bits.length ? ' · ' + bits.join(' · ') : ''}`)
    } else {
      // nothing found, or the engine is down — the words still become drops
      closePage(true)
      if (photoId) say(res.kind === 'failed' ? 'the picture is kept — reading it failed' : 'the picture is kept')
      else say(res.kind === 'failed' ? 'kept as written — the thinking engine is quiet' : 'kept as written')
    }
  }
  pageAbsorb.addEventListener('click', () => void runOrganize(micUsed))

  pageLater.addEventListener('click', () => {
    if (!pageFor || pageFor.mode !== 'edit' || !pageFor.tl) return
    const t = pageFor.tl.t
    closePage(false)
    restDrop(t)
  })

  // ---------- moons ----------
  let moonsFor: string | null = null
  const moonEls: HTMLDivElement[] = []
  function closeMoons() {
    moonEls.forEach((m) => m.remove())
    moonEls.length = 0
    moonsFor = null
  }
  function showMoons(tl: TL) {
    closeMoons()
    moonsFor = tl.t.id
    const p = posOf(tl.t.id)
    // an opened pool has already been framed by the camera; leave it where it is
    if (openPool !== tl.t.id) p.y = Math.max(p.y, radiusOf(tl) + 170)
    const acts: { icon: string; lb: string; dim?: boolean; run: () => void }[] = []
    if (tl.kind === 'drop' && !isKept(tl.t)) {
      acts.push({
        icon: 'grow',
        lb: isRipe(tl.t) ? 'deepen' : 'grow',
        run: () => {
          closeMoons()
          openPage('grow', tl, p.x, p.y)
        },
      })
    }
    const kin = kinOf(tl)
    acts.push({ icon: 'gather', lb: 'gather', dim: kin.length === 0, run: () => startPull(tl, true) })
    const canRain = tl.kind === 'drop' || tl.members.length >= 1
    acts.push({
      icon: 'rain',
      lb: isKept(tl.t) ? 'path' : 'rain',
      dim: !canRain,
      run: () => {
        closeMoons()
        rain(tl)
      },
    })
    acts.forEach((a, i) => {
      const m = document.createElement('div')
      m.className = 'sky-moon' + (a.dim ? ' dim' : '')
      m.innerHTML = `<div class="ic">${moonSvg(a.icon)}</div><div class="lb">${a.lb}</div>`
      if (!reduced) m.style.animationDelay = i * 45 + 'ms'
      m.style.transformOrigin = '27px 27px'
      m.addEventListener('pointerdown', (e) => e.stopPropagation())
      m.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!a.dim) a.run()
        else say('nothing similar yet')
      })
      field.appendChild(m)
      moonEls.push(m)
      ;(m as HTMLDivElement & { _slot?: number; _of?: number })._slot = i
      ;(m as HTMLDivElement & { _slot?: number; _of?: number })._of = acts.length
    })
  }
  function layoutMoons() {
    if (!moonsFor) return
    const tl = view.byId.get(moonsFor)
    if (!tl) {
      closeMoons()
      return
    }
    const p = posOf(tl.t.id)
    const r = radiusOf(tl) + 44
    // the orbit swings toward open space — the moons face the middle of the
    // screen, so they never collide with each other or fall off an edge
    const open = openPool === tl.t.id
    const toCenter = Math.atan2(worldH() * 0.46 - p.y, worldW() / 2 - p.x)
    const spread = 0.66
    moonEls.forEach((m) => {
      const el = m as HTMLDivElement & { _slot?: number; _of?: number }
      const n = el._of ?? 1
      const slot = el._slot ?? 0
      let x: number
      let y: number
      if (open) {
        // an opened pool is showing its contents; its own actions step clear of
        // the whole ring and wait together below it
        const gap = 78 / cam.k
        x = p.x + (slot - (n - 1) / 2) * gap - 27
        y = p.y + orbitR(tl) + memberR(tl.members.length) + 46
      } else {
        const ang = toCenter + (slot - (n - 1) / 2) * spread
        x = p.x + Math.cos(ang) * r - 27
        y = p.y + Math.sin(ang) * r - 27
      }
      // the moons live in the world but are things you tap: they keep their
      // real size however far out the camera has pulled
      m.style.transform = `translate(${x}px, ${y}px) scale(${(1 / cam.k).toFixed(3)})`
    })
  }

  function rain(tl: TL) {
    closeMoons()
    openPool = null
    const p = posOf(tl.t.id)
    const r0 = radiusOf(tl)
    if (!reduced) {
      for (let k = 0; k < 7; k++) {
        const d = document.createElement('div')
        d.className = 'sky-rain-drop'
        const dx = (Math.random() - 0.5) * r0 * 1.5
        d.style.transform = `translate(${p.x + dx}px, ${p.y + r0 * 0.5}px)`
        d.style.opacity = '0.9'
        field.appendChild(d)
        setTimeout(() => {
          d.style.transform = `translate(${p.x + dx * 1.4}px, ${waterlineY()}px)`
          d.style.opacity = '0'
        }, 30 + k * 55)
        setTimeout(() => d.remove(), 900 + k * 55)
      }
      setTimeout(() => splash(p.x), 480)
    }
    haptics.arrive()
    setTimeout(() => openPage('path', tl, p.x, p.y), reduced ? 0 : 430)
  }
  let openPool: string | null = null
  function clearAll() {
    closeMoons()
    const wasOpen = !!openPool
    if (openPool) openPool = null
    paintAll()
    // coming out of a pool, the camera pulls back to the whole sky — the same
    // move in reverse. Opening another pool re-aims it a line later.
    if (wasOpen) fitAll()
  }

  let fusing: string[] = []
  function setFusing(ids: string[]) {
    if (ids.length === fusing.length && ids.every((id, i) => id === fusing[i])) return
    for (const id of fusing) els.get(id)?.classList.remove('fusing')
    fusing = ids
    for (const id of ids) els.get(id)?.classList.add('fusing')
  }

  // Which two drops are currently reaching for each other. The neck itself is
  // drawn in the frame loop rather than here, so it is built from the same
  // eased positions and the same deformation the drops are rendered with —
  // otherwise the outline lags a frame behind the bodies it is meant to hold.
  let fuse: { a: string; b: string; ra: number; rb: number } | null = null
  function clearFuse() {
    fuse = null
    goo.classList.remove('ready')
    goo.style.opacity = '0'
    goo.setAttribute('d', '')
    setFusing([])
  }

  // ---------- pointer ----------
  let drag: {
    id: string
    tl: TL
    isMember: boolean
    memberPool?: string
    dx: number
    dy: number
    sx: number
    sy: number
    vx: number
    vy: number
    moved: boolean
    touching: boolean
    target: TL | null
    el: HTMLDivElement
  } | null = null
  let bgDown: { x: number; y: number } | null = null
  let panFrom: { x: number; y: number; cx: number; cy: number } | null = null
  let panning = false
  let lastTap = 0
  const touches = new Map<number, { x: number; y: number }>()
  let pinch: { dist: number; k: number; mx: number; my: number } | null = null
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  // How far a finger has to travel before it means something. A drop answers
  // quickly; the water needs more asking, so a near-miss on a drop does not
  // slide the whole world instead.
  const TAP_SLOP = 9
  const PAN_SLOP = 16
  stage.addEventListener('pointerdown', (e) => {
    // iOS only hands over the tilt sensor from inside a real gesture, so the
    // first touch of the session is when we ask. It asks at most once.
    armUpright()
    // A first finger arriving while we still think fingers are down means the
    // last gesture's release never reached us. Nothing survives that.
    if (e.isPrimary && touches.size) {
      touches.clear()
      pinch = null
      panning = false
      panFrom = null
    }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.size === 2) {
      // two fingers: the camera takes over from whatever was happening
      const [a, b] = [...touches.values()]
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        k: cam.k,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      }
      if (holdTimer) clearTimeout(holdTimer)
      if (drag) drag.el.classList.remove('dragging')
      drag = null
      bgDown = null
      panFrom = null
      endHold(false)
      return
    }
    const bubEl = (e.target as HTMLElement).closest?.('.skyb') as HTMLDivElement | null
    if (!bubEl) {
      if (!(e.target as HTMLElement).closest?.('.sky-moon')) {
        bgDown = { x: e.clientX, y: e.clientY }
        // only offer to pan when there is something off-screen to pan to
        panFrom = canPan() ? { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y } : null
        // the water keeps the finger too: without this, a drag that wanders
        // over the tab bar never sends us its release, and the next tap lands
        // in a gesture that never ended
        try {
          stage.setPointerCapture(e.pointerId)
        } catch {
          /* the pointer is already gone */
        }
        if (holdTimer) clearTimeout(holdTimer)
        holdTimer = setTimeout(() => {
          if (bgDown && !pageFor && !holding) {
            const b = bgDown
            bgDown = null
            clearAll()
            openPage('capture', undefined, b.x, b.y)
          }
        }, 420)
      }
      return
    }
    const id = bubEl.dataset.id as string
    if (id === '__invite') {
      openPage('capture', undefined, invitePos.x, invitePos.y)
      return
    }
    const tl = view.byId.get(id)
    const memberPool = tl
      ? undefined
      : view.tls.find((x) => x.kind === 'pool' && x.members.some((m) => m.id === id))?.t.id
    const memberT = memberPool ? S().thoughts.find((t) => t.id === id) : undefined
    const ent: TL | undefined = tl ?? (memberT ? { kind: 'drop', t: memberT, members: [] } : undefined)
    if (!ent) return
    const p = posOf(id)
    drag = {
      id,
      tl: ent,
      isMember: !!memberPool,
      memberPool,
      dx: p.x - toWorldX(e.clientX),
      dy: p.y - toWorldY(e.clientY),
      sx: e.clientX,
      sy: e.clientY,
      vx: 0,
      vy: 0,
      moved: false,
      touching: false,
      target: null,
      el: bubEl,
    }
    stage.setPointerCapture(e.pointerId)
    if (holdTimer) clearTimeout(holdTimer)
    if (!memberPool) {
      holdTimer = setTimeout(() => {
        if (drag && !drag.moved) {
          const held = drag.tl
          drag.el.classList.remove('dragging')
          drag = null
          startPull(held, false)
        }
      }, 430)
    }
  })
  stage.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      camTarget = null
      zoomAt(pinch.mx, pinch.my, pinch.k * (dist / pinch.dist))
      return
    }
    if (!drag && panFrom) {
      const dx = e.clientX - panFrom.x
      const dy = e.clientY - panFrom.y
      if (!panning && Math.hypot(dx, dy) > PAN_SLOP) {
        panning = true
        bgDown = null
        if (holdTimer) clearTimeout(holdTimer)
      }
      if (panning) {
        camTarget = null
        cam.x = panFrom.cx + dx
        cam.y = panFrom.cy + dy
        applyCam()
        return
      }
    }
    if (!drag) {
      if (bgDown && Math.hypot(e.clientX - bgDown.x, e.clientY - bgDown.y) > TAP_SLOP) {
        bgDown = null
        if (holdTimer) clearTimeout(holdTimer)
      }
      return
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > TAP_SLOP) {
      drag.moved = true
      if (holdTimer) clearTimeout(holdTimer)
      drag.el.classList.add('dragging')
      closeMoons()
    }
    if (!drag.moved) return
    const p = posOf(drag.id)
    const nx = toWorldX(e.clientX) + drag.dx
    const ny = toWorldY(e.clientY) + drag.dy
    drag.vx = (nx - p.x) * 0.6 + drag.vx * 0.4
    drag.vy = (ny - p.y) * 0.6 + drag.vy * 0.4
    p.x = nx
    p.y = ny
    // the closer to the water, the more the sea reaches up for it
    if (drag.tl.kind === 'drop') {
      // against the water that is actually under it, which is not level with
      // the screen once the phone is tilted
      const line = seaLineAt(e.clientX, worldTilt(), W)
      const reach = 190
      const near = Math.max(0, Math.min(1, (e.clientY - (line - reach)) / reach))
      const ready = e.clientY > line - 12
      showTide(Math.round(near * 20) / 20, ready)
      drag.el.classList.toggle('sinking', ready)
    }
    drag.target = null
    // at the water you are letting go, not merging — one signal at a time
    if (seaNear > 0.55) {
      meter.classList.remove('on', 'zero')
      clearFuse()
      drag.touching = false
      return
    }
    if (!drag.isMember) {
      let best: TL | null = null
      let bestD = Infinity
      for (const tl of view.tls) {
        if (tl.t.id === drag.id) continue
        const tp = posOf(tl.t.id)
        const d = Math.hypot(tp.x - p.x, tp.y - p.y)
        if (d < bestD) {
          bestD = d
          best = tl
        }
      }
      if (best && bestD < radiusOf(drag.tl) + radiusOf(best) + 110) {
        const bp = posOf(best.t.id)
        const ra = radiusOf(drag.tl)
        const rb = radiusOf(best)
        const touching = bestD < (ra + rb) * 0.94
        // the two bodies are now in each other's field — the frame loop draws
        // the neck and leans them into one another
        fuse = { a: drag.id, b: best.t.id, ra, rb }
        // and what they would become, which is the only useful thing to say
        meter.textContent =
          best.kind === 'pool'
            ? label(best.t)
            : (sharedConcept([label(drag.tl.t), label(best.t)]) ?? 'a new pool')
        meter.style.left = ((p.x + bp.x) / 2) * cam.k + cam.x + 'px'
        meter.style.top = ((p.y + bp.y) / 2) * cam.k + cam.y - (Math.max(ra, rb) * cam.k + 26) + 'px'
        meter.classList.add('on')
        meter.classList.toggle('zero', touching)
        if (touching && !drag.touching) haptics.grab()
        drag.touching = touching
        if (touching) drag.target = best
      } else {
        meter.classList.remove('on', 'zero')
        clearFuse()
        drag.touching = false
      }
    }
  })
  // Release is heard at the window, not the stage: a finger that wanders over
  // the tab bar or off the edge still ends its gesture. Pointer capture already
  // routes these through the stage, so this hears each release exactly once.
  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId)
    if (pinch) {
      if (touches.size < 2) pinch = null
      return
    }
    if (panning) {
      panning = false
      panFrom = null
      return
    }
    panFrom = null
    if (holdTimer) clearTimeout(holdTimer)
    if (holding && !holding.auto) {
      endHold(true)
      return
    }
    if (!drag) {
      if (bgDown && Math.hypot(e.clientX - bgDown.x, e.clientY - bgDown.y) < TAP_SLOP) {
        const now = performance.now()
        if (now - lastTap < 320) {
          // two taps on open water: frame the whole sky
          lastTap = 0
          clearAll()
          fitAll()
        } else {
          lastTap = now
          clearAll()
        }
      }
      bgDown = null
      return
    }
    const d = drag
    drag = null
    meter.classList.remove('on', 'zero')
    d.el.classList.remove('dragging', 'sinking')
    clearFuse()
    hideTide()
    if (!d.moved) {
      onTap(d.id, d.isMember)
      return
    }
    if (d.tl.kind === 'drop' && e.clientY > seaLineAt(e.clientX, worldTilt(), W) - 12) {
      completeDrop(d.tl.t)
      persistLayout()
      return
    }
    if (d.isMember && d.memberPool) {
      const gp = posOf(d.memberPool)
      const p = posOf(d.id)
      const g = view.byId.get(d.memberPool)
      if (g && Math.hypot(gp.x - p.x, gp.y - p.y) > radiusOf(g) + 70) releaseMember(d.tl.t, d.memberPool)
    }
    if (d.target) {
      const p = posOf(d.id)
      const tp = posOf(d.target.t.id)
      poolTogether(d.target, d.tl, { x: (p.x + tp.x) / 2, y: (p.y + tp.y) / 2 })
    } else if (Math.hypot(d.vx, d.vy) > 2.5) {
      const p = posOf(d.id)
      p.vx = Math.max(-14, Math.min(14, d.vx))
      p.vy = Math.max(-14, Math.min(14, d.vy))
    }
    persistLayout()
  }
  const onCancel = (e: PointerEvent) => {
    touches.delete(e.pointerId)
    if (touches.size < 2) pinch = null
    panning = false
    panFrom = null
    bgDown = null
    hideTide()
    if (holdTimer) clearTimeout(holdTimer)
    endHold(false)
    if (drag) drag.el.classList.remove('dragging')
    drag = null
    meter.classList.remove('on', 'zero')
    clearFuse()
  }
  addEventListener('pointerup', onUp)
  addEventListener('pointercancel', onCancel)
  // iOS takes the pointer back for its own reasons. Losing it while we still
  // believe the finger is down is the case that used to strand a gesture —
  // losing it on an ordinary release is just the release, already handled.
  stage.addEventListener('lostpointercapture', (e) => {
    if (touches.has(e.pointerId)) onCancel(e)
  })
  function onTap(id: string, isMember: boolean) {
    hint.style.opacity = '0'
    const tl = view.byId.get(id)
    if (isMember) {
      const t = S().thoughts.find((x) => x.id === id)
      if (t) {
        const p = posOf(id)
        openPage('edit', { kind: 'drop', t, members: [] }, p.x, p.y)
      }
      return
    }
    if (!tl) return
    const p = posOf(id)
    if (tl.kind === 'pool') {
      if (openPool === tl.t.id) showMoons(tl)
      else {
        clearAll()
        openPool = tl.t.id
        // the camera goes to the pool rather than the pool being shoved into
        // whatever part of the sky happens to be on screen
        frameOpen(tl)
        paintAll()
        showMoons(tl)
      }
      return
    }
    if (moonsFor === id) {
      closeMoons()
      openPage('edit', tl, p.x, p.y)
    } else {
      clearAll()
      showMoons(tl)
    }
  }

  // ---------- frame loop ----------
  const linePool: SVGLineElement[] = []
  let lineUsed = 0
  function drawLine(cls: string, x1: number, y1: number, x2: number, y2: number) {
    let ln = linePool[lineUsed]
    if (!ln) {
      ln = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      links.appendChild(ln)
      linePool.push(ln)
    }
    ln.setAttribute('class', cls)
    ln.setAttribute('x1', String(x1))
    ln.setAttribute('y1', String(y1))
    ln.setAttribute('x2', String(x2))
    ln.setAttribute('y2', String(y2))
    lineUsed++
  }
  function glide(p: Pos, dragged: boolean) {
    const k = reduced ? 1 : dragged ? 0.55 : 0.22
    p.rx += (p.x - p.rx) * k
    p.ry += (p.y - p.ry) * k
    p.s += ((dragged ? 1.045 : 1) - p.s) * 0.18
  }

  // ---------- the echo ----------
  // Rings that leave a live drop and travel outward, several at once, each on
  // its own clock so they never fall into step. The drop you are holding and
  // the drop whose moons are open push hard; a saturated drop only murmurs.
  // drops currently deformed toward another, so their text can be straightened
  const leaning = new Set<string>()
  const echoPool: SVGPathElement[] = []
  let echoUsed = 0
  const ECHO_LAYERS = 4
  function echoFrom(id: string, cx: number, cy: number, r: number, strength: number) {
    const h = hashN(id)
    for (let i = 0; i < ECHO_LAYERS; i++) {
      // each layer has its own period and its own head start — the stack never
      // resolves into one clean pulse
      const period = 3.1 + i * 0.83 + ((h * (i + 2)) % 1.4)
      const off = ((h * 0.37 + i * 0.29) % 1) + i * 0.17
      const phase = ((t / period + off) % 1 + 1) % 1
      const fade = Math.pow(Math.sin(phase * Math.PI), 1.35)
      const o = strength * fade * (1 - i * 0.19)
      if (o < 0.015) continue
      let el = echoPool[echoUsed]
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        echoG.appendChild(el)
        echoPool.push(el)
      }
      // the ring keeps its shape as it travels, and wobbles more the further
      // out it gets, the way a wave loses its edge
      el.setAttribute('d', echoRing(cx, cy, r * (1.02 + phase * 0.95) + 5, h + i * 2.7, 0.028 + phase * 0.05 + i * 0.012))
      // inline, not a presentation attribute: the stylesheet's opacity would win
      el.style.opacity = o.toFixed(3)
      el.style.strokeWidth = (1.15 - i * 0.16).toFixed(2)
      echoUsed++
    }
  }
  function drawEchoes() {
    echoUsed = 0
    if (reduced) {
      for (const el of echoPool) el.style.opacity = '0'
      return
    }
    const seen = new Set<string>()
    const push = (id: string | null | undefined, strength: number) => {
      if (!id || seen.has(id) || echoUsed >= 40) return
      const tl = view.byId.get(id)
      if (!tl) return
      seen.add(id)
      const p = posOf(id)
      // capped: a big pool's echo would otherwise reach across the whole sky
      echoFrom(id, p.rx, p.ry, Math.min(radiusOf(tl) * p.s, 76), strength)
    }
    // an opened pool is already saying it is live, with a ring of its contents
    // and a spoke to each one; rings on top of that is just noise
    if (openPool) {
      if (holding && holding.id !== openPool) push(holding.id, 0.4)
      for (let i = echoUsed; i < echoPool.length; i++) echoPool[i].style.opacity = '0'
      return
    }
    push(holding?.id, 0.4)
    push(moonsFor, 0.3)
    // whatever has gone ripe keeps a quiet pulse of its own — kept to a few, or
    // a full sky of ripe drops turns the echo into scratches
    let ripe = 0
    for (const tl of view.tls) {
      if (ripe >= 3) break
      if (tl.kind === 'drop' && isRipe(tl.t) && !seen.has(tl.t.id)) {
        push(tl.t.id, 0.1)
        ripe++
      }
    }
    for (let i = echoUsed; i < echoPool.length; i++) echoPool[i].style.opacity = '0'
  }
  function coast(p: Pos) {
    if (!p.vx && !p.vy) return
    p.x += p.vx
    p.y += p.vy
    p.vx *= 0.9
    p.vy *= 0.9
    if (Math.abs(p.vx) + Math.abs(p.vy) < 0.15) {
      p.vx = 0
      p.vy = 0
    }
  }
  function hashN(s: string) {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return (Math.abs(h) % 100) / 16
  }
  let t = 0
  let raf = 0
  let dead = false
  function step() {
    if (dead) return
    t += 0.016
    stepHold()
    const busy = drag || holding || pageFor
    if (!busy) {
      view.tls.forEach((tl, i) => {
        if (moonsFor === tl.t.id) return
        const p = posOf(tl.t.id)
        const ang = t * 0.09 + i * 2.1
        p.x += Math.sin(ang) * 0.06
        p.y += Math.cos(ang * 0.8) * 0.05
      })
      for (const pair of allKinPairs()) {
        if (moonsFor && (moonsFor === pair.a.t.id || moonsFor === pair.b.t.id)) continue
        const pa = posOf(pair.a.t.id)
        const pb = posOf(pair.b.t.id)
        const dx = pb.x - pa.x
        const dy = pb.y - pa.y
        const dist = Math.hypot(dx, dy) || 1
        const bonded = hasThread(pair.a.t.id, pair.b.t.id)
        const rest = radiusOf(pair.a) + radiusOf(pair.b) + (bonded ? 44 : 70)
        if (dist > rest) {
          const pull = Math.min(0.4, (dist - rest) * 0.0012 * (pair.shared + (bonded ? 2 : 0)))
          pa.x += (dx / dist) * pull
          pa.y += (dy / dist) * pull
          pb.x -= (dx / dist) * pull
          pb.y -= (dy / dist) * pull
        }
      }
      // nothing may overlap. Several soft passes settle a crowded sky without
      // the jitter a single hard shove produces.
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < view.tls.length; i++) {
          for (let j = i + 1; j < view.tls.length; j++) {
            const a = view.tls[i]
            const b = view.tls[j]
            const pa = posOf(a.t.id)
            const pb = posOf(b.t.id)
            let dx = pb.x - pa.x
            let dy = pb.y - pa.y
            let dist = Math.hypot(dx, dy)
            if (dist < 0.01) {
              // exactly coincident: nudge them apart deterministically
              dx = (i % 2 ? 1 : -1) * 0.5
              dy = 0.5
              dist = 0.71
            }
            const min = radiusOf(a) + radiusOf(b) + 26
            if (dist < min) {
              const push = (min - dist) * 0.22
              pa.x -= (dx / dist) * push
              pa.y -= (dy / dist) * push
              pb.x += (dx / dist) * push
              pb.y += (dy / dist) * push
            }
          }
        }
      }
      // The constellation drifts back into frame as a whole — a uniform nudge,
      // so your own arrangement is preserved, just re-centred. "Frame" means
      // what the camera is actually showing: aiming at a fixed point in the
      // world instead put this in a tug of war with fitAll, and drops ended up
      // pushed off the edge of a sky that had just framed them.
      if (view.tls.length && !openPool && !drag && !panning && !pinch && !camTarget) {
        let cx = 0
        let cy = 0
        for (const tl of view.tls) {
          const p = posOf(tl.t.id)
          cx += p.x
          cy += p.y
        }
        cx /= view.tls.length
        cy /= view.tls.length
        const dx = (toWorldX(W / 2) - cx) * 0.011
        const dy = (toWorldY((76 + waterlineY() - 18) / 2) - cy) * 0.011
        if (Math.abs(dx) > 0.008 || Math.abs(dy) > 0.008) {
          for (const tl of view.tls) {
            const p = posOf(tl.t.id)
            p.x += dx
            p.y += dy
          }
        }
      }
      for (const tl of view.tls) {
        const p = posOf(tl.t.id)
        coast(p)
        const r = radiusOf(tl)
        p.x = Math.max(r + 8, Math.min(worldW() - r - 8, p.x))
        p.y = Math.max(r + 8, Math.min(worldH() - r - 8, p.y))
      }
    }
    if (openPool) {
      const g = view.byId.get(openPool)
      if (g) {
        const gp = posOf(g.t.id)
        const or = orbitR(g)
        const mr = memberR(g.members.length)
        g.members.forEach((m, i) => {
          const a = -Math.PI / 2 + (i / g.members.length) * Math.PI * 2 + t * 0.05
          const mp = posOf(m.id)
          if (!(drag && drag.id === m.id)) {
            mp.x += (gp.x + Math.cos(a) * or - mp.x) * 0.1
            mp.y += (gp.y + Math.sin(a) * or - mp.y) * 0.1
          }
          // members stay in the world, not in the window — clamping them to the
          // glass is what used to fold one side of the ring onto the other
          mp.x = Math.max(mr, Math.min(worldW() - mr, mp.x))
          mp.y = Math.max(mr, Math.min(worldH() - mr, mp.y))
        })
        // clear the orbit's room: the rest of the sky drifts out of the way
        const clear = or + mr + 34
        for (const other of view.tls) {
          if (other.t.id === g.t.id) continue
          const op = posOf(other.t.id)
          const dx = op.x - gp.x
          const dy = op.y - gp.y
          const dist = Math.hypot(dx, dy) || 1
          const need = clear + radiusOf(other)
          if (dist < need) {
            const push = (need - dist) * 0.08
            op.x += (dx / dist) * push
            op.y += (dy / dist) * push
          }
        }
      }
    }
    // render — settle every body first, then decide how each one is deformed,
    // then draw. The neck and the drops have to be built from the same numbers
    // or the outline reads as a reflection floating behind two hard circles.
    for (const id of els.keys()) {
      const p = pos.get(id)
      if (!p) continue
      glide(p, drag?.id === id && drag.moved)
      p.mt = 0
    }
    if (fuse && !reduced) {
      const pa = pos.get(fuse.a)
      const pb = pos.get(fuse.b)
      if (pa && pb) {
        const dx = pb.rx - pa.rx
        const dy = pb.ry - pa.ry
        const d = Math.hypot(dx, dy) || 1
        const ra = fuse.ra * pa.s
        const rb = fuse.rb * pb.s
        // the same easing the neck uses: nothing happens until they are in
        // each other's reach, then it comes on fast
        const reach = (ra + rb) * 1.62
        const v = Math.max(0, Math.min(1, 1 - (d - (ra + rb) * 0.42) / (reach - (ra + rb) * 0.42)))
        const k = v * 0.17
        pa.mt = k
        pa.mx = dx / d
        pa.my = dy / d
        pb.mt = k
        pb.mx = -dx / d
        pb.my = -dy / d
      }
    }
    for (const [, p] of pos) p.mk += (p.mt - p.mk) * (reduced ? 1 : 0.24)
    if (fuse) {
      const pa = pos.get(fuse.a)
      const pb = pos.get(fuse.b)
      let path: string | null = null
      let show = 0
      let joined = false
      if (pa && pb) {
        const ra = fuse.ra * pa.s * (1 + pa.mk)
        const rb = fuse.rb * pb.s * (1 + pb.mk)
        const dist = Math.hypot(pb.rx - pa.rx, pb.ry - pa.ry)
        path = metaballPath(pa.rx, pa.ry, fuse.ra * pa.s, pb.rx, pb.ry, fuse.rb * pb.s, pa.mk, pb.mk)
        // it fades in as they come into reach, and hands the shape back to the
        // bodies once they have genuinely merged — past that it would only be
        // drawing an outline over a mass it is no longer holding together
        const reach = (ra + rb) * 1.62
        const near = Math.max(0, Math.min(1, 1 - (dist - (ra + rb) * 0.42) / (reach - (ra + rb) * 0.42)))
        const over = Math.max(0, (ra + rb - dist) / (ra + rb))
        show = Math.min(1, near * 3.5) * Math.max(0, 1 - over / 0.16)
        joined = near > 0.5
      }
      goo.setAttribute('d', path ?? '')
      goo.style.opacity = path ? show.toFixed(3) : '0'
      goo.classList.toggle('ready', !!path && Math.max(pa?.mk ?? 0, pb?.mk ?? 0) > 0.12)
      // one surface, not two overlapping outlines: from the moment the neck is
      // really carrying the join, the drops give up their own rims to it — but
      // not while it is still a hairline, or they would lose their edges to
      // something too faint to have replaced them
      setFusing(path && joined ? [fuse.a, fuse.b] : [])
    }
    const up = stepUpright(reduced)
    const level = Math.abs(up) > 0.2 ? ` rotate(${up.toFixed(2)}deg)` : ''
    for (const [id, el] of els) {
      const p = pos.get(id)
      if (!p) continue
      const r = el.clientWidth / 2 || 40
      const squish = reduced ? 0 : Math.sin(t * 2 + hashN(id)) * 0.014
      // a body pulled toward another stretches along the line between them and
      // narrows across it — it does not simply grow. The words ride the surface
      // rather than being smeared by it, so they stay readable throughout.
      let lean = ''
      if (p.mk > 0.002) {
        const deg = (Math.atan2(p.my, p.mx) * 180) / Math.PI
        const sx = 1 + p.mk
        const sy = 1 - p.mk * MORPH_PERP
        lean = ` rotate(${deg.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${(-deg).toFixed(1)}deg)`
        el.style.setProperty(
          '--unlean',
          `rotate(${deg.toFixed(1)}deg) scale(${(1 / sx).toFixed(3)}, ${(1 / sy).toFixed(3)}) rotate(${(-deg).toFixed(1)}deg)`,
        )
        leaning.add(id)
      } else if (leaning.has(id)) {
        el.style.removeProperty('--unlean')
        leaning.delete(id)
      }
      // A drop hangs the way a drop hangs, however the phone is being held: its
      // highlight stays on top and its words stay the right way up. Applied
      // last, so it turns the body's own contents and leaves the lean — which
      // points at another drop on screen — in screen space where it belongs.
      el.style.transform =
        `translate3d(${p.rx - r}px, ${p.ry - r}px, 0) scale(${p.s + squish}, ${p.s - squish})${lean}${level}`
    }
    drawEchoes()
    if (inviteEl.style.display !== 'none') {
      invitePos.x = W / 2 + Math.sin(t * 0.4) * 5
      invitePos.y = H * 0.34 + Math.cos(t * 0.3) * 4
      inviteEl.style.transform = `translate3d(${invitePos.x - 96}px, ${invitePos.y - 96}px, 0)`
    }
    if (camTarget) {
      cam.x += (camTarget.x - cam.x) * 0.14
      cam.y += (camTarget.y - cam.y) * 0.14
      cam.k += (camTarget.k - cam.k) * 0.14
      if (Math.abs(camTarget.k - cam.k) < 0.002 && Math.abs(camTarget.x - cam.x) < 0.6) camTarget = null
      applyCam()
    }
    layoutMoons()
    lineUsed = 0
    if (!openPool) {
      for (const pair of allKinPairs()) {
        if (hasThread(pair.a.t.id, pair.b.t.id)) continue
        const pa = posOf(pair.a.t.id)
        const pb = posOf(pair.b.t.id)
        drawLine('kin', pa.rx, pa.ry, pb.rx, pb.ry)
      }
      for (const th of view.threads) {
        const pa = pos.get(th.a)
        const pb = pos.get(th.b)
        if (pa && pb) drawLine('bond', pa.rx, pa.ry, pb.rx, pb.ry)
      }
    }
    if (openPool) {
      const g = view.byId.get(openPool)
      if (g) {
        const gp = posOf(g.t.id)
        for (const m of g.members) {
          const mp = posOf(m.id)
          drawLine('orbitline', gp.rx, gp.ry, mp.rx, mp.ry)
        }
      }
    }
    for (let i = lineUsed; i < linePool.length; i++) linePool[i].setAttribute('class', 'off')
    raf = requestAnimationFrame(step)
  }

  // ---------- boot ----------
  rebuild()
  paintAll()
  setTimeout(() => fitAll(false), 60)
  setTimeout(() => fitAll(), 900)
  let lastCount = view.tls.length
  let fitSoon: ReturnType<typeof setTimeout> | null = null
  function fitWhenSettled() {
    if (fitSoon) clearTimeout(fitSoon)
    fitSoon = setTimeout(() => fitAll(), 850)
  }
  const unsub = useGraph.subscribe(() => {
    rebuild()
    paintAll()
    // a burst of new thinking should be shown to you, not hidden off-screen
    if (view.tls.length - lastCount >= 3) fitWhenSettled()
    lastCount = view.tls.length
    tidyEl.classList.toggle('show', view.tls.filter((tl) => tl.kind === 'drop').length >= 6 && !S().offline)
  })
  raf = requestAnimationFrame(step)
  const n = view.tls.length
  if (n > 0) say(view.tls.some((tl) => tl.kind === 'drop' && isRipe(tl.t)) ? 'something is saturated' : n >= 8 ? 'a storm is brewing — hold a drop to gather it' : 'welcome back')

  return () => {
    dead = true
    cancelAnimationFrame(raf)
    unsub()
    removeEventListener('resize', onResize)
    removeEventListener('pointerup', onUp)
    removeEventListener('pointercancel', onCancel)
    document.body.classList.remove('sky-held')
    stopMic()
    if (layoutT) clearTimeout(layoutT)
    if (undoT) clearTimeout(undoT)
    if (sayT) clearTimeout(sayT)
    if (holdTimer) clearTimeout(holdTimer)
    inviteEl.remove()
  }
}

// minimal typing for the webkit speech API
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((ev: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}
