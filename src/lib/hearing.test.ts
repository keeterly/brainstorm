import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { askToHear, canHear, forgetHeard, markHeard, mayHear } from './hearing'

type Handlers = { onstart?: (() => void) | null; onend?: (() => void) | null; onerror?: ((e?: { error?: string }) => void) | null }
let made: (Handlers & { started: boolean; stopped: boolean })[] = []
/** How the stand-in answers `start()`: the three ways a phone can. */
let answer: 'allow' | 'refuse' | 'silence' | 'throw' = 'allow'

class Fake {
  continuous = false
  interimResults = false
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e?: { error?: string }) => void) | null = null
  onresult: ((ev: unknown) => void) | null = null
  started = false
  stopped = false
  constructor() {
    made.push(this)
  }
  start() {
    this.started = true
    if (answer === 'throw') throw new Error('nope')
    if (answer === 'allow') queueMicrotask(() => this.onstart?.())
    if (answer === 'refuse') queueMicrotask(() => this.onerror?.({ error: 'not-allowed' }))
    // 'silence': the sheet is up and the phone says nothing
  }
  stop() {
    this.stopped = true
  }
}

beforeEach(() => {
  made = []
  answer = 'allow'
  localStorage.clear()
  vi.stubGlobal('window', { webkitSpeechRecognition: Fake })
})
afterEach(() => vi.unstubAllGlobals())

describe('being allowed to listen', () => {
  it('starts out not allowed, so a gesture never assumes it', () => {
    expect(canHear()).toBe(true)
    expect(mayHear()).toBe(false)
  })

  it('remembers a yes, and can be told to forget it', () => {
    markHeard()
    expect(mayHear()).toBe(true)
    forgetHeard()
    expect(mayHear()).toBe(false)
  })

  it('asks with the very API the gesture uses', async () => {
    /*
     * Not getUserMedia. On iOS that grants the microphone and leaves the
     * speech-recognition permission un-asked — waiting to ambush the first
     * hold, which is the whole thing this is here to prevent.
     */
    await askToHear()
    expect(made).toHaveLength(1)
    expect(made[0].started).toBe(true)
  })

  it('records the yes and puts the microphone straight back down', async () => {
    const res = await askToHear()
    expect(res.ok).toBe(true)
    expect(mayHear()).toBe(true)
    expect(made[0].stopped).toBe(true)
  })

  it('says what to do about a no, and does not claim to be on', async () => {
    answer = 'refuse'
    const res = await askToHear()
    expect(res.ok).toBe(false)
    expect(res.why).toMatch(/settings/i)
    expect(mayHear()).toBe(false)
  })

  it('forgets a permission that has been taken away since', async () => {
    markHeard()
    answer = 'refuse'
    await askToHear()
    expect(mayHear()).toBe(false)
  })

  it('does not call a phone that has not answered yet a refusal', async () => {
    // the sheet is up and nothing has come back; reporting that as "not
    // allowed" would be the app answering a question asked of the person
    answer = 'silence'
    const res = await askToHear(20)
    expect(res.ok).toBe(false)
    expect(res.why).toMatch(/waiting/i)
    expect(mayHear()).toBe(false)
  })

  it('treats hearing nothing as permission granted', async () => {
    // "no-speech" means it was listening and you said nothing, which answers
    // the permission question yes
    const p = askToHear()
    await Promise.resolve()
    made[0].onerror?.({ error: 'no-speech' })
    expect((await p).ok).toBe(true)
    expect(mayHear()).toBe(true)
  })

  it('answers honestly on a browser with no recognition at all', async () => {
    vi.stubGlobal('window', {})
    expect(canHear()).toBe(false)
    expect((await askToHear()).ok).toBe(false)
  })

  it('survives a start that throws', async () => {
    answer = 'throw'
    expect((await askToHear()).ok).toBe(false)
    expect(mayHear()).toBe(false)
  })
})
