import { describe, expect, it } from 'vitest'
import { humanDate, humanDue } from './human-date'

const TODAY = '2026-07-29' // a Wednesday

describe('humanDate', () => {
  it('speaks the near days', () => {
    expect(humanDate('2026-07-29', TODAY)).toBe('today')
    expect(humanDate('2026-07-30', TODAY)).toBe('tomorrow')
    expect(humanDate('2026-07-28', TODAY)).toBe('yesterday')
    expect(humanDate('2026-07-25', TODAY)).toBe('4 days ago')
  })
  it('uses the weekday inside the coming week', () => {
    expect(humanDate('2026-08-01', TODAY)).toMatch(/^[A-Z][a-z]+day$/)
  })
  it('falls back to a short date further out', () => {
    expect(humanDate('2026-09-12', TODAY)).toMatch(/Sep/)
    expect(humanDate('2027-01-04', TODAY)).toMatch(/2027/)
  })
  it('returns the input when it cannot parse', () => {
    expect(humanDate('someday', TODAY)).toBe('someday')
  })
})

describe('humanDue', () => {
  it('counts lateness rather than printing a date', () => {
    expect(humanDue('2026-07-28', TODAY)).toBe('1 day late')
    expect(humanDue('2026-07-24', TODAY)).toBe('5 days late')
  })
  it('says the near deadlines plainly', () => {
    expect(humanDue('2026-07-29', TODAY)).toBe('due today')
    expect(humanDue('2026-07-30', TODAY)).toBe('due tomorrow')
    expect(humanDue('2026-09-12', TODAY)).toMatch(/^due Sep/)
  })
})
