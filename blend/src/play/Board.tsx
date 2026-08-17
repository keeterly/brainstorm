// The sky itself: what you see, and the only thing you touch.
//
// It holds no rules. Every gesture it understands ends in one of three moves
// being offered upward, and the board draws whatever comes back — so a move
// the rules refuse cannot happen here by accident, and the picture can never
// disagree with the game.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as Poke,
} from 'react'
import { clearance, disc, oilPath, pull } from '@/world/shape'
import { echoRing } from '@/world/echo'
import { rippleAt, TOUCH, WAKE } from '@/world/ripple'
import { primaries, tint } from '@/game/color'
import { dropOf, hue, refuse, type Level, type Move, type State } from '@/game/rules'
import { dropR, layout, step, type Node, type Scene } from './field'

const seedOf = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (Math.abs(h) % 10000) / 10000
}

/** How many joins can be drawn at once. More than a sky ever has at rest. */
const NECKS = 16

export interface BoardProps {
  level: Level
  state: State
  won: boolean
  hint: Move | null
  onMove: (m: Move) => void
  onSay: (words: string | null) => void
}

export function Board({ level, state, won, hint, onMove, onSay }: BoardProps) {
  const stage = useRef<HTMLDivElement>(null)
  const nodes = useRef<Node[]>([])
  const els = useRef(new Map<string, HTMLElement>())
  const necks = useRef<SVGPathElement[]>([])
  const coreEl = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const point = useRef<{ x: number; y: number } | null>(null)
  const said = useRef<string | null>(null)
  const board = useRef({ state, level })
  board.current = { state, level }

  const size = useSize()
  const scene = useMemo(() => layout(state, level, size.w, size.h), [state, level, size])
  const sceneRef = useRef<Scene>(scene)
  sceneRef.current = scene

  // Drops keep their place across a move: a merge changes what a drop *is*,
  // never where it was standing. Only genuinely new drops are placed, and they
  // arrive at nothing and swell, the way one condenses.
  useEffect(() => {
    const had = new Map(nodes.current.map((n) => [n.id, n]))
    nodes.current = state.drops.map((d) => {
      const n = had.get(d.id)
      const want = dropR(d.mass) * scene.scale
      if (n) return Object.assign(n, { want, where: d.where })
      const home = scene.homes[d.id] ?? { x: scene.core.x, y: scene.core.y }
      return {
        id: d.id,
        x: home.x,
        y: home.y,
        vx: 0,
        vy: 0,
        r: 1,
        want,
        seed: seedOf(d.id),
        where: d.where,
        born: 0,
      }
    })
  }, [state, scene])

  /* ── one frame ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(48, now - last)
      last = now
      step(nodes.current, sceneRef.current, now, dt, {
        dragging: drag.current?.id ?? null,
        pointer: point.current,
        calm: false,
        reduced,
      })
      paint()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const paint = () => {
    const s = sceneRef.current
    for (const n of nodes.current) {
      const el = els.current.get(n.id)
      if (!el) continue
      el.style.width = el.style.height = `${n.r * 2}px`
      el.style.transform = `translate3d(${n.x - n.r}px, ${n.y - n.r}px, 0)`
    }
    if (coreEl.current) {
      const R = s.core.R
      coreEl.current.style.width = coreEl.current.style.height = `${R * 2}px`
      coreEl.current.style.transform = `translate3d(${s.core.x - R}px, ${s.core.y - R}px, 0)`
    }
    drawNecks()
    aim()
  }

  /** The waists drops draw between them as they come into each other's reach. */
  const drawNecks = () => {
    let k = 0
    const held = drag.current?.id ?? null
    const list = nodes.current
    for (let i = 0; i < list.length && k < NECKS; i++) {
      for (let j = i + 1; j < list.length && k < NECKS; j++) {
        const a = list[i]
        const b = list[j]
        if (a.where !== b.where && held !== a.id && held !== b.id) continue
        const ba = disc(a.x, a.y, a.r, a.seed)
        const bb = disc(b.x, b.y, b.r, b.seed)
        const amount = pull(ba, bb)
        if (amount <= 0.02) continue
        const path = oilPath(ba, bb, amount)
        if (!path) continue
        const el = necks.current[k++]
        if (!el) continue
        el.setAttribute('d', path.fill)
        el.style.opacity = String(0.16 + amount * 0.5)
      }
    }
    for (; k < NECKS; k++) necks.current[k]?.setAttribute('d', '')
  }

  /** What the drop in hand is currently pointed at, and whether it may go there. */
  const target = useCallback((): { move: Move | null; over: string | null; why: string | null } => {
    const held = drag.current?.id
    const s = sceneRef.current
    const { state: now, level: lv } = board.current
    if (!held) return { move: null, over: null, why: null }
    const me = nodes.current.find((n) => n.id === held)
    const mine = dropOf(now, held)
    if (!me || !mine) return { move: null, over: null, why: null }

    // The skin is asked first, and for a reason: a held drop that has been
    // pulled clear of its wall is trying to *leave*, whatever else it happens
    // to be over on the way. Asking the core first meant a drop dragged out
    // and onto the core was told it was still behind a skin — true, useless,
    // and not the thing the hand just did.
    if (mine.where) {
      const ring = s.rings.find((r) => r.id === mine.where)
      // judged by where the drop's middle has got to: half out is still in,
      // and all the way out is a decision
      if (ring && Math.hypot(me.x - ring.x, me.y - ring.y) > ring.R) {
        const move: Move = { kind: 'pass', id: held }
        return { move, over: ring.id, why: refuse(now, lv, move) }
      }
    }

    let best: { id: string; gap: number } | null = null
    for (const n of nodes.current) {
      if (n.id === held) continue
      const gap = clearance(disc(me.x, me.y, me.r, me.seed), disc(n.x, n.y, n.r, n.seed))
      if (gap < 2 && (!best || gap < best.gap)) best = { id: n.id, gap }
    }
    if (best) {
      const move: Move = { kind: 'merge', from: held, into: best.id }
      return { move, over: best.id, why: refuse(now, lv, move) }
    }
    const toCore = Math.hypot(me.x - s.core.x, me.y - s.core.y) - s.core.R - me.r
    if (toCore < 6) {
      const move: Move = { kind: 'join', id: held }
      return { move, over: 'core', why: refuse(now, lv, move) }
    }
    if (!mine.where) {
      const into = s.rings.find(
        (r) => !r.parent && Math.hypot(me.x - r.x, me.y - r.y) < r.R - me.r * 0.4,
      )
      if (into) return { move: null, over: into.id, why: 'nothing gets in through a skin' }
    }
    return { move: null, over: null, why: null }
  }, [])

  /** Live feedback while a drop is in hand — the ring it would land on, lit or refused. */
  const aim = () => {
    const { over, why, move } = target()
    for (const [id, el] of els.current) {
      const lit = over === id && !!move
      el.classList.toggle('aim', lit && !why)
      el.classList.toggle('deny', lit && !!why)
      el.classList.toggle('held', drag.current?.id === id)
    }
    coreEl.current?.classList.toggle('aim', over === 'core' && !why)
    coreEl.current?.classList.toggle('deny', over === 'core' && !!why)
    for (const el of stage.current?.querySelectorAll('.skin') ?? []) {
      el.classList.toggle('lit', over === el.getAttribute('data-id') && !why)
      el.classList.toggle('deny', over === el.getAttribute('data-id') && !!why)
    }
    const words = drag.current ? why : null
    if (words !== said.current) {
      said.current = words
      onSay(words)
    }
  }

  /* ── the hand ───────────────────────────────────────────────────────────── */

  const grab = (id: string) => (e: Poke) => {
    if (won) return
    const n = nodes.current.find((x) => x.id === id)
    if (!n) return
    const box = stage.current!.getBoundingClientRect()
    const px = e.clientX - box.left
    const py = e.clientY - box.top
    drag.current = { id, dx: n.x - px, dy: n.y - py }
    point.current = { x: n.x, y: n.y }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    rippleAt(e.clientX, e.clientY, TOUCH)
    buzz(6)
  }

  const move = (e: Poke) => {
    if (!drag.current) return
    const box = stage.current!.getBoundingClientRect()
    point.current = {
      x: e.clientX - box.left + drag.current.dx,
      y: e.clientY - box.top + drag.current.dy,
    }
  }

  const release = (e: Poke) => {
    if (!drag.current) return
    const { move: m, why } = target()
    const held = drag.current.id
    drag.current = null
    point.current = null
    if (said.current !== null) {
      said.current = null
      onSay(null)
    }
    if (m && !why) {
      const n = nodes.current.find((x) => x.id === held)
      const box = stage.current!.getBoundingClientRect()
      if (n) {
        if (m.kind === 'join') rippleAt(box.left + scene.core.x, box.top + scene.core.y, WAKE)
        else rippleAt(box.left + n.x, box.top + n.y, TOUCH)
      }
      buzz(m.kind === 'join' ? 18 : 10)
      onMove(m)
    } else if (why) {
      buzz([4, 26, 4])
      onSay(why)
      window.setTimeout(() => onSay(null), 1700)
    }
    void e
  }

  /* ── the fixed furniture ────────────────────────────────────────────────── */

  const skins = useMemo(
    () =>
      scene.rings.map((r) => ({
        ...r,
        d: echoRing(r.x, r.y, r.R, r.seed, 0.028),
        inner: echoRing(r.x, r.y, r.R - 5, r.seed, 0.028),
      })),
    [scene],
  )

  const hinted = useMemo(() => {
    if (!hint) return new Set<string>()
    if (hint.kind === 'merge') return new Set([hint.from, hint.into])
    return new Set([hint.id])
  }, [hint])

  return (
    <div
      className="stage"
      ref={stage}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <svg className="ink" width={size.w} height={size.h} aria-hidden>
        {skins.map((r) => (
          <g key={r.id} className="skin" data-id={r.id}>
            <path className="wall" d={r.d} />
            <path className="sheen" d={r.inner} />
            {/* the pore, drawn as a gate set into the wall itself rather than
                as a caption floating near it — a skin nested inside another
                wears its gate on top, where there is sky to put it */}
            <g className="gate" transform={`translate(${r.x}, ${r.y + (r.parent ? -r.R : r.R)})`}>
              <rect x={-37} y={-9.5} width={74} height={19} rx={9.5} />
              <text y={0.5}>passes ≤ {r.pore}</text>
            </g>
          </g>
        ))}
        {Array.from({ length: NECKS }, (_, i) => (
          <path
            className="neck"
            key={i}
            ref={(el) => {
              if (el) necks.current[i] = el
            }}
          />
        ))}
      </svg>

      <div
        ref={coreEl}
        className={`bub core${won ? ' full' : ''}${hint?.kind === 'join' ? ' hinted' : ''}`}
        style={{ '--tint': tint(hue(level.target)) } as CSSProperties}
      >
        <span className="mass">{state.core || ''}</span>
        {/* what every arrival has to have in it, spelled out — an ink core
            asks for three things and says so, rather than being a colour you
            are left to reverse-engineer */}
        <span className="pips">
          {primaries(hue(level.target)).map((p) => (
            <i key={p} style={{ '--pip': tint(p) } as CSSProperties} />
          ))}
        </span>
      </div>

      {state.drops.map((d) => (
        <div
          key={d.id}
          data-id={d.id}
          className={`bub drop${hinted.has(d.id) ? ' hinted' : ''}`}
          style={{ '--tint': tint(d.color) } as CSSProperties}
          ref={(el) => {
            if (el) els.current.set(d.id, el)
            else els.current.delete(d.id)
          }}
          onPointerDown={grab(d.id)}
        >
          <span className="mass">{round(d.mass)}</span>
        </div>
      ))}
    </div>
  )
}

const round = (m: number) => (Math.abs(m - Math.round(m)) < 0.01 ? String(Math.round(m)) : m.toFixed(1))

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* a phone that will not buzz is not an error */
  }
}

function useSize() {
  const [size, set] = useState({
    w: typeof window === 'undefined' ? 390 : window.innerWidth,
    h: typeof window === 'undefined' ? 780 : window.innerHeight,
  })
  useEffect(() => {
    const on = () => set({ w: window.innerWidth, h: window.innerHeight })
    on()
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [set])
  return size
}

