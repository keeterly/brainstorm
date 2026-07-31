// Making sure you are running the app that was shipped.
//
// What was here before was one line, generated: `navigator.serviceWorker
// .register('/sw.js')`. Register once on load and never speak of it again. No
// check for a newer worker, no reload when one arrives — and paired with a
// worker that never called skipWaiting, the result was an app frozen at
// whatever version you first opened.
//
// That is not a small bug. It is the bug that makes every other fix a lie: a
// change deployed and verified and pushed is still not a change anybody has,
// and the only way out was to force-quit an installed app, which nobody thinks
// to do because nothing suggests it.
//
// So three things, none of them clever:
//
//   1. **Ask.** A page that stays open for two days must go and look for a new
//      worker, because registration only happens once. On coming back to the
//      app, and on a slow timer.
//   2. **Take over.** The worker itself calls skipWaiting and clientsClaim, so
//      a new one does not queue behind the old.
//   3. **Reload, once.** When the new worker takes control the page is holding
//      the old bundle, and only a navigation fixes that. Guarded so the first
//      visit — which has no controller to change *from* — never reloads, and so
//      it can never happen twice.
//
// …and one thing that is: **the reload must not eat what you are in the middle
// of writing.** `reg.update()` runs every time the app comes back to the
// front, which is exactly the moment you have typed half a thought, switched
// to check something and come back. A new worker landing right then took the
// page out from under a textarea whose contents lived nowhere but the DOM.
// Anything that holds unsaved work can now say so, and the reload waits.
const RE_ASK_MS = 30 * 60 * 1000
/** How often to look again once a hold has asked the reload to wait. */
const HOLD_POLL_MS = 1500

const holds = new Set<() => boolean>()

/**
 * "Do not reload while this is true."
 *
 * Register one for anything that would be destroyed by a navigation. Returns
 * the release — call it when the surface goes away, or the hold outlives it.
 */
export function holdReload(busy: () => boolean): () => void {
  holds.add(busy)
  return () => holds.delete(busy)
}

function held(): boolean {
  for (const h of holds) {
    try {
      if (h()) return true
    } catch {
      /* a broken hold must not block the update forever */
    }
  }
  return false
}

export function keepFresh(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  // Whether this page is already being served *by* a worker. On a first visit
  // it is not, and clientsClaim will fire controllerchange as the very first
  // worker takes over — which must not be read as "a new version arrived".
  const wasControlled = !!navigator.serviceWorker.controller
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled || reloading) return
    reloading = true
    // The new bundle is already installed and will be served on the next
    // navigation whenever that comes — there is no hurry, and no version of
    // being up to date that is worth a paragraph you were halfway through.
    const go = () => {
      if (held()) {
        setTimeout(go, HOLD_POLL_MS)
        return
      }
      location.reload()
    }
    go()
  })

  // …and the other thing the worker cannot do for itself. It has no Supabase
  // session, so when the browser rotates this device's push address it asks
  // whichever page is open to write the new row. See src/sw.ts.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if ((e.data as { type?: string })?.type !== 'PUSH_RESUBSCRIBE') return
    void import('./push').then((m) => m.refresh())
  })

  const start = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const ask = () => void reg.update().catch(() => undefined)
      // coming back to the app is the moment worth checking: it is when a
      // phone has most likely been away long enough for a deploy to happen
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') ask()
      })
      setInterval(ask, RE_ASK_MS)
    } catch {
      /* an app that cannot register a worker still works; it is just online-only */
    }
  }

  if (document.readyState === 'complete') void start()
  else addEventListener('load', () => void start(), { once: true })
}
