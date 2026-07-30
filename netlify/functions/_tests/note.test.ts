import { describe, expect, it } from 'vitest'
import { runNote } from '../_lib/note'

const INPUT = { subject: { id: 'th-1', title: 'Get Approved for $100K SBA Loan (30-45 Days)' } }
const OUTPUT = {
  read: 'A 7(a) working-capital loan, not a 504',
  found: [{ point: 'a' }, { point: 'b' }, { point: 'c' }],
  steps: [{ title: 'x' }, { title: 'y' }, { title: 'z' }, { title: 'w' }, { title: 'v' }],
  sources: [{ title: 's', url: 'https://a.test' }],
  note: 'It is a 7(a) — here is the order to do it in.',
}

describe('what goes on a lock screen', () => {
  it('is headed by the thing you asked about, so you know which one this is', () => {
    expect(runNote('deepen', INPUT, OUTPUT, 'r1')!.title).toBe('Get Approved for $100K SBA Loan (30-45 Days)')
  })

  it('says what came back, in the agent’s own sentence', () => {
    expect(runNote('deepen', INPUT, OUTPUT, 'r1')!.body).toBe('It is a 7(a) — here is the order to do it in.')
  })

  it('counts it instead, when there is no sentence to use', () => {
    const n = runNote('deepen', INPUT, { ...OUTPUT, note: '' }, 'r1')!
    expect(n.body).toBe('5 steps · 3 found · 1 source')
  })

  it('gets the plurals right, because one step is not 1 steps', () => {
    const n = runNote('deepen', INPUT, { steps: [{}], sources: [{}], found: [], note: '' }, 'r1')!
    expect(n.body).toBe('1 step · 1 source')
  })

  it('lands on what it wrote, not on the front door', () => {
    expect(runNote('deepen', INPUT, OUTPUT, 'r1')!.url).toBe('/?brief=th-1')
  })

  it('escapes an id rather than trusting it in a url', () => {
    const n = runNote('deepen', { subject: { id: 'a b&c=d', title: 't' } }, OUTPUT, 'r1')!
    expect(n.url).toBe('/?brief=a%20b%26c%3Dd')
  })

  it('goes to the front door when it cannot tell what it was about', () => {
    expect(runNote('deepen', {}, OUTPUT, 'r1')!.url).toBe('/')
  })

  it('is tagged by the run, so a resend replaces rather than stacks', () => {
    expect(runNote('deepen', INPUT, OUTPUT, 'r7')!.tag).toBe('run-r7')
  })

  it('keeps both lines short enough to be read sideways', () => {
    const long = 'x'.repeat(500)
    const n = runNote('deepen', { subject: { id: 'i', title: long } }, { ...OUTPUT, note: long }, 'r1')!
    expect(n.title.length).toBeLessThanOrEqual(60)
    expect(n.body.length).toBeLessThanOrEqual(140)
    expect(n.title.endsWith('…')).toBe(true)
  })

  it('falls back through what it has, and never comes out blank', () => {
    const n = runNote('deepen', {}, { read: 'A 7(a) loan' }, 'r1')!
    expect(n.title).toBe('A 7(a) loan')
    expect(n.body).toBe('It came back.')
    const bare = runNote('deepen', {}, {}, 'r1')!
    expect(bare.title).toBe('Brainstorm')
    expect(bare.body.length).toBeGreaterThan(0)
  })

  it('stays quiet about work nobody is waiting on', () => {
    // only the long-running background actions are worth waking a phone for
    for (const a of ['classify_thought', 'summarize', 'organize', 'notice', 'reshape']) {
      expect(runNote(a, INPUT, OUTPUT, 'r1'), a).toBeNull()
    }
  })

  it('survives an output that is nothing like what it expected', () => {
    for (const bad of [null, undefined, 'a string', 42, { steps: 'not an array' }]) {
      expect(() => runNote('deepen', INPUT, bad, 'r1')).not.toThrow()
      expect(runNote('deepen', INPUT, bad, 'r1')!.body.length).toBeGreaterThan(0)
    }
  })
})

describe('when what came back is an answer', () => {
  const ASKED = { subject: { id: 'th-9', title: 'Pull live LAX→CDG premium economy fares' } }
  const ANSWER = {
    asked: 'What does LAX→CDG premium economy cost, Sept 28 out / Oct 9 back?',
    answer: '$1,180–$1,420 round trip. Air France is showing $1,214 direct on AF65/AF66 for those exact dates.',
    facts: [{ label: 'Cheapest', value: '$1,214' }, { label: 'Aircraft', value: '777-300ER' }],
    sources: [{ title: 'Air France', url: 'https://a.test' }],
  }

  it('puts the answer on the lock screen, not the fact that there is one', () => {
    // the whole point: you asked what the fare was, and the phone says the fare
    expect(runNote('answer', ASKED, ANSWER, 'r1')!.body).toBe('$1,180–$1,420 round trip.')
  })

  it('is headed by the question, in full, rather than by the shorthand you typed', () => {
    const title = runNote('answer', ASKED, ANSWER, 'r1')!.title
    expect(title.startsWith('What does LAX→CDG premium economy cost')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(60)
  })

  it('does not mistake a price or a flight number for the end of a sentence', () => {
    const n = runNote('answer', ASKED, { ...ANSWER, answer: 'It is $1,214.50 on AF65. Delta wants more.' }, 'r1')!
    expect(n.body).toBe('It is $1,214.50 on AF65.')
  })

  it('keeps a one-word verdict whole rather than sending "No." on its own', () => {
    const n = runNote('answer', ASKED, { ...ANSWER, answer: 'No. That rotation has no premium cabin.' }, 'r1')!
    expect(n.body).toBe('No. That rotation has no premium cabin.')
  })

  it('counts what it has when there is no sentence to send', () => {
    expect(runNote('answer', ASKED, { ...ANSWER, answer: '' }, 'r1')!.body).toBe('2 figures · 1 source')
  })

  it('lands on the answer, and replaces rather than stacks', () => {
    const n = runNote('answer', ASKED, ANSWER, 'r4')!
    expect(n.url).toBe('/?brief=th-9')
    expect(n.tag).toBe('run-r4')
  })

  it('never comes back blank, whatever it is handed', () => {
    for (const bad of [null, undefined, 'a string', 42, { facts: 'not an array' }]) {
      const n = runNote('answer', ASKED, bad, 'r1')!
      expect(n.body.length).toBeGreaterThan(0)
      expect(n.title).toBe('Pull live LAX→CDG premium economy fares')
    }
  })
})
