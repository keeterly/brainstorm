import { describe, expect, it } from 'vitest'
import { parseNLDate } from './parse-nl-date'

// Fixed reference: Tuesday 2026-07-28.
const NOW = new Date(2026, 6, 28, 9, 30)

describe('parseNLDate', () => {
  it.each([
    ['email supplier today', '2026-07-28', 'email supplier'],
    ['finish deck tonight', '2026-07-28', 'finish deck'],
    ['call factory tomorrow', '2026-07-29', 'call factory'],
    ['ship samples next week', '2026-08-04', 'ship samples'],
    ['invoice due eom', '2026-07-31', 'invoice'],
    ['plan launch end of month', '2026-07-31', 'plan launch'],
    ['review in 3 days', '2026-07-31', 'review'],
    ['order labels in 2 weeks', '2026-08-11', 'order labels'],
  ])('parses "%s"', (input, due, text) => {
    const r = parseNLDate(input, NOW)
    expect(r.due).toBe(due)
    expect(r.text).toBe(text)
  })

  it('weekday is always the NEXT one, never today', () => {
    // NOW is a Tuesday; "tuesday" must be next week's Tuesday.
    expect(parseNLDate('sync tuesday', NOW).due).toBe('2026-08-04')
    expect(parseNLDate('sync by friday', NOW).due).toBe('2026-07-31')
    expect(parseNLDate('sync next mon', NOW).due).toBe('2026-08-03')
  })

  it('month-day rolls to next year when past', () => {
    expect(parseNLDate('tax due jan 15', NOW).due).toBe('2027-01-15')
    expect(parseNLDate('due jul 31', NOW).due).toBe('2026-07-31')
    expect(parseNLDate('gift due 24 dec', NOW).due).toBe('2026-12-24')
  })

  it('strips connectors and punctuation before the date phrase', () => {
    const r = parseNLDate('send lookbook — by friday', NOW)
    expect(r.due).toBe('2026-07-31')
    expect(r.text).toBe('send lookbook')
  })

  it('leaves text without a date phrase alone', () => {
    const r = parseNLDate('a thought about materials', NOW)
    expect(r.due).toBeNull()
    expect(r.text).toBe('a thought about materials')
  })

  it('does not match dates mid-sentence', () => {
    const r = parseNLDate('tomorrow ideas need sorting', NOW)
    expect(r.due).toBeNull()
  })
})

// Three stragglers a playtester typed as any person would, all of which the
// parser refused or mangled: a weekday with a time after it, "end of
// August", and "on Monday" leaving its "on" behind in the title.
describe('the stragglers from the playtest', () => {
  const now = new Date('2026-08-02T09:00:00') // a Sunday

  it('parses a weekday with a time after it, and keeps the words whole', () => {
    const r = parseNLDate('Dentist Tuesday 3pm', now)
    expect(r.due).toBe('2026-08-04')
    // the time is information the date column cannot hold — the title keeps it
    expect(r.text).toBe('Dentist Tuesday 3pm')
  })

  it('parses "by end of August" as the last day of August', () => {
    const r = parseNLDate('File the sales tax by end of August', now)
    expect(r.due).toBe('2026-08-31')
    expect(r.text).toBe('File the sales tax')
  })

  it('rolls "end of <month>" already past into next year', () => {
    const r = parseNLDate('Plan the retreat by end of January', now)
    expect(r.due).toBe('2027-01-31')
  })

  it('takes "on Monday" without leaving the "on" behind', () => {
    const r = parseNLDate('Call landlord about lease renewal on Monday', now)
    expect(r.due).toBe('2026-08-03')
    expect(r.text).toBe('Call landlord about lease renewal')
  })
})
