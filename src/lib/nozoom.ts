// Keeping the interface still.
//
// There are two pinches in this app and only one of them is wanted. Pinching
// the sky pulls the camera back over your own map, which is the whole point of
// having a map. Pinching the *interface* scales the document: the tab bar
// slides off the bottom, the page you were reading no longer fits the glass,
// and nothing on screen says how to get back — the way out is a double-tap
// most people do not know about, in an installed app with no browser chrome to
// reset it.
//
// A phone cannot tell the two apart, because they are the same gesture. So the
// document refuses all of it and the world keeps doing its own: the sky runs
// on pointer events, and nothing here touches a pointer event.
//
// Three refusals, because no one of them covers a phone on its own:
//
//   1. **The meta tag** — `maximum-scale=1, user-scalable=no`. Honoured by
//      Android and by iOS in an installed app; ignored by Safari in a tab
//      since iOS 10.
//   2. **Safari's gesture events** — `gesturestart`/`gesturechange`, which is
//      the pinch Safari does honour. Cancelled here, and only here: nothing in
//      the app listens for them.
//   3. **`touch-action: manipulation`** in the stylesheet, which is what takes
//      away the double-tap zoom. Deliberately *not* done by cancelling
//      `touchend`, the usual trick: on iOS that also cancels the click the
//      browser would have synthesised, and this app has a double-tap gesture
//      of its own — the second tap that opens a group would be eaten by the
//      thing meant to be protecting it.

export function holdStill(): void {
  if (typeof document === 'undefined') return
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
  }
}
