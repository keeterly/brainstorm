import { describe, expect, it } from 'vitest'
import { capForUser, onTheList, totalCap } from '../_lib/who'

// Handing the app to a few people on their own phones without handing them the
// bill. Three ceilings, because they fail in different directions.

describe('the guest list', () => {
  it('lets everybody in when there is no list, which is a deployment with one user', () => {
    expect(onTheList('anyone@example.com', undefined)).toBe(true)
    expect(onTheList('anyone@example.com', '')).toBe(true)
    expect(onTheList(null, '')).toBe(true)
  })

  it('is the whole answer once there is one', () => {
    const l = 'keeter@veniacollection.com, ana@studio.test'
    expect(onTheList('ana@studio.test', l)).toBe(true)
    expect(onTheList('someone@else.com', l)).toBe(false)
  })

  it('does not care about case or stray spaces, because a guest list is typed by hand', () => {
    expect(onTheList('  Ana@Studio.Test ', 'ana@studio.test')).toBe(true)
    expect(onTheList('ana@studio.test', '  ANA@STUDIO.TEST  ')).toBe(true)
  })

  it('takes newlines as well as commas, because that is how a list gets pasted', () => {
    expect(onTheList('b@x.com', 'a@x.com\nb@x.com\nc@x.com')).toBe(true)
  })

  it('refuses an account with no email once a list exists', () => {
    // a guest list you cannot check somebody against is not a guest list
    expect(onTheList(null, 'a@x.com')).toBe(false)
  })
})

describe('what one person may spend in a day', () => {
  it('is the full cap when nobody has been named the owner', () => {
    expect(capForUser('anyone@x.com', 6, {})).toBe(6)
  })

  it('is the full cap for an owner', () => {
    expect(capForUser('me@x.com', 6, { owners: 'me@x.com', guest: '1.5' })).toBe(6)
  })

  it('is the guest figure for everybody else', () => {
    // a tester poking at a new app runs more in an afternoon than the person
    // who built it runs in a week, and none of it is work
    expect(capForUser('them@x.com', 6, { owners: 'me@x.com', guest: '1.5' })).toBe(1.5)
    expect(capForUser(null, 6, { owners: 'me@x.com', guest: '1.5' })).toBe(1.5)
  })

  it(`never lets a guest figure raise the ceiling above the app own`, () => {
    expect(capForUser('them@x.com', 6, { owners: 'me@x.com', guest: '500' })).toBe(6)
  })

  it('ignores a guest figure that is not a number, rather than charging nothing or everything', () => {
    for (const guest of ['', 'lots', '-2', '0']) {
      expect(capForUser('them@x.com', 6, { owners: 'me@x.com', guest }), guest).toBe(6)
    }
  })
})

describe('the ceiling over everybody together', () => {
  it('is off unless it is set', () => {
    // it fails closed when it cannot be read, so a limit nobody asked for
    // would take the app down for the one person using it
    expect(totalCap(undefined)).toBeNull()
    expect(totalCap('')).toBeNull()
    expect(totalCap('nonsense')).toBeNull()
    expect(totalCap('0')).toBeNull()
  })

  it('is the number when there is one', () => {
    expect(totalCap('25')).toBe(25)
    expect(totalCap('7.50')).toBe(7.5)
  })
})
