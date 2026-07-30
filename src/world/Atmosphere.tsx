// The world behind every surface: grid, fog, light shaft, and the water line.
// One instance mounts in App; pages render above it. Atmosphere drifts toward
// the World Engine's targets slowly — weather, never a switch.
import { useEffect, useMemo, useRef } from 'react'
import { useGraph } from '@/store/graph'
import { computeWorld } from './engine'
import { SURFACE, WATER_DEEP, WATER_DRAW_H, WATER_H, drawWater, invalidateWaterline, seaFloor } from './water'
import { stepUpright, worldTilt } from './upright'
import { tickDaylight } from './daylight'

// The ocean is drawn bigger than the window it shows through: wider on both
// sides and deeper than the bottom edge, so however far it tilts to stay level
// there is still water in every corner.
/**
 * The world's own background, in one place because two things paint it.
 *
 * The fixed layer draws it over the glass. The document canvas draws the same
 * stack, at the same size, so the strip the glass cannot reach carries on from
 * exactly where it stopped. Splitting the two would mean two gradients with
 * their stops in different places meeting at a line, which is the seam this
 * whole exercise is about.
 */
const WORLD_BG =
  'radial-gradient(ellipse 150% 60% at 50% -10%, var(--sky-top, #0e1424) 0%, transparent 62%),' +
  // the hour's glow sits just above the waterline, where a sunset actually is —
  // pushed below it, the whole warmth was under water
  'radial-gradient(ellipse 125% 48% at 50% 97%, var(--sky-horizon, rgba(28,74,116,0.34)), transparent 70%),' +
  // the floor takes the hour too — a fixed blue here was quietly holding the
  // bottom of every screen at midnight all day long
  'linear-gradient(var(--sky-ground, #04060c) 0%, var(--sky-ground, #05070f) 52%, var(--ground-high, #070d18) 100%)'
/**
 * How the world closes at its edges — once, for everything.
 *
 * There were three of these. The Atmosphere had this one; the sky laid a
 * second over it; and every page laid a third of its own, with a bottom glow
 * and a top glow besides. Which meant each view was standing on a slightly
 * different world, and the strip below the glass — which is a continuation of
 * the world — could only ever be right for one of them at a time. Measured at
 * the bottom edge: the sky was 10 away from what the strip paints, the Current
 * 28, Memory 65.
 *
 * Both of the sky's layers are here now and nothing else has its own, so every
 * view closes the same way and the continuation is the same continuation. The
 * pages lose a bottom glow they were painting twice over — the horizon glow in
 * WORLD_BG already warms that edge for everybody.
 */
const WORLD_VIGNETTE =
  'radial-gradient(ellipse at 50% 42%, transparent 58%, rgba(2, 3, 7, 0.42) 100%),' +
  'radial-gradient(ellipse at 50% 42%, transparent 52%, var(--sky-vignette, rgba(2, 3, 6, 0.6)) 100%)'

const OVERDRAW_X = 0.3
const canvasW = () => Math.round(window.innerWidth * (1 + OVERDRAW_X * 2))

/**
 * How far the screen goes on after the viewport stops.
 *
 * On an installed iPhone the layout viewport is *shorter than the screen*, and
 * it is anchored at the top: `innerHeight` comes back as the screen height
 * minus the inset the notch takes, and the shortfall is left over at the
 * bottom. Everything in this app that paints the world is `position: fixed;
 * inset: 0`, so all of it stops there, and the last of the screen falls
 * through to the document canvas — a flat bar under the sky. Memory never
 * showed it only because Memory is long enough to scroll, and a scrolled
 * document does reach down there.
 *
 * This was guessed at first, as `env(safe-area-inset-bottom)` — and it is
 * emphatically not that. Measured off the device, the bar is 59.0pt on a
 * 393×852 phone: the size of the inset at the *top*, which is 25pt more than
 * the home indicator's 34. So it is measured rather than assumed, and the two
 * guards are for what the number would mean anywhere else:
 *
 *   - **portrait only.** `screen.height` is the portrait height on iOS however
 *     the phone is held, so in landscape the difference is meaningless.
 *   - **and never more than a status bar's worth.** This is a correction for a
 *     viewport that falls short of its own screen, not a licence to paint an
 *     arbitrary distance past the bottom of one. In a browser tab the gap is
 *     the toolbars, which is the same order of size and harmless to fill:
 *     whatever we paint there is behind them.
 */
