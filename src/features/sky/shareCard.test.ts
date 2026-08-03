// The card is drawn on a canvas, which jsdom does not have — so what is
// tested here is the arithmetic that decides where things go and how much of
// somebody's title survives. Those are the parts that silently cut a word in
// half or stack two bubbles on top of each other.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RING_MAX, ringLayout, wrapWords } from './shareCard'

// a stand-in for text metrics: every character is ten wide
const measure = (s: string) => s.length * 10

describe('fitting a title into a bubble', () => {
  it('leaves a short one alone', () => {
    expect(wrapWords('Order care labels', 400, measure)).toEqual(['Order care labels'])
  })

  it('breaks by words, never mid-word', () => {
    const out = wrapWords('Letters sealed with wax', 100, measure)
    expect(out.length).toBeGreaterThan(1)
    for (const line of out) expect(line).not.toMatch(/^\S*…$|^\w{1,3}$/)
    expect(out.join(' ').replace('…', '')).toContain('Letters')
  })

  it('says that there was more, rather than stopping mid-sentence', () => {
    const out = wrapWords('one two three four five six seven eight nine ten', 60, measure, 2)
    expect(out).toHaveLength(2)
    expect(out[1]).toMatch(/…$/)
  })

  it('keeps the ellipsis inside the width it was given', () => {
    const out = wrapWords('aaaaaa bbbbbb cccccc dddddd', 70, measure, 1)
    expect(measure(out[0])).toBeLessThanOrEqual(70)
  })

  it('never returns nothing, because a bubble with no words is a bug', () => {
    expect(wrapWords('', 100, measure)).toEqual([''])
    expect(wrapWords('    ', 100, measure)).toEqual([''])
  })
})

describe('where the members sit', () => {
  it('puts nothing anywhere when there is nothing', () => {
    expect(ringLayout(0, 0, 0, 100)).toEqual([])
  })

  it('starts at the top, which is where the eye starts', () => {
    const [first] = ringLayout(4, 100, 100, 50)
    expect(first.x).toBeCloseTo(100)
    expect(first.y).toBeCloseTo(50)
  })

  it('spaces them evenly all the way round', () => {
    const p = ringLayout(6, 0, 0, 100)
    const gaps = p.map((q, i) => {
      const r = p[(i + 1) % p.length]
      return Math.hypot(q.x - r.x, q.y - r.y)
    })
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6)
  })

  it('keeps every one of them on the ring', () => {
    for (const q of ringLayout(RING_MAX, 30, 40, 120)) {
      expect(Math.hypot(q.x - 30, q.y - 40)).toBeCloseTo(120, 6)
    }
  })
})

// The count in the middle of the card is the whole household; the list under
// it stops at whatever the card has room for. What it must never do is stop
// quietly — a card claiming nine and showing six, with nothing said, is the
// share equivalent of losing three of somebody's things.
describe('what would not fit', () => {
  const src = readFileSync(join('src/features/sky', 'shareCard.ts'), 'utf8')

  it('counts the overflow against what was drawn, not against the cap', () => {
    // subtracting the cap printed nothing when the card ran out of room
    // *before* the cap — six rows of nine, and no "and 3 more"
    expect(src).toMatch(/const over = spec\.inside\.length - drawn/)
    expect(src).toMatch(/drawn\+\+/)
  })
})
