import { useEffect, type ReactNode } from 'react'

// Bottom sheet — the AI Action Panel and pickers live in these.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // Down to the bottom of the screen: the scrim has to dim all of it, and
      // the panel rides on this box's bottom edge, so one change puts both
      // where they belong on an installed phone. See --bleed.
      style={{ position: 'fixed', inset: '0 0 calc(-1 * var(--bleed, 0px)) 0', zIndex: 200 }}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,18,0.4)', cursor: 'default' }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '85dvh',
          overflowY: 'auto',
          background: 'var(--bg-raised)',
          borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
          boxShadow: 'var(--shadow-sheet)',
          padding: `var(--sp-4) var(--sp-4) calc(var(--sab) + var(--sp-5))`,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'var(--line-mid)',
            margin: '0 auto 12px',
          }}
        />
        {title && (
          <h3 style={{ fontSize: 'var(--fs-md)', marginBottom: 12 }}>{title}</h3>
        )}
        {children}
      </div>
    </div>
  )
}