function measureBleed() {
  const gap = Math.round(screen.height - window.innerHeight)
  const portrait = matchMedia('(orientation: portrait)').matches
  const good = portrait && gap > 0 && gap < 160
  const root = document.documentElement
  // Only ever upward. This wrote `0px` on the device — the first call lands
  // before the standalone layout has settled, sees no gap, and latched zero
  // over a CSS default that was already correct. Everything downstream is
  // `calc(-1 * var(--bleed))`, so a stray zero silently turns five different
  // fixes into no-ops and leaves nothing to find. If there is no gap to
  // measure, say nothing and let the stylesheet's env() answer stand.
  if (!good) return
  root.style.setProperty('--bleed', `${gap}px`)
  // The hem is document height, so it is the measurement or it is nothing.
  root.style.setProperty('--hem', `${gap}px`)
}

/**
 * The ocean's own colour where it meets the bottom of the glass — read off the
 * water rather than worked out from it.
 *
 * The canvas can carry the world's gradients because they are gradients, but
 * the ocean is a canvas, and the last thing between the world and the bottom
 * edge is a wash of it. Modelling that wash means re-deriving drawWater's three
 * stops, where the gradient starts, how far below the screen it ends and where
 * on it the bottom edge falls — four numbers to keep in step with a function
 * that is allowed to change. Sampling costs one pixel and cannot drift.
 *
 * The row taken is the one that lands exactly on the bottom edge: the canvas is
 * bottom-anchored at -WATER_DEEP, so screen-bottom is canvas y = WATER_H.
 */
function seaTint(): string {
  const c = document.querySelector('canvas[data-water]') as HTMLCanvasElement | null
  const ctx = c?.getContext('2d')
  if (!c || !ctx || !c.width) return ''
  try {
    const y = Math.min(c.height - 1, Math.round(WATER_H * devicePixelRatio))
    const [r, g, b, a] = ctx.getImageData(Math.round(c.width / 2), y, 1, 1).data
    if (!a) return ''
    const t = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
    return `linear-gradient(${t},${t})`
  } catch {
    // a tainted canvas would throw; the world simply goes without the wash
    return ''
  }
}

/**
 * Painting the part of the screen the glass cannot reach.
 *
 * --bleed tells every fixed layer to carry on past the bottom of the viewport,
 * and on an installed iPhone that turned out not to be enough: the flat bar
 * was still there, which says those layers are clipped to the viewport and
 * only the document canvas ever reaches the strip. So the canvas is given the
 * world too.
 *
 * Not a colour. A colour is what was here before — the ocean at its deepest —
 * and it could never have worked, because "deepest" is the bottom of the water
 * canvas, a hundred and fifty pixels *below* the bottom of the screen. The bar
 * was being painted the colour of water nobody can see, right next to water
 * they can. And no single colour would do anyway: the bottom edge is a
 * gradient under a vignette, and it is a different colour at every hour.
 *
 * So the canvas gets the same background stack the fixed layer has, sized to
 * the same box — the viewport plus the bleed. Identical gradients over
 * identical boxes, one clipped at the bottom edge and one carrying on past it,
 * which makes the strip a continuation rather than a join. The flat colour
 * stays underneath as the last resort, and as the theme colour, which is what
 * the system tints the status bar with.
 */
