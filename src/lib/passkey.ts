// Face ID / Touch ID as a device lock, the same shape VENIA OS uses: a
// platform passkey is registered on this device, and unlocking it re-opens a
// session that is already signed in.
//
// Be clear about what this is. The passkey gates the app's front door on this
// device; it does not encrypt anything. The Supabase refresh token still lives
// in this browser's storage, so someone holding your unlocked phone with
// developer tools could still reach it. It is convenience and a real barrier
// to casual access — not a vault.

const CRED = 'brainstorm-passkey-id'
const SKIP = 'brainstorm-passkey-skip'

const b64u = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const unb64u = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

function store() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function isEnrolled(): boolean {
  return !!store()?.getItem(CRED)
}
export function hasDeclined(): boolean {
  return !!store()?.getItem(SKIP)
}
export function decline() {
  store()?.setItem(SKIP, '1')
}
export function forget() {
  const s = store()
  s?.removeItem(CRED)
  s?.removeItem(SKIP)
}

/** Is a built-in biometric authenticator actually available here? */
export async function available(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!window.PublicKeyCredential || !window.isSecureContext) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/** Register this device. Triggers the Face ID / Touch ID enrolment sheet. */
export async function enroll(label: string): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Brainstorm', id: location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: label,
          displayName: label,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    if (!cred) return false
    store()?.setItem(CRED, b64u(cred.rawId))
    store()?.removeItem(SKIP)
    return true
  } catch {
    return false
  }
}

/**
 * Ask for the face or the finger. `manual` is true when the user tapped the
 * button — iOS blocks the prompt without a gesture, so an automatic attempt
 * that fails should stay silent rather than cry wolf.
 */
export async function unlock(): Promise<boolean> {
  const id = store()?.getItem(CRED)
  if (!id) return false
  try {
    const ok = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        timeout: 60000,
        allowCredentials: [{ type: 'public-key', id: unb64u(id), transports: ['internal'] }],
        userVerification: 'required',
      },
    })
    return !!ok
  } catch {
    return false
  }
}
