import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { echoRing, wabiPill } from '@/world/echo'
import { haptics } from '@/lib/haptics'
import './tabbar.css'

// One piece of glass resting on the water, with a lens inside it that slides to
// whichever name you are in. The material is Apple's: heavy blur of what is
// behind, a bright specular top edge, a dimmer bounce along the bottom, and a
// rim that refracts rather than outlines. What is ours is the imperfection —
// neither the capsule nor the lens is a true rounded rectangle — and the
// answer to a touch, which is the same Joy Division echo a live drop sends
// out: irregular rings, several at once, none of them in step.
/*
 * Two, not three.
 *
 * There used to be a Current between these — a screen that picked one action
 * out of every group you had and said "this first". It was a second place to
 * do work, and the work was already being done the other way: you open a
 * group and tick things off. Two surfaces for one act is the kind of thing
 * that makes an app feel confusing without any single part of it being wrong.
 *
 * What it did that was worth keeping — knowing which step comes next — was
 * never really its own: `domain/next-action.ts` works it out without asking
 * anybody, and the sky has shown it at the foot of the glass all along.
 */
/*
 * Still two, and now they are the two the app is actually about.
 *
 * Memory was never a third place to work — it is what the water kept, which you
 * go and read on purpose, once. Standing it beside the sky as an equal implied
 * a choice between them that nobody makes. It is an icon in the sky's own
 * corner now, next to Find, which is where you are when you want it.
 *
 * What is here instead is the half that was missing: where ideas live, and how
 * they get done.
 */
const TABS = [
  { to: '/', label: 'Ideas' },
  { to: '/roadmap', label: 'Roadmap' },
]

const LAYERS = 4

interface Ring {
  el: SVGPathElement
  cx: number
  cy: number
  seed: number
  /** when this layer starts — staggered, so the stack never travels together */
  born: number
  life: number
}

export function TabBar() {
  const { pathname } = useLocation()
  const glassRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLSpanElement>(null)
  const echoRef = useRef<SVGSVGElement>(null)
  const raf = useRef(0)

  const activeIndex = TABS.findIndex((t) => isOn(t.to, pathname))

  // the lens slides to the name you are in, and resizes to fit it
  const placeLens = useCallback(() => {
    const glass = glassRef.current
    const lens = lensRef.current
    if (!glass || !lens) return
    const el = glass.querySelectorAll<HTMLElement>('.tab')[Math.max(0, activeIndex)]
    if (!el) return
    lens.style.width = `${el.offsetWidth}px`
    lens.style.transform = `translateX(${el.offsetLeft}px)`
  }, [activeIndex])

  useLayoutEffect(placeLens, [placeLens])
  useEffect(() => {
    addEventListener('resize', placeLens)
    return () => removeEventListener('resize', placeLens)
  }, [placeLens])
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      for (const g of rings.current) g.el.remove()
      rings.current = []
    },
    [],
  )

  // ---- the echo ----
  // Rings leave the point you touched and travel outward in layers, each on
  // its own clock and its own wobble, so the stack never resolves into one
  // clean pulse. Drawn per frame rather than by CSS: a keyframe cannot make
  // four rings disagree with each other the way water does.
  //
  // One loop owns every ring that is currently alive, and a ring is only ever
  // removed by the loop that is drawing it. Giving each tap its own loop and
  // cancelling the previous one stranded that tap's rings in the DOM at
  // whatever opacity they had reached — tap a few times and the water filled
  // up with scribble that never cleared.
  const rings = useRef<Ring[]>([])
  const pump = useCallback(() => {
    const now = performance.now()
    for (let i = rings.current.length - 1; i >= 0; i--) {
      const g = rings.current[i]
      const u = (now - g.born) / g.life
      if (u >= 1) {
        g.el.remove()
        rings.current.splice(i, 1)
        continue
      }
      if (u < 0) continue
      const r = 14 + u * 82
      g.el.setAttribute('d', echoRing(g.cx, g.cy, r, g.seed, 0.05 + u * 0.06))
      g.el.style.opacity = (Math.pow(Math.sin(u * Math.PI), 1.3) * 0.42).toFixed(3)
      g.el.style.strokeWidth = (1.1 - u * 0.5).toFixed(2)
    }
    raf.current = rings.current.length ? requestAnimationFrame(pump) : 0
  }, [])

  const ripple = (cx: number, cy: number) => {
    const svg = echoRef.current
    if (!svg || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // an impatient tap replaces the last echo rather than piling onto it
    if (rings.current.length > LAYERS) {
      for (const g of rings.current.splice(0, rings.current.length - LAYERS)) g.el.remove()
    }
    const now = performance.now()
    const seed = (cx * 0.017 + cy * 0.031) % 7
    for (let i = 0; i < LAYERS; i++) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      svg.appendChild(el)
      rings.current.push({
        el,
        cx,
        cy,
        seed: seed + i * 2.7,
        born: now + i * 74 + (i % 2) * 38,
        life: 700 + i * 120,
      })
    }
    if (!raf.current) raf.current = requestAnimationFrame(pump)
  }

  const press = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const svg = echoRef.current
    const el = e.currentTarget
    if (svg) {
      const box = svg.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      ripple(r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top)
    }
    haptics.arrive()
    el.classList.remove('dip')
    // reflow, so tapping the same name twice rings twice
    void el.offsetWidth
    el.classList.add('dip')
    // Tapping the name of the place you are already in means "take me back to
    // all of it" — every platform tab bar works this way, and a playtester
    // stuck inside a focused pool reached for exactly this and got nothing.
    // The sky listens; other tabs have no inner depth to pop.
    if (el.getAttribute('href') === pathname) dispatchEvent(new CustomEvent('tab-again', { detail: pathname }))
  }

  return (
    <nav aria-label="Primary" className="tabs">
      {/* the echo sits behind the glass, so the rings are seen through it */}
      <svg className="tabs-echo" ref={echoRef} aria-hidden="true" />
      <div className="tabs-glass" ref={glassRef} style={{ borderRadius: CAPSULE }}>
        <span className="tabs-lens" ref={lensRef} style={{ borderRadius: LENS }} aria-hidden="true" />
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            onClick={press}
            className={`tab${isOn(t.to, pathname) ? ' on' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/*
 * Memory and the three screens behind it light no tab, deliberately.
 *
 * They used to keep Memory lit, which was right while it was a tab. It is not
 * one now, and lighting `Ideas` while you are reading what the water kept would
 * be the bar pointing at a room you are not in. Nothing lit is the honest
 * answer: you are somewhere off to the side, and both ways back are one tap.
 */
function isOn(to: string, pathname: string) {
  if (to === '/') return pathname === '/'
  return pathname.startsWith(to)
}

// hand-blown, not moulded: the capsule and the lens are each a little off true
const CAPSULE = wabiPill('tabs-capsule', 30, 5)
const LENS = wabiPill('tabs-lens', 23, 5)
