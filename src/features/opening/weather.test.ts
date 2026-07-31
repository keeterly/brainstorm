import { describe, expect, it } from 'vitest'
import { readWeather } from './Opening'

const t = (id: string, type: string, status = 'open') => ({ id, type, status })
const part = (from_id: string, to_id: string) => ({ type: 'part_of', from_id, to_id })

describe('what state your thinking is in', () => {
  it('counts what is waiting on you, what is shapeless, and what has taken a shape', () => {
    const thoughts = [
      t('a1', 'action'),
      t('a2', 'task'),
      t('g1', 'goal'),
      t('i1', 'idea'),
      t('i2', 'idea'),
    ]
    // g1 holds i2, so g1 is under way and i2 is inside it
    const rels = [part('i2', 'g1')]
    expect(readWeather(thoughts, rels)).toEqual({ pending: 2, inWorks: 1, inThought: 2 })
  })

  it('leaves out everything that is no longer open', () => {
    const thoughts = [t('a1', 'action'), t('a2', 'action', 'done'), t('a3', 'action', 'archived')]
    expect(readWeather(thoughts, []).pending).toBe(1)
  })

  it('says nothing at all about an empty account', () => {
    // three zeroes is worse than no moment; the caller checks for this
    expect(readWeather([], [])).toEqual({ pending: 0, inWorks: 0, inThought: 0 })
  })

  it('counts each thing once, so nothing can come out negative', () => {
    // an action that also holds things satisfies two rules at once. Counting
    // them separately and subtracting to get the third is how the last number
    // goes below zero.
    const thoughts = [t('a1', 'action'), t('a2', 'action'), t('i1', 'idea')]
    const w = readWeather(thoughts, [part('x', 'a1'), part('y', 'a2')])
    expect(w).toEqual({ pending: 0, inWorks: 2, inThought: 1 })
    expect(w.pending + w.inWorks + w.inThought).toBe(3)
  })

  it('adds up to everything that is open, always', () => {
    const thoughts = [t('a', 'action'), t('b', 'task'), t('c', 'goal'), t('d', 'idea'), t('e', 'note', 'done')]
    const w = readWeather(thoughts, [part('d', 'c')])
    expect(w.pending + w.inWorks + w.inThought).toBe(4)
  })

  it('counts a group once, however much it holds', () => {
    const thoughts = [t('g1', 'goal'), t('i1', 'idea'), t('i2', 'idea'), t('i3', 'idea')]
    const rels = [part('i1', 'g1'), part('i2', 'g1'), part('i3', 'g1')]
    expect(readWeather(thoughts, rels).inWorks).toBe(1)
  })

  it('ignores a parent that is not itself open', () => {
    const thoughts = [t('g1', 'goal', 'done'), t('i1', 'idea')]
    expect(readWeather(thoughts, [part('i1', 'g1')]).inWorks).toBe(0)
  })
})
