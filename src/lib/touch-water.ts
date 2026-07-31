// Pressing anything in this app should look like pressing something made of
// water. One delegated listener gives every button the same answer — the body
// dips under and comes back up, and a ring spreads from where it was pushed —
// so no component has to remember to do it and nothing can drift out of step.
import { haptics } from '@/lib/haptics'
import { rippleAt, TOUCH } from '@/world/ripple'

const SELECTOR = '.btn, .chip'

export function installWaterTouch() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const onDown = (e: PointerEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.(SELECTOR) as HTMLElement | null
    if (!el || el.hasAttribute('disabled')) return
    haptics.grab()
    if (reduced) return
    rippleAt(e.clientX, e.clientY, TOUCH)
    el.classList.remove('dip')
    // reflow, so pressing the same button twice plays the dip twice
    void el.offsetWidth
    el.classList.add('dip')
  }
  document.addEventListener('pointerdown', onDown, { passive: true })
  return () => document.removeEventListener('pointerdown', onDown)
}
