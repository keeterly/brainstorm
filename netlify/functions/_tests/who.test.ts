import { describe, expect, it } from 'vitest'
import { capForUser, capWithInvite, invitesRule, letIn, onTheList, totalCap } from '../_lib/who'

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

/*
 * Invites.
 *
 * The guest list used to cost a redeploy per tester. These pin the two things
 * that decide whether an invite is a guest list or a hole in one: that turning
 * invites on cannot accidentally let *everybody* in, and that an invite's own
 * cap can only ever lower the ceiling.
 */
describe('letting somebody in on an invite', () => {
  const live = { code: 'abc', usd_cap: null, expires_at: null }

  it('lets the email list win, invites or not', () => {
    // this is how you let yourself in without minting yourself a code
    expect(letIn('me@x.com', null, 'me@x.com')).toBe(true)
    expect(letIn('me@x.com', live, 'me@x.com')).toBe(true)
  })

  it('lets an invited stranger in when they are not on the list', () => {
    expect(letIn('them@x.com', live, 'me@x.com')).toBe(true)
    expect(letIn('them@x.com', null, 'me@x.com')).toBe(false)
  })

  it('does not treat "no list" as "everybody" once invites are the rule', () => {
    /*
     * The trap. `onTheList` fails open by design — a deployment with one user
     * should need no configuration — so turning invites on without also naming
     * an email would have let in exactly the people it was meant to keep out.
     */
    const on = { AI_INVITES: '1' }
    const was = process.env.AI_INVITES
    process.env.AI_INVITES = on.AI_INVITES
    try {
      expect(letIn('stranger@x.com', null, '')).toBe(false)
      expect(letIn('stranger@x.com', live, '')).toBe(true)
    } finally {
      if (was === undefined) delete process.env.AI_INVITES
      else process.env.AI_INVITES = was
    }
  })

  it('still lets everybody in when invites are off and no list is set', () => {
    // nothing changes for a deployment that never asked for any of this
    expect(letIn('anyone@x.com', null, '')).toBe(true)
  })

  it('is off unless it is switched on', () => {
    expect(invitesRule(undefined)).toBe(false)
    expect(invitesRule('')).toBe(false)
    expect(invitesRule('0')).toBe(false)
    expect(invitesRule('true')).toBe(false)
    expect(invitesRule('1')).toBe(true)
  })
})

describe('what an invite lets you spend', () => {
  it('uses the invite’s own number over the guest default', () => {
    expect(capWithInvite('them@x.com', { code: 'a', usd_cap: 2, expires_at: null }, 6)).toBe(2)
  })

  it('can only ever lower the ceiling, never raise it', () => {
    // a guest list is not a way to hand somebody a bigger budget than the
    // deployment has
    expect(capWithInvite('them@x.com', { code: 'a', usd_cap: 999, expires_at: null }, 6)).toBe(6)
  })

  it('falls back to the ordinary rules with no cap on the invite', () => {
    expect(capWithInvite('them@x.com', { code: 'a', usd_cap: null, expires_at: null }, 6)).toBe(6)
    expect(capWithInvite('them@x.com', null, 6)).toBe(6)
  })

  it('ignores a nonsense number on the invite', () => {
    for (const bad of [0, -5, Number.NaN]) {
      expect(capWithInvite('them@x.com', { code: 'a', usd_cap: bad, expires_at: null }, 6)).toBe(6)
    }
  })
})
