// The world behind every surface: grid, fog, light shaft, and the water line.
// One instance mounts in App; pages render above it. Atmosphere drifts toward
// the World Engine's targets slowly — weather, never a switch.
import { useEffect, useMemo, useRef } from 'react'
import { useGraph } from '@/store/graph'
import { computeWorld } from './engine'
import { WATER_H, drawWater, invalidateWaterline } from './water'

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
    }
    size()
    window.addEventListener('resize', size)

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
    }
  }, [])

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {/* depth, not graph paper — night above, the water's glow below */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 150% 60% at 50% -10%, #0e1424 0%, transparent 62%),' +
            'radial-gradient(ellipse 110% 42% at 50% 108%, rgba(28, 74, 116, 0.34), transparent 66%),' +
            'linear-gradient(#04060c 0%, #05070f 52%, #070d18 100%)',
        }}
      />
      <div
        ref={fogRef}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.4,
          background:
            'radial-gradient(ellipse 95% 45% at 50% 6%, rgba(150, 170, 200, 0.13), transparent 70%), linear-gradient(rgba(140, 160, 190, 0.07), transparent 48%)',
        }}
      />
      <div
        ref={shaftRef}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.1,
          background:
            'radial-gradient(ellipse 65% 55% at 50% 0%, rgba(255, 236, 200, 0.16), transparent 65%), radial-gradient(ellipse 28% 75% at 63% 0%, rgba(255, 244, 220, 0.12), transparent 70%)',
        }}
      />
      <canvas
        ref={waterRef}
        data-water
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 'calc(var(--tabbar-h) + var(--sab))',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 42%, transparent 52%, rgba(2, 3, 6, 0.6) 100%)',
        }}
      />
    </div>
  )
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
