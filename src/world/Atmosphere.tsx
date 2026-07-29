// The world behind every surface: grid, fog, light shaft, and the water line.
// One instance mounts in App; pages render above it. Atmosphere drifts toward
// the World Engine's targets slowly — weather, never a switch.
import { useEffect, useMemo, useRef } from 'react'
import { useGraph } from '@/store/graph'
import { computeWorld } from './engine'
import { SURFACE, WATER_H, drawWater, invalidateWaterline } from './water'
import { tickDaylight } from './daylight'

export function Atmosphere() {
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const target = useMemo(() => computeWorld({ thoughts, relationships }), [thoughts, relationships])
  const targetRef = useRef(target)
  targetRef.current = target

  const fogRef = useRef<HTMLDivElement>(null)
  const shaftRef = useRef<HTMLDivElement>(null)
  const waterRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const cur = { fog: targetRef.current.fog, light: targetRef.current.light }
    let raf = 0
    let t = 0
    const canvas = waterRef.current
    const ctx = canvas?.getContext('2d')

    const size = () => {
      if (!canvas || !ctx) return
      const W = window.innerWidth
      canvas.width = W * devicePixelRatio
      canvas.height = WATER_H * devicePixelRatio
      canvas.style.width = `${W}px`
      canvas.style.height = `${WATER_H}px`
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      invalidateWaterline()
      // how far the water's surface sits above the bottom edge, so anything
      // that wants to float on it can be placed in CSS without guessing
      document.documentElement.style.setProperty('--water-line-up', `${WATER_H - SURFACE}px`)
    }
    size()
    window.addEventListener('resize', size)

    // the sky follows the clock — recomputed on a slow timer and whenever the
    // app comes back to the front, so an evening that arrives while it is in
    // your pocket is already there when you look
    tickDaylight()
    const clock = setInterval(() => tickDaylight(), 120000)
    const wake = () => {
      if (document.visibilityState === 'visible') tickDaylight()
    }
    document.addEventListener('visibilitychange', wake)

    const frame = () => {
      t += 0.016
      const rate = reduced ? 0.08 : 0.004
      cur.fog += (targetRef.current.fog - cur.fog) * rate
      cur.light += (targetRef.current.light - cur.light) * rate
      if (fogRef.current) fogRef.current.style.opacity = cur.fog.toFixed(3)
      if (shaftRef.current) shaftRef.current.style.opacity = cur.light.toFixed(3)

      if (ctx && canvas) drawWater(ctx, window.innerWidth, t, reduced)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', size)
      clearInterval(clock)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [])

  return (
    <>
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {/* depth, not graph paper — night above, the water's glow below */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 150% 60% at 50% -10%, var(--sky-top, #0e1424) 0%, transparent 62%),' +
            // the hour's glow sits just above the waterline, where a sunset
            // actually is — pushed below it, the whole warmth was under water
            'radial-gradient(ellipse 125% 48% at 50% 97%, var(--sky-horizon, rgba(28,74,116,0.34)), transparent 70%),' +
            // the floor takes the hour too — a fixed blue here was quietly
            // holding the bottom of every screen at midnight all day long
            'linear-gradient(var(--sky-ground, #04060c) 0%, var(--sky-ground, #05070f) 52%, var(--ground-high, #070d18) 100%)',
          transition: 'background 4s linear',
        }}
      />
      <div
        ref={fogRef}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.4,
          // haze is lit by whatever light there is, so it carries the hour
          background:
            'radial-gradient(ellipse 95% 45% at 50% 6%, rgba(var(--accent-rgb), 0.11), transparent 70%),' +
            'linear-gradient(rgba(var(--accent-rgb), 0.06), transparent 48%)',
          transition: 'background 4s linear',
        }}
      />
      <div
        ref={shaftRef}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.1,
          // the shaft is the hour's own light: cool and white overhead at
          // midday, low and orange at sunset
          background:
            'radial-gradient(ellipse 65% 55% at 50% 0%, rgba(var(--accent-rgb), 0.2), transparent 65%),' +
            'radial-gradient(ellipse 28% 75% at 63% 0%, rgba(255, 244, 220, 0.1), transparent 70%)',
          transition: 'background 4s linear',
        }}
      />
      <canvas
        ref={waterRef}
        data-water
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          // the ocean runs to the bottom edge of the glass; the tabs float on it
          bottom: 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 42%, transparent 52%, var(--sky-vignette, rgba(2, 3, 6, 0.6)) 100%)',
          transition: 'background 4s linear',
        }}
      />
    </div>
    {/* film grain over the whole world — the one thing that sits above
        everything, so nothing in the app renders perfectly clean */}
    <div aria-hidden style={GRAIN} />
    </>
  )
}

const GRAIN: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  pointerEvents: 'none',
  // plain alpha rather than a blend mode: it reads stronger on the dark world
  // and costs nothing, where mix-blend-mode would force the whole animating
  // scene into one composited layer
  opacity: 0.07,
  backgroundSize: '160px 160px',
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
}

/** Motion-language helpers shared by surfaces. */
export function splashAt(x: number, y: number) {
  for (const s of [26, 48]) {
    const r = document.createElement('div')
    r.className = 'ripple'
    r.style.width = r.style.height = `${s}px`
    r.style.left = `${x - s / 2}px`
    r.style.top = `${y - s / 4}px`
    r.style.transform = 'scaleY(0.32)'
    document.body.appendChild(r)
    setTimeout(() => r.remove(), 950)
  }
}

export function evaporateAt(x?: number) {
  const v = document.createElement('div')
  v.className = 'vapor'
  const s = 10 + Math.random() * 8
  v.style.width = v.style.height = `${s}px`
  v.style.left = `${x ?? window.innerWidth * (0.2 + Math.random() * 0.6)}px`
  v.style.top = `${window.innerHeight - 160}px`
  document.body.appendChild(v)
  setTimeout(() => v.remove(), 2700)
}
