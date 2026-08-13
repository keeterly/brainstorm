import { describe, expect, it } from 'vitest'
import { parseCapture } from './capture'

const NOW = new Date(2026, 6, 28, 9, 30)

describe('a thought that runs over more than one line', () => {
  it('is one thought, not a bubble a line', () => {
    /*
     * The complaint the whole change exists for. A thought and the line that
     * finished it arrived as two bubbles, and the second of them — "they said
     * 3 weeks last time" — sitting alone in the sky, was not a thought anybody
     * had.
     */
    const c = parseCapture('Call the mill about the linen\nthey said 3 weeks last time', NOW)!
    expect(c.steps).toEqual([])
    expect(c.body).toBe('Call the mill about the linen\nthey said 3 weeks last time')
  })

  it('is still one thought when you leave a blank line in the middle of it', () => {
    // A blank line used to start a second bubble, so pressing Enter twice while
    // thinking — which is how people write — quietly cut the thought in half.
    // Enter has never submitted anything here, so there was no warning either.
    const c = parseCapture('The whole SS27 idea\n\nnothing that reads as new', NOW)!
    expect(c.steps).toEqual([])
    expect(c.body).toBe('The whole SS27 idea\n\nnothing that reads as new')
  })

  it('is given no name of its own', () => {
    /*
     * Deliberate, and the reason is load-bearing: the sky's page for a drop has
     * one field and it is filled with `title || raw_content`. A note named
     * after its first line would show only that line there, with every line
     * after it invisible and nowhere left in the app to reach them — and
     * closing the page would then rename the title alone and strand the body
     * in the store for ever.
     */
    expect(parseCapture('Two lines\nof thinking', NOW)!.heading).toBe('')
  })
})

describe('a heading over bullets', () => {
  it('is the one capture that becomes more than one bubble', () => {
    const c = parseCapture('Launch campaign:\n- write brief\n- book photographer\n* pick venue', NOW)!
    expect(c.heading).toBe('Launch campaign')
    expect(c.steps).toEqual(['write brief', 'book photographer', 'pick venue'])
  })

  it('gives the whole thing the date it heard on the first line', () => {
    const c = parseCapture('Order fabric by friday\n- call vendor\n- confirm colors', NOW)!
    expect(c.due).toBe('2026-07-31')
    expect(c.heading).toBe('Order fabric')
  })

  it('keeps a paragraph written under the list as words, not as steps', () => {
    /*
     * The trap this change opens. With no blank-line split, a sentence added
     * after a list is just another line after the first, and taking it for a
     * bullet is the fragmenting this change removes, moved to a new place —
     * a paragraph of prose sitting in the middle of somebody's plan as a step.
     */
    const c = parseCapture(
      'Spring line:\n- linen shirt\n- wide trousers\nthe palette should stay in the sand range',
      NOW,
    )!
    expect(c.steps).toEqual([])
    expect(c.body).toContain('the palette should stay in the sand range')
  })

  it('does not make a goal out of a list with no heading', () => {
    // "- milk / - eggs / - bread" used to become a goal called "milk" with two
    // steps in it, because the first line was taken as the heading whether or
    // not it was itself a bullet
    const c = parseCapture('- milk\n- eggs\n- bread', NOW)!
    expect(c.steps).toEqual([])
    expect(c.body).toBe('- milk\n- eggs\n- bread')
  })
})

describe('a capture with a date in it', () => {
  it('takes the date out of the words of a plain thought too', () => {
    // the body is the thought's own words, and a date that has become a date
    // should not still be sitting in them
    const c = parseCapture('Order fabric by friday\nthe navy one', NOW)!
    expect(c.due).toBe('2026-07-31')
    expect(c.body).toBe('Order fabric\nthe navy one')
  })
})

describe('a capture with nothing in it', () => {
  it('is nothing, rather than an empty bubble', () => {
    expect(parseCapture('   \n  ', NOW)).toBeNull()
    expect(parseCapture('', NOW)).toBeNull()
  })

  it('ignores blank lines above what you wrote', () => {
    expect(parseCapture('\n\n  \nActually this', NOW)!.body).toBe('Actually this')
  })
})
