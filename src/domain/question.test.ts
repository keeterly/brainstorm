import { describe, expect, it } from 'vitest'
import { isQuestion, workLabel } from './question'

// The cases below are the actual drops off the user's map on the day they asked
// for this — one screen, six items, three of them questions and three of them
// work, and the app was offering all six the same thing.
const REAL_QUESTIONS = [
  'Pull live Google Flights / ITA Matrix fares for LAX→CDG premium economy, Sept 28 out / Oct 9 back, exact dates',
  'Check Air France Flying Blue and Delta SkyMiles award availability for those dates',
  'Check seat map / aircraft type on the specific Air France flight',
]
const REAL_WORK = [
  'Book once fare/award is confirmed reasonable',
  'Set a fare alert (Google Flights tracking or Going.com)',
  'File LLC for VENIA',
  'For women’s fashion week, arrive by September 28',
  'SS27 Lookbook & Collection Prep',
  'VENIA funding readiness',
]

describe('telling a question from a job of work', () => {
  it('reads the real map correctly, both ways', () => {
    for (const t of REAL_QUESTIONS) expect(isQuestion(t), t).toBe(true)
    for (const t of REAL_WORK) expect(isQuestion(t), t).toBe(false)
  })

  it('takes a question mark at its word', () => {
    expect(isQuestion('Is premium economy worth it on the 777?')).toBe(true)
    // a mark anywhere in the first line, because a question can have a tail
    expect(isQuestion('Which carrier — AF or DL? and at what fare')).toBe(true)
  })

  it('hears the question in a sentence that never got its mark', () => {
    // people do not punctuate their own notes
    expect(isQuestion('how much is a 7(a) loan going to cost in fees')).toBe(true)
    expect(isQuestion('what does Première actually include')).toBe(true)
  })

  it('lets a do-verb win over anything that comes after it', () => {
    // this one mentions two lookup services and is still a task
    expect(isQuestion('Set a fare alert (Google Flights tracking or Going.com)')).toBe(false)
    expect(isQuestion('Book the flight once you check the seat map')).toBe(false)
    expect(isQuestion('Review what the accountant found')).toBe(false)
  })

  it('is not fooled by the bullet someone typed in front of it', () => {
    for (const p of ['- ', '• ', '1. ', '2) ', '– ', '“', '  * ']) {
      expect(isQuestion(p + 'Check award availability'), p).toBe(true)
      expect(isQuestion(p + 'Book the flight'), p).toBe(false)
    }
  })

  it('needs a whole word, not a prefix of one', () => {
    // "Checkout flow is broken" is not a request to check anything
    expect(isQuestion('Checkout flow is broken on mobile')).toBe(false)
    expect(isQuestion('Askew hem on the sample')).toBe(false)
    expect(isQuestion('Pulling the SS27 line sheet together')).toBe(false)
  })

  it('treats anything it cannot read as work', () => {
    // the safe default: offering to plan a question wastes a minute, offering
    // to answer a task hijacks something you meant to go and do
    for (const t of ['', '   ', null, undefined, 'Fabric swatches from Lyon']) {
      expect(isQuestion(t as string), String(t)).toBe(false)
    }
  })

  it('names the act accordingly, so one button can serve both', () => {
    expect(workLabel(REAL_QUESTIONS[0])).toBe('answer it')
    expect(workLabel(REAL_WORK[0])).toBe('work it')
  })
})
