import { NavLink, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Capture', icon: '✎' },
  { to: '/brain', label: 'Brain', icon: '◉' },
  { to: '/focus', label: 'Focus', icon: '▸' },
  { to: '/settings', label: 'More', icon: '⋯' },
]

export function TabBar() {
  const { pathname } = useLocation()
  // The Brain canvas is fullscreen; keep the bar so users can leave it.
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
        background: 'var(--bg-raised)',
        borderTop: '1px solid var(--line)',
        zIndex: 100,
      }}
    >
      {TABS.map((t) => {
        const active =
          t.to === '/' ? pathname === '/' : pathname.startsWith(t.to) || (t.to === '/settings' && ['/runs', '/import'].some((p) => pathname.startsWith(p)))
        return (
          <NavLink
            key={t.to}
            to={t.to}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              textDecoration: 'none',
              color: active ? 'var(--ink)' : 'var(--ink-faint)',
              fontWeight: active ? 700 : 500,
            }}
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
              {t.icon}
            </span>
            <span style={{ fontSize: 'var(--fs-caption)' }}>{t.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
