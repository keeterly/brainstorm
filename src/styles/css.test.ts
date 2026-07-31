import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every stylesheet in the app, read as text.
//
// There is a class of CSS bug the browser will not tell you about and no test
// that renders a component will catch either: a declaration the parser judges
// invalid is silently dropped, and what you get is the property's initial
// value. Nothing errors. The element simply renders without the thing you
// wrote, and it can do that for months.
//
// It did. `radial-gradient(circle 11% at …)` is invalid — a circle's radius in
// a radial gradient may only be a length, never a percentage — and because one
// bad layer invalidates the whole `background` shorthand, every drop in the
// sky and every button in the app rendered with no body at all. Measured at a
// contrast of 1.00 against the night sky: the border was the only thing
// holding a drop on the screen.
//
// So the stylesheets get read.
function sheets(): { file: string; css: string }[] {
  const out: { file: string; css: string }[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.css')) out.push({ file: full, css: readFileSync(full, 'utf8') })
    }
  }
  walk('src')
  return out
}

const all = sheets()

describe('the stylesheets say what they mean', () => {
  it('finds some to check', () => {
    expect(all.length).toBeGreaterThan(2)
  })

  it('never sizes a circular gradient in per cent', () => {
    // the bug above, and the only reason this file exists
    for (const { file, css } of all) {
      const bad = [...css.matchAll(/radial-gradient\(\s*circle\s+[\d.]+%/g)].map((m) => m[0])
      expect(bad, `${file} — a circle's radius must be a length; use "ellipse N% N%"`).toEqual([])
    }
  })

  it('never gives a circular gradient two radii either', () => {
    // the opposite slip: two values is an ellipse, and `circle 20px 20px` is
    // just as invalid and just as silent
    for (const { file, css } of all) {
      const bad = [...css.matchAll(/radial-gradient\(\s*circle\s+[\d.]+(?:px|%)\s+[\d.]+(?:px|%)/g)].map((m) => m[0])
      expect(bad, `${file} — two radii means ellipse`).toEqual([])
    }
  })

  it('closes every block it opens', () => {
    // a stray brace silently swallows whatever follows it to the end of the
    // file, which is how a whole section of a stylesheet goes missing
    for (const { file, css } of all) {
      const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const open = (stripped.match(/\{/g) ?? []).length
      const close = (stripped.match(/\}/g) ?? []).length
      expect(close, `${file} — unbalanced braces`).toBe(open)
    }
  })

  it('leaves no declaration without its semicolon before a closing brace', () => {
    for (const { file, css } of all) {
      const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
      // "…: value }" with no ; — the last declaration in a block is legal CSS
      // but is where a later paste loses its terminator
      const bad = [...stripped.matchAll(/:[^;{}\n]+\n\s*\}/g)].length
      expect(bad, `${file} — a declaration is missing its semicolon`).toBe(0)
    }
  })
})

// Two rules make press-and-hold on a list row possible at all, and both are
// invisible: nothing renders differently when either is missing, and the
// failure only shows up under a thumb on an actual phone. They are worth
// pinning because the temptation to "tidy" them is real.
describe('picking a row up off a list', () => {
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')

  it('still lets the list scroll while it waits for the hold', () => {
    // `touch-action: none` on the row would win the drag and lose the scroll:
    // the list would simply stop moving under a finger.
    expect(sky).toMatch(/\.sky-page \.pans \.row \{ touch-action: pan-y; \}/)
  })

  it('keeps the magnifier off the words until you are actually typing in them', () => {
    // A long press inside an *editable* element belongs to iOS's selection UI
    // whatever the stylesheet says — form controls are special-cased, which is
    // why the first attempt at this did nothing on the phone. The row's field
    // is `readonly` until tapped, and these two rules hang off that: read-only
    // text is ordinary text and obeys user-select; a field you are actually in
    // behaves like a field, magnifier included.
    const idle = sky.slice(sky.indexOf('.sky-page .pans .row .t[readonly]'))
    expect(idle).toMatch(/-webkit-user-select: none/)
    expect(idle).toMatch(/-webkit-touch-callout: none/)
    const live = sky.slice(sky.indexOf('.sky-page .pans .row .t:not([readonly])'))
    expect(live).toMatch(/-webkit-user-select: text/)
    expect(live).toMatch(/user-select: text/)
  })

  it('has no handle left to press', () => {
    expect(sky).not.toMatch(/\.grip/)
  })
})

// Forty-four points, held in place.
//
// The whole group page was measured with a hit-testing probe against Apple's
// 44pt floor and came back with 38 of 41 targets under it — the tick at 38,
// the take-out at 30, the field at 40, Select at 24 of reachable height. All
// of them look deliberate on a screenshot, and all of them are a coin toss
// under a thumb.
//
// These are pinned as text because nothing else can see them. jsdom computes
// no layout, the browser reports the painted box rather than the reachable
// one, and every number here is the kind a later tidy-up shaves by two without
// noticing. The probe that found them lives outside the repo and does not run
// in CI; this is what is left when it is not looking.
describe('somewhere to put a thumb', () => {
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')
  const block = (sel: string) => {
    const i = sky.indexOf(sel + ' {')
    expect(i, `${sel} — no such rule`).toBeGreaterThan(-1)
    return sky.slice(i, sky.indexOf('}', i))
  }

  it('gives the tick, the thumbnail and the field their 44', () => {
    expect(block('.sky-page .pans .row .tick')).toMatch(/width: 44px;\s*height: 44px/)
    expect(block('.sky-page .pans .row .pic')).toMatch(/width: 44px;\s*height: 44px/)
    expect(block('.sky-page .pans .row .t')).toMatch(/min-height: 44px/)
  })

  it('gives the close, the tools and the danger buttons theirs', () => {
    expect(block('.sky-page .x')).toMatch(/width: 44px;\s*height: 44px/)
    expect(block('.sky-page .tool')).toMatch(/width: 44px;\s*height: 44px/)
    expect(block('.sky-page .pans .danger .d')).toMatch(/min-height: 44px/)
  })

  it('grows the quiet controls without growing how loud they look', () => {
    // A take-out is a secondary act; a 44pt pill on every row would shout it.
    // So it keeps the size it looks and grows the size it is, via a
    // transparent centred overlay.
    const exp = sky.slice(sky.indexOf('.sky-page .pans .row .out::after'))
    expect(exp).toMatch(/width: max\(100%, 44px\)/)
    expect(exp).toMatch(/height: max\(100%, 44px\)/)
    expect(exp).toMatch(/transform: translate\(-50%, -50%\)/)
  })

  it('positions the hosts of those overlays', () => {
    // Load-bearing, and silent when missing: a percentage width on an
    // absolutely positioned box resolves against its *containing block*, so an
    // expander on a static host quietly becomes as wide as the whole row and
    // swallows every other control in it. That is not a hypothetical — it
    // happened, and it made the tick and the field unhittable.
    const hosts = sky.slice(sky.indexOf('.sky-page .pans .row .out,'))
    expect(hosts.slice(0, 160)).toMatch(/position: relative/)
  })

  it('gives the header band the height its button needs', () => {
    // Select used to hang out of a 16px band on a negative margin, so its
    // touch area overlapped the name field above and the first row below.
    const head = block('.sky-page .pans .lab.head')
    expect(head).toMatch(/min-height: 44px/)
    expect(head).toMatch(/align-items: center/)
    expect(block('.sky-page .pans .lab.head .sel')).not.toMatch(/margin: -7px/)
  })

  it('keeps one row of targets out of the next row of them', () => {
    // The rows are the densest thing in the app and the place where a miss is
    // expensive: you tick off the wrong step, or take out the row above the
    // one you meant. This padding is the gutter between them.
    expect(block('.sky-page .pans .row')).toMatch(/padding: 5px 0/)
  })
})
