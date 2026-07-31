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
    // A long press inside a text field belongs to iOS's selection UI. The row
    // can only claim that gesture while the field is not focused — and has to
    // hand it straight back the moment it is, or you could never select a word
    // you were editing.
    const idle = sky.slice(sky.indexOf('.sky-page .pans .row .t {\n  -webkit-user-select'))
    expect(idle).toMatch(/-webkit-user-select: none/)
    expect(idle).toMatch(/-webkit-touch-callout: none/)
    const onFocus = sky.slice(sky.indexOf('.sky-page .pans .row .t:focus'))
    expect(onFocus).toMatch(/-webkit-user-select: text/)
    expect(onFocus).toMatch(/user-select: text/)
  })

  it('has no handle left to press', () => {
    expect(sky).not.toMatch(/\.grip/)
  })
})
