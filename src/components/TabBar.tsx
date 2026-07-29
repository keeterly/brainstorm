import { useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { splashAt } from '@/world/Atmosphere'
import { haptics } from '@/lib/haptics'
import './tabbar.css'

// Three drops resting on the ocean, not a bar. A solid scrim across the bottom
// cut the world off at the ankles and stayed the same near-black at every hour,
// which read as a dark strip pasted under a bright sky. The names now live in
// the same glass everything else in this app is made of, floating on the water
// line — and tapping one dips it under and rings the surface.
const TABS = [
  { to: '/', label: 'Sky' },
  { to: '/current', label: 'Current' },
  { to: '/memory', label: 'Memory' },
]

export function TabBar() {
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)

  const dip = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    // the ring spreads from where the drop meets the water, not from its middle
    const line = window.innerHeight - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--water-line-up') || '86')
    splashAt(r.left + r.width / 2, Math.max(r.top + r.height * 0.5, line))
    haptics.arrive()
    el.classList.remove('dip')
    // reflow, so a second tap on the same drop plays the dip again
    void el.offsetWidth
    el.classList.add('dip')
  }

  return (
    <nav aria-label="Primary" className="tabs" ref={navRef}>
      {TABS.map((t) => {
        const active =
          t.to === '/'
            ? pathname === '/'
            : pathname.startsWith(t.to) ||
              (t.to === '/memory' && ['/runs', '/import', '/settings'].some((p) => pathname.startsWith(p)))
        return (
          <NavLink
            key={t.to}
            to={t.to}
            onClick={dip}
            className={`tab${active ? ' on' : ''}`}
            style={{ ['--tab-blob' as string]: BLOBS[t.to] }}
          >
            <span>{t.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

// the same quiet asymmetry the drops in the sky have — no two are true circles
const BLOBS: Record<string, string> = {
  '/': '49.1% 50.9% 52.4% 47.6% / 47.9% 52.8% 47.2% 52.1%',
  '/current': '52.2% 47.8% 48.3% 51.7% / 51.4% 48.1% 51.9% 48.6%',
  '/memory': '47.7% 52.3% 51.1% 48.9% / 52.6% 47.4% 48.8% 51.2%',
}
