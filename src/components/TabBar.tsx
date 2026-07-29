import { NavLink, useLocation } from 'react-router-dom'

// Three words, no icons, no bar. Arbitrary glyphs (◉ ▸ ◍) named nothing, and a
// solid bar cut the sky off at the ankles — so the world now runs to the bottom
// edge and the names float over it under a soft scrim.
const TABS = [
  { to: '/', label: 'Sky' },
  { to: '/current', label: 'Current' },
  { to: '/memory', label: 'Memory' },
]

export function TabBar() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: 'calc(var(--tabbar-h) + var(--sab))',
        paddingBottom: 'var(--sab)',
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(rgba(4, 6, 12, 0) 0%, rgba(4, 6, 12, 0.72) 55%, rgba(4, 6, 12, 0.92) 100%)',
        zIndex: 100,
      }}
    >
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
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              textDecoration: 'none',
              fontSize: 'var(--fs-label)',
              letterSpacing: '0.01em',
              color: active ? 'var(--ink)' : 'var(--ink-faint)',
              fontWeight: active ? 600 : 400,
              transition: 'color 260ms ease',
            }}
          >
            {t.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
