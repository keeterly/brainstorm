import { useCallback, useEffect, useRef, useState } from 'react'

// Progressive enhancement: webkitSpeechRecognition where available (Safari,
// Chrome). Text capture is always the primary path.
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: { [i: number]: { 0: { transcript: string }; isFinal: boolean }; length: number } }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

export function useVoice(onText: (text: string) => void) {
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const [listening, setListening] = useState(false)
  const wantRef = useRef(false)

  const supported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition ||
        (window as unknown as Record<string, unknown>).SpeechRecognition,
    )

  const stop = useCallback(() => {
    wantRef.current = false
    recRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    if (!supported) return
    const Ctor = ((window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>)
        .webkitSpeechRecognition) as new () => SpeechRecognitionLike
    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) onText(r[0].transcript.trim())
      }
    }
    // iOS ends sessions on its own; restart while the user still wants to talk.
    rec.onend = () => {
      if (wantRef.current) {
        try {
          rec.start()
        } catch {
          setListening(false)
        }
      } else setListening(false)
    }
    rec.onerror = () => setListening(false)
    recRef.current = rec
    wantRef.current = true
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [onText, supported])

  useEffect(() => stop, [stop])

  return { supported, listening, start, stop }
}
