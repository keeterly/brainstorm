import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { sendWork, copyWork } from './send'

const shared: { title?: string; text?: string }[] = []
const copied: string[] = []

beforeEach(() => {
  shared.length = 0
  copied.length = 0
  vi.stubGlobal('navigator', {
    share: vi.fn(async (d: { title?: string; text?: string }) => {
      shared.push(d)
    }),
    clipboard: { writeText: vi.fn(async (t: string) => void copied.push(t)) },
  })
})
afterEach(() => vi.unstubAllGlobals())

/*
 * What actually arrived in a Messages bubble, before this: the raw markdown
 * the model wrote. The old code did it on purpose — markdown "survives
 * arriving somewhere that understands it as headings and lists" — and the
 * share sheet does not tell you which somewhere you picked.
 */
const BRIEF = [
  '# Beyond identifying the 3 target lenders, what documents do I need?',
  '',
  'Nine documents to request from your accountant now.',
  '',
  '## The specifics',
  '',
  '- **Business tax returns: Up to last 3 years filed** — If VENIA is under 3 years old, provide what exists',
  '',
  '## Sources',
  '',
  '- [SBA 7(a) Paperwork Explained](https://www.sba7a.loans/blog/statements/)',
].join('\n')

describe('work leaves the app as something a phone can read', () => {
  it('sends no hashes, no asterisks and no bracketed links', async () => {
    await sendWork('SBA documents', BRIEF)
    const text = shared[0].text as string
    expect(text).not.toMatch(/^#/m)
    expect(text).not.toMatch(/\*\*/)
    expect(text).not.toMatch(/\]\(http/)
  })

  it('keeps every word of what it stripped the markup off', async () => {
    await sendWork('SBA documents', BRIEF)
    const text = shared[0].text as string
    for (const kept of [
      'Beyond identifying the 3 target lenders',
      'Nine documents to request',
      'The specifics',
      'Business tax returns: Up to last 3 years filed',
      'SBA 7(a) Paperwork Explained',
      'https://www.sba7a.loans/blog/statements/',
    ]) {
      expect(text).toContain(kept)
    }
  })

  it('turns a bullet into the one bullet this app uses', async () => {
    await sendWork('SBA documents', BRIEF)
    expect(shared[0].text).toMatch(/· Business tax returns/)
  })

  it('still hands the title over, for the apps that use it as a subject', async () => {
    await sendWork('SBA documents', BRIEF)
    expect(shared[0].title).toBe('SBA documents')
  })

  it('levels the clipboard fallback the same way', async () => {
    await copyWork(BRIEF)
    expect(copied[0]).not.toMatch(/^#/m)
    expect(copied[0]).toContain('Nine documents to request')
  })

  it('refuses text that was only ever markup', async () => {
    // ### on its own strips to nothing, and sharing an empty bubble is worse
    // than saying it could not be done
    expect(await sendWork('x', '###\n\n---\n')).toBe('failed')
  })
})
