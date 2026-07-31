import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canShare, copyWork, sendWork, sentWord } from './send'

const share = vi.fn()
const write = vi.fn()

beforeEach(() => {
  share.mockReset().mockResolvedValue(undefined)
  write.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
})

describe('getting the work out of the app', () => {
  it('hands it to the phone, with a subject line', async () => {
    expect(await sendWork('The buyer note', '# The buyer note\n\nDear Ana,')).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'The buyer note', text: '# The buyer note\n\nDear Ana,' })
  })

  it('says nothing when they open the sheet and change their mind', () => {
    // Cancelling throws AbortError. It is the commonest outcome of opening a
    // share sheet, and reporting it as a failure would be the app telling you
    // off for a decision you just made.
    expect(sentWord('cancelled')).toBeNull()
  })

  it('does not fall through to the clipboard on a cancel', async () => {
    share.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
    expect(await sendWork('x', 'body')).toBe('cancelled')
    expect(write).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when the sheet itself breaks', async () => {
    share.mockRejectedValueOnce(new Error('not allowed'))
    expect(await sendWork('x', 'body')).toBe('copied')
    expect(write).toHaveBeenCalledWith('body')
  })

  it('uses the clipboard where there is no share sheet — most desktops', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true })
    expect(canShare()).toBe(false)
    expect(await sendWork('x', 'body')).toBe('copied')
  })

  it('refuses to send nothing', async () => {
    expect(await sendWork('x', '   \n  ')).toBe('failed')
    expect(await copyWork('')).toBe('failed')
    expect(share).not.toHaveBeenCalled()
  })

  it('says what happened, in words a person would use', () => {
    expect(sentWord('shared')).toBe('sent')
    expect(sentWord('copied')).toContain('paste it')
    expect(sentWord('failed')).toContain('could not')
  })
})
