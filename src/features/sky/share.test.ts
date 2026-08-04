// What leaves the app when you hand a thought to somebody. They are in a
// message app and have never heard of this one, so it has to read as writing
// rather than as a record with empty fields in it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handOver, plainText, shareText, shareTitle } from './share'

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

// The agent writes markdown and a message bubble does not read it. What went
// out was raw: "# The wall is about mass without edges", "- **a single dark
// form**". That is not a thought you shared, it is a file you leaked.
describe('the agent’s markdown, as something a person reads', () => {
  it('takes the hashes off headings but keeps the words', () => {
    expect(plainText('# The wall is about mass\n\n## What runs through it')).toBe(
      'The wall is about mass\n\nWhat runs through it',
    )
  })

  it('uses the one bullet this app uses everywhere', () => {
    expect(plainText('- a single dark form\n* another\n+ a third')).toBe('· a single dark form\n· another\n· a third')
  })

  it('drops emphasis rather than printing its asterisks', () => {
    expect(plainText('- **a single dark form**, seated or *standing*')).toBe('· a single dark form, seated or standing')
    expect(plainText('__loud__ and `code`')).toBe('loud and code')
  })

  it('turns a link into words somebody can act on', () => {
    expect(plainText('See [Royal Mail](https://example.com/x) for this')).toBe(
      'See Royal Mail (https://example.com/x) for this',
    )
  })

  it('keeps numbered steps numbered, because the order is the point', () => {
    expect(plainText('1. Buy two rolls\n2. Shoot the test')).toBe('1. Buy two rolls\n2. Shoot the test')
  })

  it('leaves nothing where a rule or an image was', () => {
    expect(plainText('one\n\n---\n\n![a picture](x.png)\n\ntwo')).toBe('one\n\ntwo')
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

  it('sends the picture when the phone will take one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })
    asNavigator({ share, canShare: () => true })
    expect(await handOver('words', 'title', png)).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'title', text: 'words', files: [png] })
  })

  it('sends the words alone when it will not', async () => {
    // canShare answers about the payload, not in general — desktop Chrome
    // shares text and refuses files, and a sheet that then rejects the card
    // is a spinner and an apology
    const share = vi.fn().mockResolvedValue(undefined)
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })
    asNavigator({ share, canShare: () => false })
    expect(await handOver('words', 'title', png)).toBe('shared')
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

describe('a list you hand over says which of it is still to do', () => {
  /*
   * Shared as-is, "To do list for today" arrived as nine identical bullets —
   * two of which were finished. The picture drew those two struck through; the
   * words did not, and the words are what gets read. Somebody chases the car
   * that was already tinted.
   */
  const list = {
    title: 'To do list for today',
    inside: [
      'Reply to Labbye',
      'Send Jonathan press folder',
      { title: 'Follow up with Alicia regarding custom pieces', done: true },
      { title: 'Get car tinted', done: true },
    ],
  }

  it('keeps what is finished out of the run of things to do', () => {
    const out = shareText(list)
    const upto = out.slice(0, out.indexOf('Already done:'))
    expect(upto).toContain('· Reply to Labbye')
    expect(upto).not.toContain('Get car tinted')
  })

  it('does not silently drop it either', () => {
    // a share that quietly omits two of nine is one you cannot trust to be the
    // whole list, and "did you get to the car?" is the worse conversation
    const out = shareText(list)
    expect(out).toContain('Already done:')
    expect(out).toContain('· Get car tinted')
    expect(out).toContain('· Follow up with Alicia regarding custom pieces')
  })

  it('says nothing about finishing when nothing is finished', () => {
    expect(shareText({ title: 'x', inside: ['a', 'b'] })).not.toContain('Already done')
  })

  it('still treats a plain string as something to do', () => {
    // every existing caller passes strings, and a share that quietly moved
    // them all under "already done" would be worse than the bug
    expect(shareText({ title: 'x', inside: ['a'] })).toContain('· a')
  })

  it('is only the finished list when all of it is finished', () => {
    const out = shareText({ title: 'x', inside: [{ title: 'a', done: true }] })
    expect(out).toContain('Already done:')
    expect(out.match(/· a/g)?.length).toBe(1)
  })
})
