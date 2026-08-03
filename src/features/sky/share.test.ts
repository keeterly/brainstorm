// What leaves the app when you hand a thought to somebody. They are in a
// message app and have never heard of this one, so it has to read as writing
// rather than as a record with empty fields in it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handOver, shareText, shareTitle } from './share'

describe('a thought, as something you could paste into a message', () => {
  it('is one line when there is one line', () => {
    expect(shareText({ title: 'Order care labels' })).toBe('Order care labels')
  })

  it('does not say the same sentence twice', () => {
    // a drop's body and its title are usually the same words
    expect(shareText({ title: 'Order care labels', body: 'Order care labels' })).toBe('Order care labels')
    expect(shareText({ title: 'Order care labels', body: '  Order care labels\n' })).toBe('Order care labels')
  })

  it('says the longer body when there is more of it than the title', () => {
    const out = shareText({ title: 'SS27', body: 'SS27 — the one about wax letters' })
    expect(out).toBe('SS27\n\nSS27 — the one about wax letters')
  })

  it('carries what is inside, what you know, and what it found', () => {
    const out = shareText({
      title: 'SS27 campaign',
      inside: ['Letters sealed with wax', 'Draft the buyer note'],
      answers: ['The paper is Fabriano'],
      brief: '## What I found\nHand-addressed mail is opened 4x more often.',
      sources: [{ title: 'Royal Mail', url: 'https://example.com/x' }],
    })
    expect(out).toContain('· Letters sealed with wax')
    expect(out).toContain('What I know:\n· The paper is Fabriano')
    expect(out).toContain('Hand-addressed mail')
    expect(out).toContain('· Royal Mail — https://example.com/x')
  })

  it('does not cite the sources twice', () => {
    // the agent writes its own "## Sources" at the foot of a brief, and the
    // column was appended as well — every link printed twice
    const out = shareText({
      title: 'SS27',
      brief: 'What I found.\n\n## Sources\n- [Royal Mail](https://example.com/x)',
      sources: [{ title: 'Royal Mail', url: 'https://example.com/x' }],
    })
    expect(out.match(/example\.com\/x/g)).toHaveLength(1)
    expect(out).not.toMatch(/^Sources:/m)
  })

  it('prints a link once when its title is its own url', () => {
    const out = shareText({
      title: 'SS27',
      sources: [{ title: 'https://example.com/y', url: 'https://example.com/y' }],
    })
    expect(out).toContain('· https://example.com/y')
    expect(out).not.toContain('y — https')
  })

  it('prints no heading it has nothing to put under', () => {
    const out = shareText({ title: 'A thought', inside: [], answers: [''], sources: [] })
    expect(out).toBe('A thought')
    expect(out).not.toContain('What I know')
    expect(out).not.toContain('Sources')
  })

  it('keeps the share sheet’s own title short', () => {
    expect(shareTitle('  Order   care labels ')).toBe('Order care labels')
    expect(shareTitle('x'.repeat(90))).toHaveLength(60)
  })
})

describe('handing it over', () => {
  const real = globalThis.navigator
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: real, configurable: true })
  })
  const asNavigator = (v: unknown) =>
    Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true })

  it('uses the phone’s own share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    asNavigator({ share })
    expect(await handOver('words', 'title')).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'title', text: 'words' })
  })

  it('treats swiping the sheet away as the answer it is', async () => {
    // an AbortError is somebody deciding not to send it, and the app used to
    // apologise for doing exactly what was asked
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('no'), { name: 'AbortError' }))
    const writeText = vi.fn()
    asNavigator({ share, clipboard: { writeText } })
    expect(await handOver('words', 'title')).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard rather than losing the words', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    asNavigator({ clipboard: { writeText } })
    expect(await handOver('words', 'title')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('words')
  })

  it('…including when the sheet refuses for any other reason', async () => {
    const share = vi.fn().mockRejectedValue(new Error('not allowed'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    asNavigator({ share, clipboard: { writeText } })
    expect(await handOver('words', 'title')).toBe('copied')
  })

  it('says so when it cannot do either', async () => {
    asNavigator({})
    expect(await handOver('words', 'title')).toBe('failed')
  })
})
