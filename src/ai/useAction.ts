import { useCallback, useRef, useState } from 'react'
import { runAction, type RunOptions } from './client'

export type ActionStatus = 'idle' | 'running' | 'done' | 'error'

// React handle for one AI action: run / retry / status / error, with an
// abortable in-flight request. Keeps AI orchestration out of components.
export function useAction<O = unknown>(action: string) {
  const [status, setStatus] = useState<ActionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<O | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastInput = useRef<unknown>(null)

  const run = useCallback(
    async (input: unknown, opts: Omit<RunOptions, 'signal'> = {}): Promise<O | null> => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      lastInput.current = input
      setStatus('running')
      setError(null)
      try {
        const { output } = await runAction<O>(action, input, { ...opts, signal: ac.signal })
        setOutput(output)
        setStatus('done')
        return output
      } catch (e) {
        if (ac.signal.aborted) return null
        setError(String((e as Error).message || e))
        setStatus('error')
        return null
      }
    },
    [action],
  )

  const retry = useCallback(() => {
    if (lastInput.current != null) void run(lastInput.current)
  }, [run])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
  }, [])

  return { run, retry, cancel, status, error, output }
}
