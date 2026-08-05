// Asking to be allowed to listen, at a moment you chose.
//
// Holding the pen opens the writing page with the microphone already on, which
// is the right gesture and the wrong place to meet a permission dialog: the
// first time you ever try it, the OS puts a sheet over the page while your
// thumb is still down, the hold is eaten, and what you get for learning the
// gesture is a question you did not ask. A prompt in the middle of a gesture
// also gets the wrong answer — nobody reads a dialog that interrupts them.
//
// So the gesture never prompts. It listens when it already may, and points at
// Settings when it may not. The asking happens on its own screen, on purpose,
// by tapping a button that says that is what it will do.
//
// Remembered here rather than asked of the browser, because the browser will
// not say: `navigator.permissions.query({ name: 'microphone' })` is not
// implemented on iOS Safari, which is the only place this app actually runs.
const KEY = 'bs-mic-ok'

type Rec = {
  continuous: boolean
  interimResults: boolean
  onstart?: (() => void) | null
  onend: (() => void) | null
  onerror: ((e?: { error?: string }) => void) | null
  onresult: ((ev: unknown) => void) | null
  start(): void
  stop(): void
}

function ctor(): (new () => Rec) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    webkitSpeechRecognition?: new () => Rec
    SpeechRecognition?: new () => Rec
  }
  return w.webkitSpeechRecognition || w.SpeechRecognition || null
}

/** Whether this phone can turn speech into words at all. */
export function canHear(): boolean {
  return !!ctor()
}

/** Whether it has been allowed to, on this device. */
export function mayHear(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // private mode: no memory of the answer, so the gesture stays quiet and
    // the mic button inside the page is the way in
    return false
  }
}

/** It listened, so it evidently may. */
export function markHeard(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* nothing to do, and nothing lost that matters */
  }
}

/** It was refused, or the permission was taken away in the meantime. */
export function forgetHeard(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* as above */
  }
}

export interface Asked {
  ok: boolean
  why: string
}

/**
 * Ask now, here.
 *
 * Runs one real recognition session and stops it, because that is what raises
 * the prompts the gesture would have raised — on iOS a microphone *and* a
 * speech-recognition one — and asking with `getUserMedia` instead would grant
 * the first and leave the second waiting to ambush the first hold.
 *
 * Resolves as soon as the answer is known: `onstart` means allowed, an error
 * names the refusal. The timeout is the third case — a browser that raises the
 * sheet and tells us nothing until it is answered. That is not a failure and
 * must not be reported as one, so it says what is actually true.
 */
export async function askToHear(waitMs = 8000): Promise<Asked> {
  const C = ctor()
  if (!C) return { ok: false, why: 'This browser cannot turn speech into words.' }
  return new Promise<Asked>((resolve) => {
    let done = false
    const rec = new C()
    rec.continuous = false
    rec.interimResults = false
    const finish = (r: Asked) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
      if (r.ok) markHeard()
      resolve(r)
    }
    const timer = setTimeout(
      () => finish({ ok: false, why: 'Still waiting on the phone to answer. Try the button again.' }),
      waitMs,
    )
    rec.onstart = () => finish({ ok: true, why: '' })
    rec.onerror = (e) => {
      const err = e?.error ?? ''
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        forgetHeard()
        finish({ ok: false, why: 'Not allowed. Turn the microphone on for this app in your phone’s settings.' })
        return
      }
      // "no-speech" and "aborted" both mean it was listening and heard
      // nothing, which is the permission question answered yes
      finish({ ok: true, why: '' })
    }
    // some browsers never fire onstart and go straight to the end
    rec.onend = () => finish({ ok: true, why: '' })
    try {
      rec.start()
    } catch {
      finish({ ok: false, why: 'Could not start listening just now.' })
    }
  })
}
