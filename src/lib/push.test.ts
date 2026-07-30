import { afterEach, describe, expect, it, vi } from 'vitest'
import { explain, urlBase64ToUint8Array } from './push'

vi.mock('./supabase', () => ({ supabase: { from: () => ({}) } }))

afterEach(() => vi.unstubAllGlobals())

describe('the VAPID key on the way to the browser', () => {
  it('turns url-safe base64 into the bytes the browser asked for', () => {
    // the real public key for this deployment: 65 bytes, uncompressed P-256,
    // which always begins 0x04
    const key = 'BIPv9dv8zVsCosBD6_Y6AgEfM2yO5tgsmbhcfygMIDCLdJ46QQSBXLwNqgqFWm1lscaCW1TGOaV8OYUzQLbeFXc'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(0x04)
  })

  it('handles the - and _ that plain base64 would choke on', () => {
    // '-' and '_' stand in for '+' and '/'
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([...urlBase64ToUint8Array('+/8')])
  })

  it('pads a string that needs it, rather than throwing', () => {
    for (const s of ['QQ', 'QUJD', 'QUJDRA', 'QUJDREU']) {
      expect(() => urlBase64ToUint8Array(s)).not.toThrow()
    }
  })
})

describe('telling someone why they cannot be reached', () => {
  it('sends an iPhone to the Home Screen rather than to a browser update', () => {
    // the single most confusing thing about web push: the API is present in a
    // Safari tab and subscribing fails anyway
    expect(explain({ can: false, why: 'needs-install' })).toMatch(/Home Screen/)
  })
  it('distinguishes a browser that will not from one that cannot', () => {
    expect(explain({ can: false, why: 'blocked' })).toMatch(/turned off/)
    expect(explain({ can: false, why: 'unsupported' })).toMatch(/cannot/)
  })
  it('admits when it is the deployment that is not set up, not the phone', () => {
    expect(explain({ can: false, why: 'unconfigured' })).toMatch(/not set up/)
  })
  it('says nothing when there is nothing wrong', () => {
    expect(explain({ can: true })).toBe('')
  })
  it('always says something actionable', () => {
    for (const why of ['needs-install', 'blocked', 'unsupported', 'unconfigured'] as const) {
      const s = explain({ can: false, why })
      expect(s.length).toBeGreaterThan(20)
      expect(s.endsWith('.')).toBe(true)
    }
  })
})
