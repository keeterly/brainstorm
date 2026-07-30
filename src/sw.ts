/// <reference lib="webworker" />
// The part of the app that is awake when the app is not.
//
// Everything else here runs because you are looking at it. This runs because
// the operating system woke it: a push arrived, or you tapped what it put on
// your lock screen. It is the only place that can tell you the agent came back
// while your phone was in your pocket.
//
// Kept deliberately small. A service worker that throws takes the whole app
// offline-first story with it, and there is no console to find out why.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { createHandlerBoundToURL } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

// ---------- taking over ----------
//
// These two lines are the difference between shipping a fix and appearing to.
//
// A new worker installs and then sits in `waiting` until every last tab and
// every last installed instance of the app has been closed. Nothing here ever
// called skipWaiting — there was a handler for a message no code sent — and
// nothing called clientsClaim, so the old worker went on serving the old
// precached index.html, which points at the old hashed bundle. Reloading does
// not help: the reload is a navigation, and the navigation is answered by the
// worker with the very shell you are trying to get away from. A fix deployed
// at midnight was still invisible half an hour later, and the only way out was
// to force-quit the app.
self.skipWaiting().catch(() => undefined)
clientsClaim()

// ---------- the shell, exactly as before ----------
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    // never serve the shell for the API or for a function
    denylist: [/^\/api\//, /^\/\.netlify\//],
  }),
)
// belt and braces: an older client that knows to ask can still hurry it along
self.addEventListener('message', (e) => {
  if ((e.data as { type?: string })?.type === 'SKIP_WAITING') void self.skipWaiting()
})

// ---------- being told something finished ----------
interface Payload {
  title?: string
  body?: string
  /** where in the app this is about */
  url?: string
  /** so a second notification about the same run replaces the first */
  tag?: string
}

self.addEventListener('push', (event) => {
  // A push with no readable payload still has to show something. Chrome will
  // unregister a subscription that receives a push and shows no notification,
  // so "we could not read it" is a better outcome than going quiet forever.
  let p: Payload = {}
  try {
    p = (event.data?.json() ?? {}) as Payload
  } catch {
    p = {}
  }
  const title = p.title || 'Brainstorm'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: p.body || 'Something finished while you were away.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // one notification per run: a retry replaces rather than stacks
      tag: p.tag || 'brainstorm',
      renotify: !!p.tag,
      data: { url: p.url || '/' },
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = ((event.notification.data as { url?: string } | undefined)?.url ?? '/') || '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // If the app is already open somewhere, go to that window rather than
      // opening a second copy of it — two skies is never what you wanted.
      for (const c of windows) {
        if ('focus' in c) {
          await c.focus()
          if ('navigate' in c && url !== '/') await (c as WindowClient).navigate(url).catch(() => undefined)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
