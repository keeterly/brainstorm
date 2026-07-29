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
const TABS = [
  { to: '/', label: 'Sky' },
  { to: '/current', label: 'Current' },
  { to: '/memory', label: 'Memory' },
]

const LAYERS = 4
const RIPPLE_MS = 1150

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
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // ---- the echo ----
  // Rings leave the point you touched and travel outward in layers, each on
  // its own clock and its own wobble, so the stack never resolves into one
  // clean pulse. Drawn per frame rather than by CSS: a keyframe cannot make
  // four rings disagree with each other the way water does.
  const ripple = (cx: number, cy: number) => {
    const svg = echoRef.current
    if (!svg || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const seed = (cx * 0.017 + cy * 0.031) % 7
    const paths = Array.from({ length: LAYERS }, (_, i) => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      svg.appendChild(p)
      return { el: p, delay: i * 74 + (i % 2) * 38, life: 720 + i * 128, seed: seed + i * 2.7 }
    })
    const t0 = performance.now()
    cancelAnimationFrame(raf.current)
    const step = () => {
      const now = performance.now() - t0
      let alive = false
      for (const p of paths) {
        const u = (now - p.delay) / p.life
        if (u < 0) {
          alive = true
          continue
        }
        if (u >= 1) {
          p.el.style.opacity = '0'
          continue
        }
        alive = true
        const r = 16 + u * 104
        p.el.setAttribute('d', echoRing(cx, cy, r, p.seed, 0.05 + u * 0.07))
        p.el.style.opacity = (Math.pow(Math.sin(u * Math.PI), 1.3) * 0.5).toFixed(3)
        p.el.style.strokeWidth = (1.2 - u * 0.55).toFixed(2)
      }
      if (alive && now < RIPPLE_MS) raf.current = requestAnimationFrame(step)
      else for (const p of paths) p.el.remove()
    }
    raf.current = requestAnimationFrame(step)
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

function isOn(to: string, pathname: string) {
  if (to === '/') return pathname === '/'
  return (
    pathname.startsWith(to) ||
    (to === '/memory' && ['/runs', '/import', '/settings'].some((p) => pathname.startsWith(p)))
  )
}

// hand-blown, not moulded: the capsule and the lens are each a little off true
const CAPSULE = wabiPill('tabs-capsule', 30, 5)
const LENS = wabiPill('tabs-lens', 23, 5)
