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
    //
    // The take-out went absolute when it moved under the row, which is also a
    // containing block, so it needs nothing said about it. Select does.
    expect(sky).toMatch(/\.sky-page \.pans \.lab\.head \.sel \{\s*position: relative/)
    expect(block('.sky-page .pans .row .out')).toMatch(/position: absolute/)
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

// The take-out, put back where it belongs.
//
// It used to be an uppercase pill on every row — nine of them down the right
// of the page, the loudest thing on it and the act you reach for least, while
// tick / tap-to-type / hold-to-move had no chrome at all. Now it waits under
// the row and a swipe uncovers it.
//
// None of this is visible to a test that renders the component: jsdom lays
// nothing out, so the slide, the clip and the reveal all "pass" while doing
// nothing. What *is* checkable is that the pieces still refer to each other,
// which is where this breaks — one number in two places, and the swipe reveals
// eighty-eight pixels of a pill that is somewhere else.
describe('swiping a row to uncover its take-out', () => {
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('puts what you read on a layer that can move, and the pill outside it', () => {
    // The pill must be a sibling of `.slide`, not inside it — inside, it would
    // travel with the words and never appear.
    const row = page.slice(page.indexOf('`<div class="slide">`'), page.indexOf('`</div>`,'))
    expect(row).toMatch(/class="tick"/)
    expect(row).toMatch(/class="t"/)
    const shut = row.indexOf('`</div>` +')
    expect(shut, 'the slide is never closed').toBeGreaterThan(-1)
    expect(row.indexOf('ctl out'), 'the take-out is inside the sliding layer').toBeGreaterThan(shut)
  })

  it('drives the slide and the fade off one number', () => {
    // `--sw` is 0 shut, 1 open, and whatever the thumb says in between —
    // which is what makes tracking a finger and settling afterwards the same
    // code rather than two that have to agree.
    expect(sky).toMatch(/\.slide \{[^}]*transform: translateX\(calc\(var\(--sw\) \* var\(--reveal\) \* -1\)\)/s)
    expect(sky).toMatch(/\.row \.out \{[^}]*opacity: var\(--sw\)/s)
  })

  it('keeps the same reveal distance in the stylesheet and in the gesture', () => {
    const css = /--reveal:\s*(\d+)px/.exec(sky)
    const js = /const REVEAL = (\d+)/.exec(page)
    expect(css?.[1], 'the stylesheet has no --reveal').toBeTruthy()
    expect(js?.[1], 'wireArrange has no REVEAL').toBeTruthy()
    // they are the same distance described twice; a swipe that uncovers 88px
    // of a pill sitting 96px away is a pill you can never quite press
    expect(css?.[1]).toBe(js?.[1])
  })

  it('clips the words at the list margin, not at the row border', () => {
    // `clip-path` clips touch as well as paint, and the tick reaches
    // `--tick-out` past the row's border so that the ring lines up with the
    // margin while the button stays 44 wide. Both read the one variable.
    expect(sky).toMatch(/--tick-out: 12px/)
    expect(sky).toMatch(/margin: 0 -6px 0 calc\(var\(--tick-out\) \* -1\)/)
    expect(sky).toMatch(/clip-path: inset\(-40px -24px -40px var\(--tick-out\)\)/)
  })

  it('only clips a row that is actually moving', () => {
    // …because clipping one at rest would cut a quarter off the tick, which is
    // the most-pressed control on the page.
    const at = sky.indexOf('clip-path: inset(-40px')
    // back past the whole selector list, not just its last line
    const rule = sky.slice(sky.lastIndexOf('*/', at), at)
    expect(rule).toMatch(/\.tracking/)
    expect(rule).toMatch(/\.out-open/)
  })

  it('leaves the pill untouchable until it is showing', () => {
    expect(sky).toMatch(/\.row \.out \{[^}]*pointer-events: none/s)
    expect(sky).toMatch(/\.row\.out-open \.out \{\s*pointer-events: auto/)
  })

  it('still gives a keyboard a way in', () => {
    // A control you can only reach by swiping is one a keyboard cannot reach
    // at all. `pointer-events: none` does not stop a button being focused.
    expect(sky).toMatch(/\.row \.out:focus-visible \{[^}]*opacity: 1/s)
    expect(sky).toMatch(/\.row:has\(\.out:focus-visible\) \{\s*--sw: 1/)
    expect(page).not.toMatch(/class="ctl out"[^`]*tabindex="-1"/)
  })

  it('decides what the finger is doing in exactly one place', () => {
    // Two sources — touchmove, which arrives on time, and pointermove, which
    // the browser withholds through scroll disambiguation and then delivers in
    // a clump. While the swipe lived only in the touch handler, the pointer
    // handler's older "any movement cancels" rule threw the gesture away
    // before the swipe threshold was ever crossed, and the row never moved.
    expect(page).toMatch(/const steer = \(x: number, y: number\)/)
    expect(page).toMatch(/if \(t\) steer\(t\.clientX, t\.clientY\)/)
    expect(page).toMatch(/if \(!drag\.up\) return steer\(e\.clientX, e\.clientY\)/)
  })
})

// A photograph, opened.
//
// Two separate places threw the picture away at the exact moment you asked to
// see it bigger. Tapping a photo drop in a ring rebuilt it as a card holding
// one text node — so the bubble that had been showing the photograph became a
// wide pill saying the word "Photo". And opening its page put the picture in
// at 120px, a stamp in the corner of a screen whose entire content is that
// picture, with more of it visible in the bubble you tapped to get there.
describe('opening a photograph', () => {
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('builds the opened card round the picture, not round the word for it', () => {
    expect(page).toMatch(/const pic = imgOf\(m\)/)
    expect(page).toMatch(/<img class="big" alt="" \/>/)
    // the full-size original where there is one; the drop's small face is cut
    // for a bubble and would be soft at this size
    expect(page).toMatch(/fullOf\(m\) \?\? pic/)
  })

  it('drops a caption that only repeats the word photograph', () => {
    // every picture arrives titled "Photo" until it is renamed, and a caption
    // saying "photo" under a photo is a line of type spent on nothing
    expect(page).toMatch(/cap\.trim\(\)\.toLowerCase\(\) !== 'photo'/)
  })

  it('gives it a box sized for looking rather than for reading', () => {
    // the column width that suits a sentence is the wrong measure for a
    // picture: what you opened it for is to see it bigger
    expect(page).toMatch(/if \(picture\)\s*return \{\s*w: Math\.min\(320, W - 56\)/)
    expect(page).toMatch(/return \{ w: Math\.min\(224, W - 112\)/)
  })

  it('sets no height anywhere, so the picture keeps its own proportions', () => {
    const rule = sky.slice(sky.indexOf('.skyb.peek.picture .big'))
    expect(rule.slice(0, 320)).toMatch(/height: auto/)
    // a cap, so a tall portrait is still a thing floating in the sky rather
    // than a column filling it — set from the card in the card's own units,
    // because this lives inside the zoom and a dvh would mean something
    // different at every scale
    expect(rule.slice(0, 460)).toMatch(/max-height: var\(--picmax, 54dvh\)/)
  })

  it('cuts the picture to the blown edge rather than to a rectangle', () => {
    expect(sky).toMatch(/\.skyb\.peek\.picture \{[^}]*overflow: hidden/s)
  })

  it('leaves no glass between the picture and its own edge', () => {
    // Inset inside the card's padding, a rectangle left a strip of glass along
    // the top and a crescent at each corner where the blown curve ran wide of
    // it — and a gap between a picture and its edge does not read as a mount,
    // it reads as a mistake. The photograph takes the whole shape.
    expect(page).toMatch(/me\.style\.padding = imgOf\(m\)\s*\?\s*'0px'/)
    expect(sky).toMatch(/\.skyb\.peek\.picture \{[^}]*gap: 0/s)
  })

  it('crops a picture too tall for the cap rather than letterboxing it', () => {
    // bars inside a blob are the same gap by another name
    expect(sky).toMatch(/\.skyb\.peek\.picture \.big \{[^}]*object-fit: cover/s)
  })

  it('lays the caption on the picture instead of under it', () => {
    // a band of glass below a full-bleed photograph puts the gap straight back
    const cap = sky.slice(sky.indexOf('.skyb.peek.picture .t'))
    expect(cap.slice(0, 460)).toMatch(/position: absolute/)
    expect(cap.slice(0, 460)).toMatch(/bottom: 0/)
    // a wash of shade, so it works over a light foot as well as a dark one
    expect(cap.slice(0, 460)).toMatch(/linear-gradient\(rgba\(0, 0, 0, 0\)/)
  })

  it('gives the drop page to the picture that is the whole of the drop', () => {
    // 120px was the shared thumbnail rule, and it applied to the one page
    // where the picture is the content rather than an illustration of it
    expect(sky).toMatch(/\.sky-page\.solo \.pans \.shot img \{[^}]*max-width: none/s)
    expect(sky).toMatch(/\.sky-page\.solo \.pans \.shot img \{[^}]*max-height: 46dvh/s)
    // `contain`, not `cover`: the subject of a photograph is usually near the
    // top and cropping is how you lose it
    expect(sky).toMatch(/\.sky-page\.solo \.pans \.shot img \{[^}]*object-fit: contain/s)
  })

  it('leaves room for the list when the page has one', () => {
    expect(sky).toMatch(/\.sky-page\.group:not\(\.solo\) \.pans \.shot img \{[^}]*max-height: 24dvh/s)
  })
})

// Saying what the agent is doing.
//
// The wording and the arithmetic are argued with in working.test.ts. What is
// pinned here is that the app is actually wired to it — that the three actions
// which go away for a minute all report through one watch, that the panel it
// paints into exists, and that the two surfaces a wait can happen on read from
// the same function rather than each keeping its own sentence.
describe('what the agent is doing, while it does it', () => {
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('runs all four waits through one watch', () => {
    // deepen, draft, answer — and the fourth, picking up a run that was
    // already going before this page existed, which was the longest and least
    // legible wait in the app and had one static line for the whole of it
    expect([...page.matchAll(/watchWork\(tl,/g)].length).toBe(4)
    // and none of them keeps a hand-rolled ticker any more
    expect(page).not.toMatch(/const tick = \(\) => \{\s*if \(working !== tl\.t\.id\)/)
  })

  it('counts a picked-up run from when the run started, not from now', () => {
    // what a person means by "how long has it been" is how long the work has
    // been going, not how long this tab has been watching it
    expect(page).toMatch(/watchWork\(tl, \(\) => carried, run\.createdAt\)/)
    expect(page).toMatch(/const began = since \?\? Date\.now\(\)/)
  })

  it('has somewhere to paint it', () => {
    expect(page).toMatch(/data-sky="voiceWork"/)
    expect(page).toMatch(/data-sky="voiceBar"/)
    expect(page).toMatch(/data-sky="voiceNeeds"/)
    expect(page).toMatch(/data-sky="voiceNote"/)
  })

  it('rebuilds the list of what it is checking only when it changes', () => {
    // this paints on a one-second tick for up to a minute; replacing the same
    // three nodes sixty times is work the phone does not need to do
    expect(page).toMatch(/if \(voiceNeeds\.dataset\.said !== want\)/)
  })

  it('thickens the glass while it is a panel rather than a line', () => {
    // a five-line window onto the sky puts a drop's words through the middle
    // of the paragraph you are reading
    expect(sky).toMatch(/\.sky-voice\.busy \{[^}]*background: linear-gradient\(rgba\(9, 13, 21/s)
  })

  it('says the same thing on paper as it does on glass', () => {
    const cur = readFileSync(join('src/features/current', 'Working.tsx'), 'utf8')
    expect(cur).toMatch(/from '@\/features\/sky\/working'/)
    const page2 = readFileSync(join('src/features/current', 'CurrentPage.tsx'), 'utf8')
    // the Current kept its own sentence for the same minute; it does not now
    expect(page2).not.toMatch(/waitingWord/)
    expect(page2).toMatch(/<Working$/m)
  })
})
