// Asking the sky to open one particular thing, from the other tab.
//
// There is already a way to do this from outside the app: `/?open=<id>`, which
// a push notification or a bookmark arrives on, and which `openArrivedThought`
// reads once when the sky mounts. It works, on a cold load.
//
// It does not work from the next tab along, and the roadmap's whole promise —
// that every step on it is a way into the thing itself — rested on it. Measured
// before this existed: tapping a step navigated to `/?open=m1`, the sky
// remounted, and the page never opened. Seven steps, twice over, no error.
// A URL is a message you send to a *new* page; between two tabs of one running
// app it goes through a router that owns the address bar, and racing it for
// possession of the query string is not a fight worth having.
//
// So: say it out loud instead, in the same process. The URL path stays exactly
// as it was for the case it was built for.
let wanted: string | null = null

/** From the roadmap, immediately before navigating to the sky. */
export function askToOpen(id: string): void {
  wanted = id
}

/**
 * From the sky, once, as it mounts.
 *
 * Taken rather than read: a thing you asked for on Tuesday must not open itself
 * again on Wednesday because you happened to come back to the tab.
 */
export function takeWanted(): string | null {
  const w = wanted
  wanted = null
  return w
}
