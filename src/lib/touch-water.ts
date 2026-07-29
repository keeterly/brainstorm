// Pressing anything in this app should look like pressing something made of
// water. One delegated listener gives every button the same answer — the body
// dips under and comes back up, and a ring spreads from where it was pushed —
// so no component has to remember to do it and nothing can drift out of step.
import { haptics } from '@/lib/haptics'

const SELECTOR = '.btn, .chip'

export function installWaterTouch() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const onDown = (e: PointerEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.(SELECTOR) as HTMLElement | null
    if (!el || el.hasAttribute('disabled')) return
    haptics.grab()
    if (reduced) return
    ring(e.clientX, e.clientY)
    el.classList.remove('dip')
    // reflow, so pressing the same button twice plays the dip twice
    void el.offsetWidth
    el.classList.add('dip')
  }
  document.addEventListener('pointerdown', onDown, { passive: true })
  return () => document.removeEventListener('pointerdown', onDown)
}

/** A ring leaving the point that was touched. Two of them, slightly apart, so
 *  it reads as a disturbance in a surface rather than one clean circle. */
function ring(x: number, y: number) {
  for (const [size, delay] of [
    [34, 0],
    [64, 90],
  ] as const) {
    const r = document.createElement('div')
    r.className = 'ripple'
    r.style.width = r.style.height = `${size}px`
    r.style.left = `${x - size / 2}px`
    r.style.top = `${y - size / 2}px`
    r.style.animationDelay = `${delay}ms`
    document.body.appendChild(r)
    setTimeout(() => r.remove(), 1000 + delay)
  }
}
