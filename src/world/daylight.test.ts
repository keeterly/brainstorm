import { describe, expect, it } from 'vitest'
import { daylightAt, tickDaylight } from './daylight'

const at = (h: number, m = 0) => {
  const d = new Date(2026, 6, 29, h, m, 0)
  return daylightAt(d)
}

describe('daylight', () => {
  it('names the hours the way a person would', () => {
    expect(at(3).name).toBe('night')
    expect(at(6).name).toBe('dawn')
    expect(at(9).name).toBe('morning')
    expect(at(13).name).toBe('midday')
    expect(at(17).name).toBe('afternoon')
    expect(at(20).name).toBe('evening')
    expect(at(23).name).toBe('night')
  })

  it('is warm at either end of the day and cool in the middle', () => {
    expect(at(6).warm).toBeGreaterThan(at(12).warm)
    expect(at(19).warm).toBeGreaterThan(at(12).warm)
    expect(at(12).warm).toBeLessThan(0.3)
  })

  it('lifts the sky at midday and lets it fall at night', () => {
    const lum = (c: [number, number, number]) => c[0] + c[1] + c[2]
    expect(lum(at(12).top)).toBeGreaterThan(lum(at(2).top))
    expect(lum(at(12).horizon)).toBeGreaterThan(lum(at(2).horizon))
  })

  it('drifts continuously — no visible switch between hours', () => {
    // a minute apart must never move a channel by more than a step or two
    for (let h = 0; h < 24; h++) {
      const a = at(h, 59)
      const b = at((h + 1) % 24, 0)
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(a.top[i] - b.top[i])).toBeLessThanOrEqual(3)
        expect(Math.abs(a.water[i] - b.water[i])).toBeLessThanOrEqual(3)
      }
    }
  })

  it('wraps around midnight without a jump', () => {
    const before = at(23, 59)
    const after = at(0, 0)
    expect(Math.abs(before.top[2] - after.top[2])).toBeLessThanOrEqual(3)
  })
})

describe('the hour the whole app takes', () => {
  const warmth = (c: [number, number, number]) => c[0] - c[2]
  it('turns orange as the sun goes down and blue while you work', () => {
    expect(warmth(at(19).accent)).toBeGreaterThan(80) // sunset: firmly warm
    expect(warmth(at(12).accent)).toBeLessThan(-80) // midday: firmly cool
    expect(warmth(at(9).accent)).toBeLessThan(-80) // morning: light blue
    expect(warmth(at(2).accent)).toBeLessThan(-80) // night: indigo
  })
  it('passes through gold on the way from midday to sunset', () => {
    expect(warmth(at(16).accent)).toBeGreaterThan(warmth(at(12).accent))
    expect(warmth(at(19).accent)).toBeGreaterThan(warmth(at(16).accent))
  })
  it('is never the same colour at breakfast as at dinner', () => {
    const d = at(8).accent
    const e = at(19).accent
    expect(Math.abs(d[0] - e[0]) + Math.abs(d[2] - e[2])).toBeGreaterThan(150)
  })
  it('brightens toward noon and falls away after it', () => {
    expect(at(12).lift).toBeGreaterThan(at(8).lift)
    expect(at(8).lift).toBeGreaterThan(at(5).lift)
    expect(at(12).lift).toBeGreaterThan(at(17).lift)
    expect(at(17).lift).toBeGreaterThan(at(21).lift)
    expect(at(2).lift).toBe(0)
    // and the room really is lighter, not just differently coloured
    const lum = (c: [number, number, number]) => c[0] + c[1] + c[2]
    expect(lum(at(12).ground)).toBeGreaterThan(lum(at(2).ground) * 3)
    expect(lum(at(12).surface)).toBeGreaterThan(lum(at(2).surface) * 1.8)
  })
  it('stays a dark interface at every hour — midday is a lit room, not a white screen', () => {
    for (let h = 0; h < 24; h++) {
      const s = at(h)
      expect(s.ground[0] + s.ground[1] + s.ground[2], `ground at ${h}:00`).toBeLessThan(130)
      expect(s.surface[0] + s.surface[1] + s.surface[2], `surface at ${h}:00`).toBeLessThan(220)
    }
  })
  it('drifts continuously, and around midnight, like everything else', () => {
    for (let h = 0; h < 24; h++) {
      const a = at(h, 59)
      const b = at((h + 1) % 24, 0)
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(a.accent[i] - b.accent[i])).toBeLessThanOrEqual(4)
        expect(Math.abs(a.ground[i] - b.ground[i])).toBeLessThanOrEqual(3)
      }
    }
  })
})

