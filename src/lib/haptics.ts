// Touch that answers back. The web Vibration API covers Android today; iOS
// Safari has none, so this is silent there until the app runs in a native
// shell — at which point only this file changes (Capacitor's Haptics plugin
// slots in behind the same four verbs).
type Pattern = number | number[]

const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

function buzz(p: Pattern) {
  if (!supported) return
  try {
    navigator.vibrate(p)
  } catch {
    /* a refusal is not worth a crash */
  }
}

export const haptics = {
  // a thing is now under your control
  grab: () => buzz(8),
  // two things touched and became one
  join: () => buzz([10, 36, 14]),
  // something left for the ocean
  sink: () => buzz(16),
  // the sky gave you something back
  arrive: () => buzz([6, 26, 6]),
}
