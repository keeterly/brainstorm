import { NavLink, useLocation } from 'react-router-dom'

// The sky is home — capture and thinking live inside it, not behind a form.
const TABS = [
  { to: '/', label: 'Sky', icon: '◉' },
  { to: '/current', label: 'Current', icon: '▸' },
  { to: '/memory', label: 'Memory', icon: '◍' },
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
        background: 'rgba(10, 13, 22, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '0.5px solid rgba(180, 215, 255, 0.12)',
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
