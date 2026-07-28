import { describe, expect, it } from 'vitest'
import { parseBlock, parseCapture } from './parse-blocks'

const NOW = new Date(2026, 6, 28, 9, 30)

describe('parseBlock', () => {
  it('heading + bullets becomes a goal with children', () => {
    const b = parseBlock('Launch campaign:\n- write brief\n- book photographer\n* pick venue', NOW)
    expect(b).not.toBeNull()
    expect(b!.title).toBe('Launch campaign')
    expect(b!.children).toEqual(['write brief', 'book photographer', 'pick venue'])
  })

  it('plain multi-line text stays one note', () => {
    const b = parseBlock('Just a thought\nthat continues here', NOW)
    expect(b!.children).toEqual([])
    expect(b!.body).toBe('Just a thought\nthat continues here')
  })

  it('NL date on the first line applies to the block', () => {
    const b = parseBlock('Order fabric by friday\n- call vendor\n- confirm colors', NOW)
    expect(b!.due).toBe('2026-07-31')
    expect(b!.title).toBe('Order fabric')
  })

  it('empty input returns null', () => {
    expect(parseBlock('   \n  ', NOW)).toBeNull()
  })
})

describe('parseCapture', () => {
  it('blank lines split independent blocks', () => {
    const blocks = parseCapture('first thought\n\nSecond plan:\n- step one\n\nthird', NOW)
    expect(blocks).toHaveLength(3)
    expect(blocks[0].children).toEqual([])
    expect(blocks[1].children).toEqual(['step one'])
    expect(blocks[2].body).toBe('third')
  })
})
