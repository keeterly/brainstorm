// Being told, when the app is closed.
//
// The work already happens somewhere your phone is not — ⚡ runs in a
// background function that carries on through a lock, a switched app, a closed
// tab. What it could not do was make a sound. This is the sound.
//
// The awkward part is entirely Apple's, and worth stating plainly rather than
// discovering: on iOS, web push exists only from 16.4, and only for a site
// added to the Home Screen. In a Safari tab the API is there and subscribing
// fails. So `readiness()` answers with *why* rather than a boolean, because
// "not supported" and "add it to your Home Screen first" are completely
// different things to be told.
import { supabase } from './supabase'

export type PushReadiness =
  | { can: true }
  | { can: false; why: 'unsupported' }
  | { can: false; why: 'needs-install' }
  | { can: false; why: 'blocked' }
  | { can: false; why: 'unconfigured' }

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports as a Mac; the touch points give it away
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

const installed = () =>
  typeof matchMedia !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true)

/** Whether this device can be reached at all, and if not, what would fix it. */
export function readiness(): PushReadiness {
  if (typeof window === 'undefined') return { can: false, why: 'unsupported' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // On an iPhone this is almost always the Home Screen thing rather than an
    // old browser, and saying "unsupported" would send someone off to update
    // an already-current phone.
    return { can: false, why: isIOS() && !installed() ? 'needs-install' : 'unsupported' }
  }
  if (isIOS() && !installed()) return { can: false, why: 'needs-install' }
  if (!VAPID_PUBLIC) return { can: false, why: 'unconfigured' }
  if (Notification.permission === 'denied') return { can: false, why: 'blocked' }
  return { can: true }
}

/**
 * Is this device already signed up — and does the server agree?
 *
 * It used to ask the local PushManager and stop there, which answers a
 * different question: whether *this browser* thinks it has a subscription.
 * The row on the server is what actually gets sent to. Those two drift — the
 * browser rotates an endpoint, the row was deleted from another device, a
 * failed send marked it `gone_at` — and every one of those drifts leaves the
 * settings screen saying notifications are on while nothing can reach you.
 *
 * When they disagree, the local subscription is re-registered rather than
 * reported, because it is the row that is missing, not the permission.
 */
export async function subscribed(): Promise<boolean> {
  if (!readiness().can) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return false
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint')
      .eq('endpoint', sub.endpoint)
      .is('gone_at', null)
      .maybeSingle()
    // offline, or the query failed: trust the browser rather than telling
    // someone their notifications are off because a select did not answer
    if (error) return true
    if (data) return true
    return (await save(sub)) === null
  } catch {
    return false
  }
}

/**
 * Put this device's address on the server.
 *
 * Also the whole of `pushsubscriptionchange`: browsers rotate an endpoint
 * whenever they feel like it — a push service migration, a long silence, an
 * OS update — and nothing here listened for that. The old row stays, every
 * send to it fails, and the app goes on saying notifications are on. See
 * `src/sw.ts`, which catches the event and asks the page to do this.
 */
async function save(sub: PushSubscription): Promise<string | null> {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return 'the browser gave no address'
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      label: deviceLabel(),
      gone_at: null,
    },
    // one row per device: re-subscribing refreshes the keys rather than
    // adding a second address that sends you everything twice
    { onConflict: 'user_id,endpoint' },
  )
  return error ? 'could not save it' : null
}

/**
 * The browser changed this device's address. Register the new one.
 *
 * Called from the page rather than the worker, because the worker has no
 * Supabase session and this write goes out as you, under RLS.
 */
export async function refresh(): Promise<void> {
  if (!readiness().can) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC).buffer as ArrayBuffer,
      }))
    await save(sub)
  } catch {
    /* nothing to do about it here; the next enable() will sort it out */
  }
}

export type EnableResult = { ok: true } | { ok: false; why: string }

/**
 * Ask for permission and sign this device up.
 *
 * Must be called straight from a tap: every browser refuses a permission
 * prompt that did not come from one, and Safari refuses it silently.
 */
export async function enable(): Promise<EnableResult> {
  const r = readiness()
  if (!r.can) return { ok: false, why: explain(r) }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, why: 'not allowed' }

    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        // required by every browser now, and the reason the payload can be
        // encrypted to this device and nobody else
        userVisibleOnly: true,
        // .buffer, because the DOM types insist on an ArrayBuffer rather than
        // a view that might be over a SharedArrayBuffer
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC).buffer as ArrayBuffer,
      }))

    const why = await save(sub)
    return why ? { ok: false, why } : { ok: true }
  } catch (e) {
    return { ok: false, why: (e as Error)?.message?.slice(0, 80) || 'it did not work' }
  }
}

/** Stop reaching this device, here and on the server. */
export async function disable(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    // forget the row first: a subscription that is unsubscribed locally but
    // still in the table is one the server keeps trying and failing to reach
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch {
    /* nothing to do — the point was to stop, and we have */
  }
}

export function explain(r: PushReadiness): string {
  if (r.can) return ''
  switch (r.why) {
    case 'needs-install':
      return 'Add Brainstorm to your Home Screen first — iPhone only allows this for installed apps.'
    case 'blocked':
      return 'Notifications are turned off for this site in your browser settings.'
    case 'unconfigured':
      return 'Notifications are not set up on this deployment yet.'
    default:
      return 'This browser cannot do notifications.'
  }
}

/** Which device this is, so four of them can be told apart before deleting one. */
function deviceLabel(): string {
  const ua = navigator.userAgent
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'this device'
  return installed() ? `${os} (installed)` : os
}

/** The VAPID key travels as url-safe base64 and has to arrive as bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
