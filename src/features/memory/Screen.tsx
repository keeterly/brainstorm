// What this phone is actually giving us.
//
// The bottom strip has been fixed four times and reported broken four times,
// and every one of those goes was reasoning about a device nobody could
// measure: an installed iPhone hands the page a layout viewport that is
// shorter than its own screen, and *which* edge it is short by, and by how
// much, is the entire question. Guessing it produced a fix for a 34pt gap when
// the gap was 59, and a fix anchored at the bottom when the shortfall was at
// the top.
//
// So the app says. Six numbers, on the device, in the app, in two taps —
// after which this is arithmetic rather than a hypothesis.
//
// It lives folded shut under Data, because it is a diagnostic and not a
// feature, and it costs nothing to leave in: the day the phone changes, or
// iOS changes what it reports, this is what says so.
import { useEffect, useState } from 'react'

interface Reading {
  screen: string
  viewport: string
  short: string
  bleed: string
  hem: string
  insets: string
  mode: string
  dpr: string
}

function read(): Reading {
  const cs = getComputedStyle(document.documentElement)
  const px = (v: string) => (v.trim() ? v.trim() : '0px')
  const gapY = Math.round(screen.height - window.innerHeight)
  const gapX = Math.round(screen.width - window.innerWidth)
  // How the app was launched. `standalone` is the legacy iOS flag and the only
  // one iOS has ever set reliably; display-mode is the standard.
  const nav = navigator as Navigator & { standalone?: boolean }
  const mode =
    [
      nav.standalone ? 'ios-standalone' : '',
      matchMedia('(display-mode: standalone)').matches ? 'standalone' : '',
      matchMedia('(display-mode: fullscreen)').matches ? 'fullscreen' : '',
      matchMedia('(display-mode: browser)').matches ? 'browser' : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'unknown'
  return {
    screen: `${screen.width} × ${screen.height}`,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    short: `${gapX} wide · ${gapY} tall`,
    bleed: px(cs.getPropertyValue('--bleed')),
    hem: px(cs.getPropertyValue('--hem')),
    insets: `top ${px(cs.getPropertyValue('--sat'))} · bottom ${px(cs.getPropertyValue('--sab'))}`,
    mode,
    dpr: String(devicePixelRatio),
  }
}

const LABELS: [keyof Reading, string][] = [
  ['screen', 'Screen'],
  ['viewport', 'Viewport'],
  ['short', 'Falls short by'],
  ['bleed', 'Over-draw (--bleed)'],
  ['hem', 'Extra height (--hem)'],
  ['insets', 'Safe area'],
  ['mode', 'Launched as'],
  ['dpr', 'Pixel ratio'],
]

export function Screen() {
  const [r, setR] = useState<Reading | null>(null)

  useEffect(() => {
    // One frame in, so --bleed has been measured and set. And again on resize,
    // because rotating the phone is exactly when these stop agreeing.
    const take = () => setR(read())
    const t = setTimeout(take, 60)
    window.addEventListener('resize', take)
    window.addEventListener('orientationchange', take)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', take)
      window.removeEventListener('orientationchange', take)
    }
  }, [])

  return (
    <details style={{ marginTop: 10 }}>
      <summary className="muted" style={{ fontSize: 'var(--fs-label)', cursor: 'pointer', minHeight: 34 }}>
        What this screen is giving us
      </summary>
      <p className="faint" style={{ fontSize: 'var(--fs-caption)', margin: '8px 0 10px' }}>
        Installed on a phone, the page is often given less room than the screen has. This is what it was given.
      </p>
      <div style={{ display: 'grid', gap: 2 }}>
        {r &&
          LABELS.map(([k, label], i) => (
            <div
              key={k}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
                padding: '6px 0',
                borderTop: i ? '0.5px solid var(--line)' : 'none',
              }}
            >
              <span className="muted" style={{ fontSize: 'var(--fs-label)' }}>
                {label}
              </span>
              <span className="mono" style={{ fontSize: 'var(--fs-caption)', textAlign: 'right' }}>
                {r[k]}
              </span>
            </div>
          ))}
      </div>
    </details>
  )
}
