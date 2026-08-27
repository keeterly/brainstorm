import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { whyItFailed } from './why'

describe('telling someone it did not work', () => {
  it('never puts the words that were actually on screen back on screen', () => {
    // this is verbatim what the sky showed above the map
    const said = whyItFailed('invalid_output', 'Output failed schema validation after repair retry')
    expect(said).not.toMatch(/schema/i)
    expect(said).not.toMatch(/validation/i)
    expect(said).toMatch(/one more go/)
  })

  it('says the same thing about the newer, more detailed version of that failure', () => {
    const said = whyItFailed('invalid_output', 'Output failed validation after a repair retry — steps: Array must contain at most 10 element(s)')
    expect(said).toMatch(/could not read/)
  })

  it('tells being cut off apart from being wrong, because the fix differs', () => {
    expect(whyItFailed('invalid_output', 'The answer was cut off before it finished — it ran out of room.')).toMatch(
      /narrower/,
    )
  })

  it('passes through the things already addressed to the reader', () => {
    for (const s of ['Sign in to use AI actions', 'Daily AI limit reached (400 runs). Try again tomorrow.']) {
      expect(whyItFailed('failed', s)).toBe(s)
    }
  })

  it('says when it is the engine that is busy, not the request that is bad', () => {
    expect(whyItFailed('failed', 'overloaded_error')).toMatch(/busy/)
  })

  it('never leaks a blob of json at someone', () => {
    const said = whyItFailed('failed', '{"error":{"type":"invalid_request_error","message":"..."}}')
    expect(said).toBe('the thinking engine could not finish that one')
  })

  it('keeps a short plain sentence rather than replacing it with a euphemism', () => {
    expect(whyItFailed('failed', 'The model did not emit structured output')).toMatch(/went quiet/)
    expect(whyItFailed('failed', 'Something specific and short')).toBe('something specific and short')
  })

  it('always has something to say', () => {
    for (const [s, e] of [
      [null, null],
      ['failed', ''],
      ['running', null],
      [null, '   '],
    ] as [string | null, string | null][]) {
      expect(whyItFailed(s, e).length).toBeGreaterThan(10)
    }
  })
})

/*
 * …and that it is actually reached.
 *
 * The phrasebook was applied on two of the three ways a run can fail. The
 * streamed one — which is every long action, the ones somebody has waited a
 * minute for — took the SSE `message` verbatim and threw it, so whatever
 * netlify/functions/ai.ts had stringified out of the SDK went on screen: a
 * JSON error envelope, an `overloaded_error`, a sentence written for a log.
 *
 * A source pin rather than a mocked stream, because what went wrong was one
 * branch being forgotten, and this is the shape of test that notices a branch
 * being forgotten again.
 */
describe('every way a run can fail goes through it', () => {
  const src = readFileSync('src/ai/client.ts', 'utf8')

  it('is applied on the streamed path', () => {
    expect(src).toMatch(/errMsg = whyItFailed\(/)
  })

  it('does not put a raw stream message on screen', () => {
    expect(src).not.toMatch(/errMsg = ev\.message/)
  })

  it('is applied on the buffered path too', () => {
    // three call sites: the finished-run branch, the stream, and the 5xx body
    expect(src.match(/whyItFailed\(/g) ?? []).toHaveLength(3)
  })
})