function paintBeyondTheGlass() {
  const s = tickDaylight()
  const floor = seaFloor(s.ground)
  const root = document.documentElement
  // the measured one, not the CSS estimate: this sizes a real element
  const bleed = parseFloat(getComputedStyle(root).getPropertyValue('--hem')) || 0
  const stack = [WORLD_VIGNETTE, seaTint(), WORLD_BG].filter(Boolean).join(',')
  // The hem carries the world into the strip; see the element itself. Sized to
  // the world's box and bottom-aligned, so its gradients sit where the fixed
  // layers' gradients sit.
  // …as a custom property rather than an inline background, so the stylesheet
  // can put paper there instead while a full-screen page is up. An inline
  // background would beat any rule that tried.
  root.style.setProperty('--hem-bg', stack)
  const hem = document.querySelector('.world-hem > div') as HTMLDivElement | null
  if (hem) hem.style.height = `${Math.round(window.innerHeight + bleed)}px`
  root.style.backgroundImage = stack
  root.style.backgroundSize = `100% ${Math.round(window.innerHeight + bleed)}px`
  root.style.backgroundRepeat = 'no-repeat'
  root.style.backgroundPosition = '0 0'
  root.style.backgroundColor = floor
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', floor)
}

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
    /** whether the ocean has been sampled for the canvas below the glass yet */
    let washed = false
    const canvas = waterRef.current
    const ctx = canvas?.getContext('2d')

    const size = () => {
      // before the early return: the world has to keep going past the bottom of
      // the glass whether or not there is a canvas to draw water on
      measureBleed()
      if (!canvas || !ctx) return
      const W = canvasW()
      canvas.width = W * devicePixelRatio
      canvas.height = WATER_DRAW_H * devicePixelRatio
      canvas.style.width = `${W}px`
      canvas.style.height = `${WATER_DRAW_H}px`
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      invalidateWaterline()
      // How far the water's surface sits above the bottom edge, so anything
      // that wants to float on it can be placed in CSS without guessing.
      //
      // Published relative to the bottom of the *viewport*, because that is
      // what a CSS `bottom` is measured from — while the ocean is anchored to
      // the bottom of the screen, which on an installed phone is --bleed lower.
      // Doing the subtraction once here keeps every consumer of this (the tab
      // bar resting in the surface, the two notices above it) a plain
      // `bottom: calc(var(--water-line-up) ± n)` with nothing to know.
      const root = document.documentElement
      const bleed = parseFloat(getComputedStyle(root).getPropertyValue('--bleed')) || 0
      root.style.setProperty('--water-line-up', `${WATER_H - SURFACE - bleed}px`)
    }
    size()
    // the canvas behind the glass is sized from the viewport, so it is repainted
    // whenever the viewport is not the size it was
    const onResize = () => {
      size()
      paintBeyondTheGlass()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    // iOS settles the standalone layout after the first paint and does not
    // always announce it as a resize, which is how the measurement came out
    // zero and stayed zero. A couple of late looks cost nothing.
    const settle = [120, 600, 1800].map((ms) => setTimeout(onResize, ms))
    window.visualViewport?.addEventListener('resize', onResize)

    // the sky follows the clock — recomputed on a slow timer and whenever the
    // app comes back to the front, so an evening that arrives while it is in
    // your pocket is already there when you look
    paintBeyondTheGlass()
    const clock = setInterval(paintBeyondTheGlass, 120000)
    const wake = () => {
      if (document.visibilityState !== 'visible') return
      paintBeyondTheGlass()
      // coming back to the front is also when the viewport most often turns
      // out to be a different size than when it was put away
      measureBleed()
    }
    document.addEventListener('visibilitychange', wake)

    const frame = () => {
      t += 0.016
      const rate = reduced ? 0.08 : 0.004
      cur.fog += (targetRef.current.fog - cur.fog) * rate
      cur.light += (targetRef.current.light - cur.light) * rate
      if (fogRef.current) fogRef.current.style.opacity = cur.fog.toFixed(3)
      if (shaftRef.current) shaftRef.current.style.opacity = cur.light.toFixed(3)

      // The ocean holds itself level against the phone. It is drawn wider and
      // deeper than the glass it shows through, so tilting can never bring a
      // dry wedge into a corner, and it pivots about the middle of its own
      // surface — the one point that must not move.
      stepUpright(reduced)
      if (canvas) {
        const deg = worldTilt()
        canvas.style.transform = deg ? `rotate(${deg.toFixed(2)}deg)` : ''
        canvas.style.transformOrigin = `50% ${SURFACE}px`
      }

      if (ctx && canvas) drawWater(ctx, canvasW(), t, reduced)
      // The canvas beyond the glass needs the ocean's colour, and the ocean
      // does not have one until it has been drawn once. The first paint runs
      // before this loop, so it comes back for the wash the moment there is
      // water to sample.
      if (!washed && ctx && canvas) {
        washed = true
        paintBeyondTheGlass()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      settle.forEach(clearTimeout)
      clearInterval(clock)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [])

  return (
    <>
    {/* The world's box is the whole screen, not the part of it the page was
        given. Everything inside is positioned against this, so the one change
        puts the ocean — and with it the waterline, and with that the tab bar
        resting in the surface — on the bottom edge of the glass instead of
        59pt up it. The layers used to carry the bleed one by one, which moved
        the gradients down and left the water where it was. */}
    <div
      aria-hidden
      style={{ position: 'fixed', inset: '0 0 calc(-1 * var(--bleed, 0px)) 0', zIndex: 0, pointerEvents: 'none' }}
    >
      {/* depth, not graph paper — night above, the water's glow below */}
      <div
        style={{
          position: 'absolute',
          // the parent is already the whole screen — see the wrapper above
          inset: 0,
          background: WORLD_BG,
          transition: 'background 4s linear',
        }}
      />
      <div
        ref={fogRef}
        style={{
          position: 'absolute',
          // the parent is already the whole screen — see the wrapper above
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
          // the parent is already the whole screen — see the wrapper above
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
          // the ocean runs to the bottom edge of the glass and past it on every
          // side, so it can tilt to stay level without showing where it ends
          left: `${-OVERDRAW_X * 100}%`,
          bottom: -WATER_DEEP,
          willChange: 'transform',
        }}
      />
      <div
        style={{
          position: 'absolute',
          // the parent is already the whole screen — see the wrapper above
          inset: 0,
          background: WORLD_VIGNETTE,
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

const HEM_GRAIN: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0.07,
  backgroundSize: '160px 160px',
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
}

const GRAIN: React.CSSProperties = {
  position: 'fixed',
  inset: '0 0 calc(-1 * var(--bleed)) 0',
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

/**
 * The hem of the world — the last of the screen that nothing fixed can reach.
 *
 * Everything that paints this world is `position: fixed`, and on an installed
 * iPhone fixed means "the layout viewport", which comes back 59pt shorter than
 * the screen. Giving the document canvas the world's gradients did not reach it
 * either: iOS fills that strip from the root's background *colour* and ignores
 * its images, which is why the bar stayed exactly one flat colour through three
 * goes at it — measured off the phone each time, and flat edge to edge each
 * time.
 *
 * The one thing that has always reached down there is document content. That is
 * the entire reason Memory, the only page long enough to scroll, never showed a
 * bar. So this is document content, and it is rendered last in App so it is the
 * last thing in the flow: it adds exactly --bleed to the height of the document
 * and sits at the very end of it, wherever that falls. On a page the height of
 * the glass that is the strip; on a page that scrolls it is below the fold,
 * where the strip is already covered by the page itself.
 *
 * What it holds is the world's own bottom edge — the inner div is the full
 * height of the world's box and bottom-aligned, so its gradients land exactly
 * where the fixed layers put theirs and the strip is the last of one picture
 * rather than the first of another. Clipped to the hem, so none of the rest of
 * it is ever drawn twice.
 */
export function WorldHem() {
  return (
    <div className="world-hem" aria-hidden>
      <div />
      {/* the grain is fixed too, so the hem needs its own copy — without it the
          join is a few levels lighter above the line than below, which is
          exactly the seven per cent of noise that stops at the glass */}
      <div style={HEM_GRAIN} />
    </div>
  )
}