describe('publishing the hour', () => {
  const read = (k: string) => document.documentElement.style.getPropertyValue(k)
  it('writes the palette every view already draws with', () => {
    tickDaylight(new Date(2026, 6, 29, 19, 0, 0))
    for (const k of ['--accent-rgb', '--accent', '--water', '--ground', '--glass', '--sheet', '--line', '--ink', '--ink-soft', '--drop-glow']) {
      expect(read(k), k).not.toBe('')
    }
  })
  it('moves the accent the whole app is drawn with as the day turns', () => {
    tickDaylight(new Date(2026, 6, 29, 12, 0, 0))
    const midday = read('--accent-rgb')
    tickDaylight(new Date(2026, 6, 29, 19, 0, 0))
    const sunset = read('--accent-rgb')
    expect(sunset).not.toBe(midday)
    expect(sunset.split(',').map(Number)[0]).toBeGreaterThan(midday.split(',').map(Number)[0])
  })
  it('keeps body text readable however warm the light gets', () => {
    for (const h of [2, 6, 9, 12, 16, 19, 22]) {
      tickDaylight(new Date(2026, 6, 29, h, 0, 0))
      const ink = read('--ink').match(/\d+/g)!.map(Number)
      // near-white at every hour: the light tints it, it never dims
      expect(Math.min(...ink), `ink at ${h}:00`).toBeGreaterThan(228)
    }
  })

  // The room brightening is only safe if the type survives it, so measure the
  // real thing rather than trusting the anchors to have been chosen well.
  const chan = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const lum = (c: number[]) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2])
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const nums = (k: string) => read(k).match(/\d+/g)!.map(Number).slice(0, 3)

  it('holds its contrast at every hour, however bright the room gets', () => {
    for (let h = 0; h < 24; h++) {
      tickDaylight(new Date(2026, 6, 29, h, 0, 0))
      const ink = nums('--ink')
      const soft = nums('--ink-soft')
      for (const bg of ['--ground', '--glass-solid']) {
        expect(ratio(ink, nums(bg)), `--ink on ${bg} at ${h}:00`).toBeGreaterThan(7)
        expect(ratio(soft, nums(bg)), `--ink-soft on ${bg} at ${h}:00`).toBeGreaterThan(4.5)
      }
    }
  })
  it('lifts the frame off the world at noon and closes it back in at night', () => {
    tickDaylight(new Date(2026, 6, 29, 12, 0, 0))
    const noon = Number(/([\d.]+)\)$/.exec(read('--sky-vignette'))![1])
    tickDaylight(new Date(2026, 6, 29, 2, 0, 0))
    const night = Number(/([\d.]+)\)$/.exec(read('--sky-vignette'))![1])
    expect(noon).toBeLessThan(night)
  })
  it('keeps the writing page readable now that it is no longer near-white', () => {
    for (let h = 0; h < 24; h++) {
      tickDaylight(new Date(2026, 6, 29, h, 0, 0))
      const paper = nums('--paper')
      // it is paper, not a lightbox: well below white at every hour
      expect(lum(paper), `paper at ${h}:00`).toBeLessThan(0.78)
      expect(ratio(nums('--paper-ink'), paper), `page ink at ${h}:00`).toBeGreaterThan(7)
      expect(ratio(nums('--paper-soft'), paper), `page's quiet text at ${h}:00`).toBeGreaterThan(4.5)
    }
  })
  it('softens the page without letting it go grey — it still reads as light', () => {
    tickDaylight(new Date(2026, 6, 29, 12, 0, 0))
    // brighter than any surface in the dark world it opens out of
    expect(lum(nums('--paper'))).toBeGreaterThan(lum(nums('--glass-solid')) * 8)
  })
  it('lets the glass drops lift with the room instead of staying at midnight', () => {
    tickDaylight(new Date(2026, 6, 29, 2, 0, 0))
    const night = lum(nums('--drop-body-hi'))
    tickDaylight(new Date(2026, 6, 29, 12, 0, 0))
    expect(lum(nums('--drop-body-hi'))).toBeGreaterThan(night)
  })
})
