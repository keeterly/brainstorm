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

/**
 * Whether a rule sits inside a `prefers-reduced-motion: no-preference` guard.
 *
 * Walks back from the rule to the nearest unclosed `@media`, so it does not
 * care how many guarded blocks the file has or what order they are in — which
 * is exactly what broke the first version of this check.
 */
function guarded(css: string, rule: string): boolean {
  const at = css.indexOf(rule)
  if (at < 0) return false
  const before = css.slice(0, at)
  const open = before.lastIndexOf('@media')
  if (open < 0) return false
  // a block that has already closed between the @media and the rule means the
  // rule is not inside it
  const between = before.slice(open)
  if ((between.match(/\{/g) ?? []).length <= (between.match(/\}/g) ?? []).length) return false
  return /prefers-reduced-motion:\s*no-preference/.test(css.slice(open, open + 80))
}


/**
 * A stylesheet with its comments taken out.
 *
 * For asserting that something is *absent*. Prose explaining why a declaration
 * was removed necessarily contains that declaration, so a negative match over
 * the raw file fails on exactly the file that satisfies it — which has now
 * happened twice here, once for a margin and once for a pointer-events.
 */
const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

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

  it('gives a reading of your question the room of a sentence, not of a pill', () => {
    // These are three ways of finishing what you started asking, so they are
    // full-width lines you read — a row of capsules reads as a menu you have
    // to choose from, and the writing box above them is still the real reply.
    const pick = block('.sky-page .pans .pick')
    expect(pick).toMatch(/min-height: 44px/)
    expect(pick).toMatch(/text-align: left/)
    expect(pick).toMatch(/width: 100%/)
  })

  it('gives the wall two real columns rather than a multicol', () => {
    // Not fussiness. `columns: 2` inside a scrolling flex container takes its
    // height from the container rather than from its own content, so the wall
    // rendered past the bottom of the page and the last cards floated over the
    // sky with the paper ending above them. Two flex columns filled in code
    // scroll, because the content really is that tall.
    const wall = block('.sky-page .pans .wall')
    expect(wall).toMatch(/display: flex/)
    expect(wall).not.toMatch(/columns:/)
    expect(block('.sky-page .pans .wall .col')).toMatch(/flex-direction: column/)
  })

  it('keeps the wall keep-mark reachable without making it loud', () => {
    // A wall is for looking at, so `keep it` is a mark in the corner of the
    // picture rather than a pill with a word in it — and it grows the size it
    // *is* rather than the size it looks, the same trick the take-out uses.
    const save = block('.sky-page .pans .find .save')
    expect(save).toMatch(/width: 30px/)
    const grow = sky.slice(sky.indexOf('.sky-page .pans .find .save::after'))
    expect(grow).toMatch(/width: 44px/)
    expect(grow).toMatch(/height: 44px/)
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
    // the two swipe pills share one block now; the selector list ends at .away
    expect(block('.sky-page .pans .row .away')).toMatch(/position: absolute/)
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
    // code rather than two that have to agree. Both pills fade off it.
    expect(sky).toMatch(/\.slide \{[^}]*transform: translateX\(calc\(var\(--sw\) \* var\(--reveal\) \* -1\)\)/s)
    expect(sky).toMatch(/\.row \.away \{[^}]*opacity: var\(--sw\)/s)
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

  it('leaves both pills untouchable until they are showing', () => {
    expect(sky).toMatch(/\.row \.away \{[^}]*pointer-events: none/s)
    expect(sky).toMatch(/\.row\.out-open \.out,\n\.sky-page \.pans \.row\.out-open \.away \{\s*pointer-events: auto/)
  })

  it('still gives a keyboard a way in', () => {
    // A control you can only reach by swiping is one a keyboard cannot reach
    // at all. `pointer-events: none` does not stop a button being focused.
    expect(sky).toMatch(/\.row \.out:focus-visible,\n\.sky-page \.pans \.row \.away:focus-visible \{[^}]*opacity: 1/s)
    expect(sky).toMatch(/\.row:has\(\.away:focus-visible\) \{\s*--sw: 1/)
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
// The top of the glass is not the top of the screen.
//
// On an installed PWA the first fifty-nine pixels belong to iOS — the clock,
// the signal, the battery — and every gesture in the sky that reaches for the
// top adds `sat()` to find the real edge. One function did not: `bringIntoView`,
// whose whole documented job is to bring the thing you are reading fully onto
// the glass, had a bare `ceil = 68`. Nine pixels of clearance. A photograph
// opened near the top of a group came up under the clock with a third of the
// picture off the screen, which is what it looked like on the phone.
//
// The floor of the same function was already right — `waterlineY()` measures
// the tab bar and the safe area off the DOM — so one end of it knew about the
// notch and the other did not. That asymmetry is the thing to pin.
describe('what you are reading stays on the glass', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('measures the ceiling from below the status bar', () => {
    const fn = page.slice(page.indexOf('function bringIntoView'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body).toMatch(/const ceil = sat\(\)/)
  })

  it('still measures the floor from the water, which already knows', () => {
    const fn = page.slice(page.indexOf('function bringIntoView'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body).toMatch(/const floor = waterlineY\(\)/)
  })

  it('moves the camera and never the card', () => {
    // the card opens where it stood; moving it to fix the framing is the one
    // thing it must not do, or reading a thing relocates it
    const fn = page.slice(page.indexOf('function bringIntoView'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body).toMatch(/camTarget = \{/)
    expect(body).not.toMatch(/\bp\.y \+?=/)
    expect(body).not.toMatch(/\bp\.x \+?=/)
  })
})

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

  it('runs every long wait through one watch', () => {
    // deepen, draft, answer, finding more like a picture — and the one that
    // picks up a run already going before this page existed, which was the
    // longest and least legible wait in the app and had one static line for
    // the whole of it
    expect([...page.matchAll(/watchWork\(tl,/g)].length).toBe(5)
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

// Opening the app.
//
// Three faults in one moment. The background arrived a beat behind the app —
// the hour's colours are custom properties written from inside an effect,
// which runs after the browser has already painted once, so it opened in the
// fallback palette and snapped. The sheet itself waited for the graph and only
// then covered the screen, which meant watching the sky paint and then having
// a full-screen panel dropped over it. And what it finally said was three
// counts with nothing under them: true, and no use.
describe('the first breath', () => {
  const css = readFileSync(join('src/features/opening', 'opening.css'), 'utf8')
  const main = readFileSync('src/main.tsx', 'utf8')
  const open = readFileSync(join('src/features/opening', 'Opening.tsx'), 'utf8')

  it('sets the hour before the first frame instead of after it', () => {
    // measured: without this the first painted frame is #04050a and cyan, and
    // it snaps to the hour's own ground and accent once the effect runs
    expect(main).toMatch(/tickDaylight\(\)/)
    expect(main.indexOf('tickDaylight()')).toBeLessThan(main.indexOf('createRoot'))
  })

  it('holds the name still while the rest arrives under it', () => {
    // the numbers wait on the graph; centred, each one shunted the name upward
    // as it appeared
    expect(css).toMatch(/\.opening \{[^}]*align-items: flex-start/s)
    expect(css).toMatch(/\.opening-in \{[^}]*align-content: start/s)
  })

  it('condenses the name rather than sliding it in', () => {
    // the app's whole metaphor is vapour becoming water, and the word arrives
    // the same way: out of focus and weightless, gathering left to right
    expect(css).toMatch(/@keyframes opening-letter/)
    expect(css).toMatch(/\.opening-name span \{[^}]*filter: blur\(11px\)/s)
    expect(css).toMatch(/animation-delay: calc\(var\(--i\) \* 82ms\)/)
    // …and barely travels. Calm is less movement over more time, not more of
    // both: almost all the change is focus and light, not distance.
    expect(css).toMatch(/\.opening-name span \{[^}]*transform: translate\(calc\(var\(--i\) \* 0\.05em\), 0\.05em\) scale\(1\.05\)/s)
    // …and closes the spacing with a transform rather than a margin. A margin
    // is layout: every letter that landed reflowed the word and shifted every
    // letter after it, and the name's box visibly shrank 239px to 222px across
    // the animation. That twitch was the glitch.
    // the colon matters: without it this matches the comment that explains why
    // the margin is gone, and passes for exactly the wrong reason
    expect(css).not.toMatch(/\.opening-name span \{[^}]*margin-right:/s)
    expect(css).not.toMatch(/@keyframes opening-letter \{[^@]*margin-right:/s)
  })

  it('lets a thumb end it early', () => {
    // two seconds is right the first time you open the app today and too long
    // the fourth time
    expect(open).toMatch(/onPointerDown=\{skip\}/)
    expect(css).toMatch(/\.opening \{[^}]*pointer-events: auto/s)
    // …and stops taking touches the instant it starts to go, so the tap that
    // dismissed it is not also a tap on the sky underneath
    expect(css).toMatch(/\.opening\.leaving \{[^}]*pointer-events: none/s)
  })

  it('measures the head start from the app, not from where the block landed', () => {
    /*
     * "The title plays and that's it."
     *
     * A CSS delay counts from when the element is inserted, and these are
     * inserted when the graph lands. Written flat, a hydrate that took a second
     * and a half handed the numbers a fresh head start on top of the wait
     * already served, and they finished arriving after the dissolve had begun.
     * It looked perfect in every test here, because the demo hydrates in
     * nothing flat and the fault only appears when the network is real.
     */
    expect(css).toMatch(/animation-delay: calc\(var\(--lead, 1150ms\) \+ var\(--i\) \* 230ms\)/)
    expect(open).toMatch(/lead\.current = Math\.max\(0, LEAD_MS - since\(\)\)/)
    // …and the hold waits out whatever is left of the arrival, so the slower
    // the network the less of the moment you got — which was exactly backwards
    expect(open).toMatch(/Math\.max\(landed\.current, LEAD_MS\) \+ ARRIVE_MS \+ READ_MS/)
    // with a ceiling, so a graph that never lands cannot hold the screen
    expect(open).toMatch(/Math\.min\(CEILING_MS,/)
  })

  it('keeps a clock origin that a zero reading cannot reset', () => {
    // `performance.now()` is legitimately 0 at the very start of a document's
    // life. A falsy check re-stamped the origin on every render and left every
    // elapsed time in here permanently zero.
    expect(open).toMatch(/const born = useRef<number \| null>\(null\)/)
    expect(open).toMatch(/if \(born\.current === null\)/)
  })

  it('says what to pick up, not just how much there is', () => {
    // the same rules the Current uses, run offline on the graph as it lands
    expect(open).toMatch(/from '@\/domain\/next-action'/)
    expect(open).toMatch(/start with/)
  })
})

// The storm, made visible.
//
// A capture has always been able to be several things at once — blank lines
// split it into independent blocks, and a heading over bullets becomes a goal
// with its steps under it. That has been true since the first version of the
// page and nothing ever showed it happening: the drops were written straight
// to their final places, so they simply existed, already scattered, the
// instant the page closed. The one moment that would have taught anybody the
// app could do it was the moment being skipped.
describe('what you wrote, arriving', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('is born where you were writing rather than where it ends up', () => {
    expect(page).toMatch(/p\.rx = pf\.ox/)
    expect(page).toMatch(/p\.ry = pf\.oy/)
    // and out of nothing, at the point of the splash
    expect(page).toMatch(/p\.s = 0\.08/)
  })

  it('keeps the destination authoritative the whole way', () => {
    // `x`/`y` are where a drop belongs and `rx`/`ry` are where it is. If the
    // target were the starting point too, a layout saved mid-flight would save
    // every drop stacked on the spot it set out from.
    const born = page.slice(page.indexOf('const born = (id: string'))
    expect(born.slice(0, 300)).toMatch(/p\.x = x\s*\n\s*p\.y = y/)
  })

  it('lets them leave one at a time, and bounds the whole burst', () => {
    // a fixed gap is right for three and absurd for twenty; the point is a
    // ripple of departures, not a queue
    expect(page).toMatch(/Math\.max\(28, Math\.min\(105, 380 \/ leaving\.length\)\)/)
  })

  it('does not make anybody wait when they asked for less motion', () => {
    expect(page).toMatch(/if \(!reduced && leaving\.length > 1\)/)
  })

  it('lets a finger outrank the queue', () => {
    // catching one mid-burst should move it, not leave it pinned to the point
    // it was born at until its turn comes round
    expect(page).toMatch(/if \(!dragged && performance\.now\(\) < p\.hold\) return/)
  })

  it('rings a new goal with its own steps', () => {
    // they were not placed at all before, which is why a pool arrived looking
    // shaken rather than formed
    expect(page).toMatch(/b\.children\.forEach\(\(c, i, all\) => \{/)
    expect(page).toMatch(/gp\.x \+ Math\.cos\(a\) \* 122/)
  })

  it('does not make a lone drop appear to travel', () => {
    expect(page).toMatch(/if \(rad === 0\) p\.rx = p\.x/)
  })
})

// How wide the app is allowed to speak.
//
// Every message at the foot of the sky was sized in `vw` — the voice ran the
// full width of the glass, the recommendation was capped at 62vw, the undo bar
// at 92vw. That is a reasonable measure on a phone and a nonsense one anywhere
// else: there is no breakpoint in this app, so a monitor turned 92vw into two
// thousand pixels and a four-word greeting arrived as a bar the width of a
// desk. A line of prose has a comfortable length in *characters*; past the
// width where that is satisfied, a wider screen should simply be emptier.
describe('the width of the app’s voice', () => {
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')

  it('has one measure, and it stops growing', () => {
    expect(sky).toMatch(/--say: min\(92vw, 480px\)/)
  })

  it('sizes the voice to what it has to say', () => {
    // "welcome back" was arriving as a full-bleed bar laid across two drops,
    // because the pill was pinned to both edges whatever was in it
    expect(sky).toMatch(/\.sky-voice \{[^}]*width: max-content/s)
    expect(sky).toMatch(/\.sky-voice \{[^}]*max-width: var\(--say\)/s)
    expect(sky).not.toMatch(/\.sky-voice \{[^}]*right: 14px/s)
  })

  it('puts everything that stands in that slot in the same place', () => {
    // the voice and the recommendation swap back and forth — see paintNext —
    // so anchored left while the other was centred, the one message in this
    // place appeared to jump sideways depending on which was speaking
    expect(sky).toMatch(/\.sky-voice \{[^}]*left: 50%/s)
    expect(sky).toMatch(/\.sky-next \{[^}]*left: 50%/s)
    expect(sky).toMatch(/\.sky-voice\.show \{[^}]*transform: translateX\(-50%\)/s)
    // …and the press keeps the centring, or it jumps on touch
    expect(sky).toMatch(/\.sky-next:active \{ transform: translateX\(-50%\) scale\(0\.97\)/)
  })

  it('leaves no vw-only cap on anything that speaks', () => {
    for (const rule of ['.sky-undo {', '.sky-next {']) {
      const block = sky.slice(sky.indexOf(rule), sky.indexOf('}', sky.indexOf(rule)))
      const cap = block.match(/max-width: ([^;]+);/)?.[1] ?? ''
      expect(cap, `${rule} caps its width at ${cap}`).toMatch(/var\(--say\)|min\(/)
    }
  })
})

// Somewhere to put a thumb, on the surfaces that are not the sky.
//
// The sky and the group page were measured and fixed a while ago. The Current,
// Memory and Settings were reported clean at the same time and were not: the
// probe had navigated by URL into a demo build that mounts a MemoryRouter, so
// it changed the address bar, left the router on `/`, and measured the sky
// three more times under other names. Re-measured properly they had seventeen
// targets under the floor between them, including the tick you complete work
// with at twenty points square — on a page whose whole purpose is ticking work
// off — and three fields with no accessible name at all.
describe('a thumb on the other surfaces', () => {
  const global = readFileSync(join('src/styles', 'global.css'), 'utf8')
  const current = readFileSync(join('src/features/current', 'CurrentPage.tsx'), 'utf8')
  const memory = readFileSync(join('src/features/memory', 'MemoryPage.tsx'), 'utf8')
  const settings = readFileSync(join('src/features/settings', 'SettingsPage.tsx'), 'utf8')
  const noticed = readFileSync(join('src/features/current', 'Noticed.tsx'), 'utf8')

  it('uses the reach class the app already had', () => {
    // `.hit` has been in global.css the whole time — twenty points of ring,
    // forty-four of reach — and the Current used it precisely nowhere
    expect(current).toMatch(/aria-label="Complete"\s*\n\s*className="hit"/)
    expect(current).toMatch(/aria-label="Snooze one week"\s*\n\s*className="faint hit"/)
    expect(noticed).toMatch(/className="faint hit"/)
  })

  it('gives every disclosure in the app a reach', () => {
    // each `<summary>` is styled inline at its call site and none was given a
    // height, so they came out however tall their own text happened to be —
    // 18, 26 and 35 points, on the rows that open the only view of what the
    // app remembers about you
    expect(global).toMatch(/^summary \{ position: relative; \}/m)
    expect(global).toMatch(/summary::after \{[^}]*height: max\(100%, 44px\)/s)
  })

  it('does not switch that reach off again', () => {
    /*
     * `pointer-events: none` is what `.hit` deliberately omits: the whole job
     * of the box is to be hit. Setting it made an overlay that neither painted
     * nor caught anything, and all three summaries measured exactly as short
     * as before.
     *
     * Asserted against the *code*, with the comments taken out. A negative
     * match over raw CSS is a trap that has now caught me twice: the comment
     * saying why a declaration is gone contains the declaration, so the test
     * fails on the very file that satisfies it.
     */
    const rule = code(global).slice(code(global).indexOf('summary::after'))
    expect(rule.slice(0, rule.indexOf('}'))).not.toMatch(/pointer-events: none/)
  })

  it('names the fields a screen reader would otherwise skip', () => {
    /*
     * A placeholder is not a label: it goes the moment you type, and is
     * announced only while the field is empty.
     *
     * What is pinned is that every field carries one — not the words in it.
     * These are copy, and the last time they changed (the page stopped
     * sounding like a dossier being kept on somebody) this test failed for
     * saying nothing about accessibility at all.
     */
    for (const ph of memory.match(/placeholder="[^"]*"/g) ?? []) {
      const at = memory.indexOf(ph)
      const field = memory.slice(Math.max(0, at - 300), at + 300)
      expect(field).toMatch(/aria-label="[^"]+"/)
    }
    expect(memory).toMatch(/aria-label="What it remembers"/)
    expect(settings).toMatch(/aria-label="New password"/)
  })

  it('widens the one control that held nothing but a gear', () => {
    expect(memory).toMatch(/minWidth: 44/)
  })
})

// The quiet classify pass runs on every capture, and for months it did two
// wrong things at once. It wrote `title: output.title` — the model's rewording
// of your words, applied silently to every single thing you typed, the same
// act as the group rename that got banned, done everywhere. And it *dropped*
// `suggestedDue` on the floor: classify has always pulled "by Friday" out of
// the words, and not one line of the app read it, so a person typing "renew
// insurance by Friday" got a drop with no date and a Current that could not
// rank it. A playtest persona caught both in an afternoon.
describe('classify listens without rewording', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const fn = page.slice(page.indexOf('function classifyQuiet'))
  const body = fn.slice(0, fn.indexOf('\n  }'))

  it('keeps the words you typed as the title', () => {
    expect(body).not.toMatch(/title:/)
  })

  it('lands the date the model heard in the words', () => {
    expect(body).toMatch(/due_date: output\.suggestedDue/)
    // …but only when it heard one — spreading an empty patch, not null-ing a
    // date the person set by hand
    expect(body).toMatch(/output\.suggestedDue \?/)
  })

  it('still keeps its opinion where opinions live', () => {
    expect(body).toMatch(/summary: output\.summary/)
  })
})

// Pooling is the one drag outcome a thumb produces by accident — a pan that
// grazes a group files the thing you were carrying inside it. Finishing,
// letting go and resting all offered their way back; pooling did not, and a
// playtester spent five minutes reversing by other means what one tap should
// have. Every branch of poolTogether now offers the tap.
describe('an accidental pooling can be tapped back apart', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const fn = page.slice(page.indexOf('function poolTogether'))
  const body = fn.slice(0, fn.indexOf('\n  }\n'))

  it('offers the way back from all three ways of joining', () => {
    expect(body.match(/offerUndo\(/g)?.length).toBe(3)
  })

  it('remembers the old home before anything moves', () => {
    // captured before coalesce — after it, the positions are already the
    // meeting point and there is nothing left to go back to
    expect(body.indexOf('const wasA')).toBeGreaterThan(-1)
    expect(body.indexOf('const wasA')).toBeLessThan(body.indexOf('coalesce('))
  })

  it('unmakes a pool that existed only to hold the two of them', () => {
    expect(body).toMatch(/S\(\)\.deleteThought\(g\.id\)/)
  })

  it('does not announce a name for a pool that was unmade in flight', () => {
    expect(body).toMatch(/!S\(\)\.thoughts\.some\(\(x\) => x\.id === g\.id\)/)
  })
})

// "Where you were standing is where it goes" filed two playtesters' entire
// week inside a seeded campaign group, and neither found a way back out. The
// filing stands — writing inside a group meaning that group is right — but
// the one tap out has to be offered, and for longer than an accident gets.
describe('a capture filed into the open group offers the way out', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('offers to keep the new things loose instead', () => {
    expect(page).toMatch(/filed\.length === 1 \? 'keep it loose' : 'keep them loose'/)
  })

  it('only unhooks what this capture filed, and only from that group', () => {
    expect(page).toMatch(/if \(r && r\.to_id === into\) S\(\)\.deleteRelationship\(r\.id\)/)
  })
})

// Every offer that reverses something must expire — offerAction with no ms
// stays forever, and a select-mode take-out parked its bar over the tab bar
// for a playtester's whole session.
describe('the select-mode undo bar does not outstay the evening', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('gives put-them-back a lifetime', () => {
    const at = page.indexOf("'put them back'")
    expect(page.slice(at, at + 400)).toMatch(/9000/)
  })
})

// A drag re-decided its merge target every frame by nearest-wins, in a sky
// that moves under the finger — so a neighbour shoved closer at the last
// moment stole the merge, and a bubble brushed mid-path stayed the target
// for ever. "Aimed at one, pooled with another", as the playtest put it.
describe('what you were shown fusing is what you get', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('lets the current fuse keep the job while it still qualifies', () => {
    expect(page).toMatch(/fuse && fuse\.a === drag\.id && best && best\.t\.id !== fuse\.b/)
  })

  it('clears the target the moment the bodies part', () => {
    expect(page).toMatch(/drag\.target = touching \? best : null/)
    // …and in the no-candidate branch too, or a brush on the way to open
    // water still merges on release
    const at = page.indexOf('drag.target = touching ? best : null')
    const after = page.slice(at, at + 600)
    expect(after).toMatch(/drag\.touching = false\s*\n\s*drag\.target = null/)
  })
})

// The take-out pill is uncoverable only by an untold swipe — two playtesters
// failed at it for minutes. The first row of the first group page of a
// session performs the gesture on itself once.
describe('the drawer breathes once', () => {
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('registers --sw so the breath can travel rather than snap', () => {
    const reg = sky.slice(sky.indexOf('@property --sw'))
    expect(reg.slice(0, 140)).toMatch(/syntax: '<number>'/)
    // the row sets it, the slide and the pill read it — without inheritance
    // the registration itself would break the swipe it teaches
    expect(reg.slice(0, 140)).toMatch(/inherits: true/)
  })

  it('animates the reveal the swipe itself uses', () => {
    expect(sky).toMatch(/\.sky-page \.pans \.row\.peek \{\s*animation: out-peek/)
    expect(sky).toMatch(/@keyframes out-peek/)
  })

  it('plays once a session and yields to a finger', () => {
    expect(page).toMatch(/let taughtOut = false/)
    expect(page).toMatch(/first\.addEventListener\('pointerdown', done, \{ once: true \}\)/)
  })

  it('stays still for those who asked things to', () => {
    // located from the rule outward rather than from the first media block in
    // the file — a later no-preference guard added above it (the drops'
    // arrival) made "the first one" the wrong one and this pass silently
    expect(guarded(sky, '.sky-page .pans .row.peek {')).toBe(true)
  })
})

// After the first-ever capture the invitation bubble leaves and nothing ever
// says how to write the second thought — ten minutes of hunting, in one
// playtest. One line, once per device.
describe('the hold is taught once, right after it is learnable', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('says the line after the first capture and never again', () => {
    expect(page).toMatch(/bs-taught-hold/)
    expect(page).toMatch(/hold any empty sky when the next one comes/)
  })
})

// Capture was the app's most important act and its best-kept secret: a hold
// nobody was told about, on empty sky that fills up. The chip stands where a
// thumb can always find it, and the page it opens now says where the writing
// will land — before it lands, tappable to change.
describe('writing is no longer a secret', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')

  it('stands a write chip on the sky', () => {
    expect(page).toMatch(/data-sky="write"/)
    expect(sky).toMatch(/\.sky-write \{/)
  })

  it('steps aside for a drag, a page and the offer bar', () => {
    const rule = sky.slice(sky.indexOf('body.sky-dragging .sky-write'))
    expect(rule.slice(0, 220)).toMatch(/body\.on-paper \.sky-write/)
    expect(rule.slice(0, 220)).toMatch(/body\.sky-offering \.sky-write/)
    expect(rule.slice(0, 320)).toMatch(/pointer-events: none/)
  })

  it('shares the one slot instead of crowding it', () => {
    // two objects in the bottom band collided on a real phone into one
    // cramped mass — the pen rides the recommendation bar when it is up,
    // and the bare pill yields to either speaker
    expect(page).toMatch(/data-sky="nextPen"/)
    expect(sky).toMatch(/\.sky-next\.show ~ \.sky-write/)
    expect(sky).toMatch(/\.sky-voice\.show ~ \.sky-write/)
  })

  it('writes into the group you are standing in, like the hold', () => {
    const wire = page.slice(page.indexOf('const startWriting'))
    expect(wire.slice(0, 400)).toMatch(/const into = openPool/)
    // both homes of the pen share the one handler
    expect(page).toMatch(/writeEl\.addEventListener\('click', startWriting\)/)
    expect(page).toMatch(/nextPen\.addEventListener\('click', startWriting\)/)
  })

  it('says the destination before it lands, and lets one tap change it', () => {
    expect(page).toMatch(/data-sky="pageInto"/)
    expect(page).toMatch(/'→ loose in the sky'/)
    // the commit honours the choice — the chip is not decoration
    expect(page).toMatch(/pf\.into && !pf\.intoOff/)
  })
})

// The words obeyed "where you were standing is where it goes" from the
// start; the photo never did. Taken from a capture page opened inside a
// group, it was born loose in open sky — found floating outside "VENIA
// Design" by the person who took it inside. The photo follows the same
// rule, the same chip, and the same one-tap way out of it.
describe('a photo lands where you were standing', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const fn = page.slice(page.indexOf("pageFile.addEventListener('change'"))
  const body = fn.slice(0, fn.indexOf('\n  })'))

  it('files the photo into the open group, unless the chip was tapped', () => {
    expect(body).toMatch(/pf\?\.mode === 'capture'/)
    expect(body).toMatch(/!pf\.intoOff/)
    expect(body).toMatch(/if \(home\) S\(\)\.addRelationship\(t\.id, home, 'part_of'\)/)
  })

  it('only into a group that is still open to hold it', () => {
    expect(body).toMatch(/x\.status === 'open'/)
  })
})

// A list of twenty-five model-written steps needs "no" as much as it needs
// "done" — a step you simply did not want could only be exiled to the sky
// or lied about as a tick. The swipe now uncovers two verdicts: take out,
// and put away — the reversible one first, the heavier one at the edge.
describe('a row can be refused, not only finished or exiled', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')

  it('offers put-away beside take-out on the swipe', () => {
    expect(page).toMatch(/class="ctl away" aria-label="Put it away"/)
    expect(sky).toMatch(/\.row \.out \{ right: 92px; \}/)
  })

  it('puts it away through the same undo everything else uses', () => {
    const wire = page.slice(page.indexOf("row.querySelector('.away')"))
    expect(wire.slice(0, 260)).toMatch(/landUndo\(bin\(m\.id\)\)/)
  })

  it('wears the colour every other put-away wears', () => {
    expect(sky).toMatch(/\.row \.away \{[^}]*color: #b4534b/s)
  })
})

// Round two of the persona playtests. Five findings, five behaviours pinned.
describe('what the second playtest taught', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const flow = readFileSync(join('src/features/sky', 'groupFlow.ts'), 'utf8')
  const tabs = readFileSync(join('src/components', 'TabBar.tsx'), 'utf8')

  it('tidy cannot die silently or brick itself', () => {
    // a rejection used to skip both the failure message and the reset of the
    // in-flight flag — one bad tap and the button was dead for the session
    const wire = page.slice(page.indexOf("tidyEl.addEventListener('click'"))
    expect(wire.slice(0, 1400)).toMatch(/catch \{/)
    expect(wire.slice(0, 1400)).toMatch(/finally \{\s*\n\s*tidying = false/)
  })

  it('closing an untitled drop is not a rename', () => {
    // unchanged is judged against what the thing is called — title or its
    // own words — not against a title that was never set
    expect(flow).toMatch(/const called = \(\(t\?\.title \?\? ''\)\.trim\(\) \|\| \(t\?\.raw_content \?\? ''\)\)\.trim\(\)/)
  })

  it('tapping the tab you are on takes you back to all of it', () => {
    expect(tabs).toMatch(/dispatchEvent\(new CustomEvent\('tab-again'/)
    expect(page).toMatch(/addEventListener\('tab-again', tabAgain\)/)
    expect(page).toMatch(/removeEventListener\('tab-again', tabAgain\)/)
  })

  it('the destination chip never takes the keyboard', () => {
    expect(page).toMatch(/pageInto\.addEventListener\('pointerdown', \(e\) => e\.preventDefault\(\)\)/)
    const click = page.slice(page.indexOf("pageInto.addEventListener('click'"))
    expect(click.slice(0, 300)).toMatch(/pageT\.focus\(\)/)
  })

  it('a drop wears its due date on its face', () => {
    const fn = page.slice(page.indexOf('function paintDropEl'))
    expect(fn.slice(0, 2400)).toMatch(/humanDue\(t\.due_date, todayISO\(\)\)/)
  })

  it('tidy steps aside for the corner pill whenever it is there', () => {
    expect(page).toMatch(/'sky-resting', resting \+ aside > 0/)
  })
})

// Ana's round: the three holes in the safety net, each closed at its root.
describe('reversal is bulletproof', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')

  it('reading never writes', () => {
    // the close-commit fall-through used to catch "Done looking" and write
    // the previous page's stale field into the thing being read
    expect(page).toMatch(/pf\.tl && pf\.mode !== 'brief' && pf\.mode !== 'like' && pf\.mode !== 'aside'/)
  })

  it('the aside page can actually be tapped back from', () => {
    // its button wore the swipe pills' class, whose styling is opacity-0
    // until a swipe that page does not have
    expect(page).toMatch(/class="ctl back" data-back/)
    expect(sky).toMatch(/\.sky-page \.pans \.row \.back \{/)
    expect(page).toMatch(/row\.querySelector\('\.back'\)/)
  })

  it('a page opens onto the thing as it is now', () => {
    const fn = page.slice(page.indexOf('function openPage'))
    expect(fn.slice(0, 900)).toMatch(/if \(tl\) tl = view\.byId\.get\(tl\.t\.id\) \?\? tl/)
  })

  it('a group rests with what it holds, and comes back the same way', () => {
    const fn = page.slice(page.indexOf('function restDrop'))
    const body = fn.slice(0, fn.indexOf('\n  }\n'))
    expect(body).toMatch(/const under = household\(t\.id\)/)
    expect(body).toMatch(/for \(const id of under\) S\(\)\.updateThought\(id, \{ status: 'snoozed'/)
    expect(body).toMatch(/9000/)
  })

  it('enter commits a name instead of wounding it', () => {
    expect(page).toMatch(/if \(nameFor && e\.key === 'Enter'\)/)
  })

  it('rest wears a moon, not the steps cloud', () => {
    expect(page).toMatch(/aria-label="Let it rest until tomorrow"/)
  })
})

// The type is the most consequential fact about a thought and it was
// invisible: the Current and the sky's own suggestion consider only `action`
// and `task`, so anything classified `note` is exiled from every surface that
// answers "what next" — silently, for ever. A playtester captured six dated
// tasks, watched every one called a note, and never saw his own work
// recommended once.
describe('what this is, and one tap to disagree', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')

  it('says it as a consequence rather than as vocabulary', () => {
    // "note" is a word only this app uses; "it stays out of the Current" is
    // a claim the person can go and check
    expect(page).toMatch(/it flows in the Current/)
    expect(page).toMatch(/it stays out of the Current/)
  })

  it('turns a note into something the Current can see', () => {
    const at = page.indexOf("pageA.querySelector('.kindline')")
    const body = page.slice(at, at + 900)
    expect(body).toMatch(/S\(\)\.updateThought\(tl\.t\.id, \{ type: 'action' \}\)/)
  })

  it('remembers what it was, so turning it back is not a flattening', () => {
    const at = page.indexOf("pageA.querySelector('.kindline')")
    const body = page.slice(at, at + 900)
    expect(body).toMatch(/patchExtra\(tl\.t, \{ wasType: tl\.t\.type \}\)/)
    expect(body).toMatch(/type: was \?\? 'note'/)
  })

  it('is a control the size of the decision it makes', () => {
    const rule = sky.slice(sky.indexOf('.sky-page .pans .kindline {'))
    expect(rule.slice(0, 400)).toMatch(/min-height: 44px/)
  })

  it('offers it on a drop, never on a group', () => {
    // a group's type is what makes it a container; flipping that is a
    // different act with different consequences
    expect(page).toMatch(/tl\.kind === 'drop'\s*\n\s*\? `<button class="kindline"/)
  })
})

// Rain and ⚡ both write real thoughts into your map and neither had a way
// back but deleting them one at a time. A playtester watched two steps about
// somebody else's subject appear inside her own pile.
describe('the agent asks to keep what it added', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const fn = page.slice(page.indexOf('function declineAdded'))
  const body = fn.slice(0, fn.indexOf('\n  }\n'))

  it('offers the refusal by name and count', () => {
    expect(body).toMatch(/n === 1 \? 'not this one' : 'not these'/)
  })

  it('puts them away rather than destroying them', () => {
    // the app deletes nothing; refused work goes to the cloud like anything
    // else, and the refusal itself is reversible
    expect(body).toMatch(/ids\.map\(bin\)/)
    expect(body).toMatch(/'put them back'/)
  })

  it('lasts longer than an ordinary undo', () => {
    // a verdict on work that arrived while the phone was face-down
    expect(body).toMatch(/12000/)
  })

  it('is offered by both the rain and the ⚡', () => {
    expect(page).toMatch(/declineAdded\(\[\.\.\.view\.byId\.keys\(\)\]\.filter/)
    expect(page).toMatch(/if \(fresh\.length\) declineAdded\(fresh\)/)
  })

  it('tells what arrived apart from what was already yours', () => {
    // captured before the minute-long await, so a run that adds nothing
    // cannot offer to take away work you wrote yourself
    const deep = page.slice(page.indexOf('async function runDeepen'))
    expect(deep.slice(0, 700)).toMatch(/const hadKids = new Set\(/)
  })
})

// The opening and the sky were two clocks with nothing joining them, and in
// the losing order the curtain lifted on an empty sky and every drop appeared
// three hundred milliseconds later, at full size, together. That is the pop.
describe('the sky condenses instead of appearing', () => {
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const open = readFileSync(join('src/features/opening', 'Opening.tsx'), 'utf8')

  it('arrives the way the app’s own name arrives', () => {
    // blur to nothing and opacity coming on — see opening.css
    const kf = sky.slice(sky.indexOf('@keyframes skyb-arrive'))
    expect(kf.slice(0, 240)).toMatch(/filter: blur\(13px\)/)
    expect(kf.slice(0, 240)).toMatch(/opacity: 0/)
  })

  it('condenses out of the world’s own grain', () => {
    expect(sky).toMatch(/\.skyb\.arrive:not\(\.working\)::after/)
    expect(sky).toMatch(/@keyframes skyb-grain/)
  })

  it('never animates transform, which the frame loop owns', () => {
    // the loop writes transform on every drop on every frame; anything
    // animated there is overwritten sixty times a second
    const kf = sky.slice(sky.indexOf('@keyframes skyb-arrive'), sky.indexOf('@keyframes skyb-grain'))
    expect(kf).not.toMatch(/transform/)
  })

  it('staggers them, and stays still for those who asked it to', () => {
    expect(sky).toMatch(/animation-delay: calc\(var\(--n, 0\) \* 64ms\)/)
    expect(guarded(sky, '.skyb.arrive {')).toBe(true)
    // …and the stagger is capped, so thirty drops are weather rather than a queue
    expect(page).toMatch(/Math\.min\(9, arriving\+\+\)/)
  })

  it('becomes vapour on the frame it is first in the right place', () => {
    // marked at mount it would hold a thing standing at the field's origin
    const at = page.indexOf('if (el.style.visibility) {')
    expect(at).toBeGreaterThan(-1)
    expect(page.slice(at, at + 1400)).toMatch(/el\.classList\.add\('vapour'\)/)
    expect(sky).toMatch(/\.skyb\.vapour \{[^}]*filter: blur\(13px\)/s)
  })

  it('turns to water as the curtain goes, not behind it', () => {
    // measured before this: the whole cascade finished two and a half seconds
    // before the opening lifted, so nobody ever saw it
    const at = page.indexOf('whenCurtainLifts(() => {')
    expect(at).toBeGreaterThan(-1)
    expect(page.slice(at, at + 320)).toMatch(/remove\('vapour'\)[\s\S]*add\('arrive'\)/)
    expect(open).toMatch(/markCurtainLifting\(\)/)
  })

  it('takes the filter back off when it has landed', () => {
    const at = page.indexOf("el.classList.add('arrive')")
    expect(page.slice(at, at + 220)).toMatch(/animationend[\s\S]*remove\('arrive'\)/)
  })

  it('waits longer than the opening can possibly last', () => {
    // The behaviour is tested in ready.test.ts; what cannot be tested there is
    // that the two files agree. A fallback shorter than the opening's own hard
    // ceiling expires *during* a slow opening and plays the whole arrival
    // behind the curtain — which is precisely the bug, measured at 1200ms
    // against an opening that ran for 3.7s.
    const ready = readFileSync(join('src/features/sky', 'ready.ts'), 'utf8')
    const fallback = Number(/fallbackMs = (\d+)/.exec(ready)?.[1])
    const ceiling = Number(/CEILING_MS = (\d+)/.exec(open)?.[1])
    const fade = Number(/FADE_MS = (\d+)/.exec(open)?.[1])
    expect(fallback).toBeGreaterThan(ceiling + fade)
  })

  it('holds the curtain until there is a sky behind it', () => {
    expect(page).toMatch(/markSkyReady\(\)/)
    expect(open).toMatch(/onSkyReady\(\(\) => setPainted\(true\)\)/)
    expect(open).toMatch(/const held = painted \? 0 : CEILING_MS/)
    // …and the ceiling still wins, so a sky that never mounts cannot hang it
    expect(open).toMatch(/Math\.min\(CEILING_MS, Math\.max\(HOLD_MS, readable, held\)\)/)
  })
})

// The layout is three forces — kin drawn together, bodies held apart, the
// constellation nudged back into frame — and none of them had a state called
// "done". Measured on a sky nobody had touched for twelve seconds: forty
// pixels of wander on the worst drop, twenty-eight on the median. The drops
// were mostly moving *around* each other, which is what a force-directed
// layout does when no equilibrium exists, and it makes aiming at one a
// moving-target game.
describe('the sky finishes settling, and then stops', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('lets a pair that is near enough alone', () => {
    // the spring pulled at any distance over rest, so a pair three pixels too
    // far apart was corrected for ever — and one drop belongs to several
    // pairs whose rest lengths cannot all be true at once
    expect(page).toMatch(/const KIN_SLACK = 22/)
    expect(page).toMatch(/if \(dist > rest \+ KIN_SLACK\)/)
  })

  it('stops re-centring once the nudge is smaller than a nudge', () => {
    // asymptotic, so it never arrived: a quarter-pixel a frame walked the
    // whole constellation nine pixels across twelve seconds of nothing
    expect(page).toMatch(/Math\.abs\(dx\) > 0\.06 \|\| Math\.abs\(dy\) > 0\.06/)
  })

  it('counts what it actually moved, and calls it settled when that is nothing', () => {
    expect(page).toMatch(/const STILL = 0\.55/)
    expect(page).toMatch(/const STILL_FRAMES = 36/)
    expect(page).toMatch(/if \(moved < STILL\) \{\s*\n\s*if \(\+\+quiet >= STILL_FRAMES\) settled = true/)
  })

  it('does no layout work at all while it is settled', () => {
    // not merely a smaller force — none, including the O(n²) pair walk
    expect(page).toMatch(/for \(const pair of settled \? \[\] : allKinPairs\(\)\)/)
    expect(page).toMatch(/for \(let pass = 0; pass < \(settled \? 0 : 3\); pass\+\+\)/)
    expect(page).toMatch(/if \(!settled && view\.tls\.length && !openPool/)
  })

  it('wakes for everything that changes what the layout is of', () => {
    // the graph, the frame, the camera, and the end of any gesture
    const at = page.indexOf('const unsub = useGraph.subscribe(')
    expect(page.slice(at, at + 200)).toMatch(/stir\(\)/)
    const resize = page.indexOf('const onResize = ')
    expect(page.slice(resize, resize + 260)).toMatch(/stir\(\)/)
    const fit = page.indexOf('function fitAll(')
    expect(page.slice(fit, fit + 300)).toMatch(/stir\(\)/)
    const up = page.indexOf('const onUp = (e: PointerEvent)')
    expect(page.slice(up, up + 400)).toMatch(/stir\(\)/)
  })

  it('leaves the breath alone, because a still sky still breathes', () => {
    // breath is an offset, never a position — settling must not freeze it
    const fn = page.slice(page.indexOf('let quiet = 0'), page.indexOf('function step()'))
    expect(fn).not.toMatch(/bx|by/)
  })
})

// A group is a shell over its contents, and every gesture that moves the
// shell means the contents too — the confirmation has always read "…and the
// 5 inside". Sinking archived exactly one row, so you dropped a group into
// the sea, watched it go, and its five members were still up there: orphaned,
// loose, and looking like things you had written on purpose.
describe('a group goes with what it holds', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const body = (fn: string) => {
    const at = page.indexOf(`function ${fn}(`)
    expect(at, `${fn} — no such function`).toBeGreaterThan(-1)
    return page.slice(at, page.indexOf('\n  }\n', at))
  }

  it('walks the whole household, however deep, and cannot loop', () => {
    const h = body('household')
    expect(h).toMatch(/walk\(kid\.id\)/)
    expect(h).toMatch(/out\.includes\(kid\.id\)/)
  })

  it('takes it under with everything inside it', () => {
    const sink = body('sinkDrop')
    expect(sink).toMatch(/const under = household\(t\.id\)/)
    expect(sink).toMatch(/for \(const id of under\) S\(\)\.updateThought\(id, \{ status: 'archived' \}\)/)
  })

  it('finishes it with everything inside it', () => {
    const rise = body('riseDrop')
    expect(rise).toMatch(/const under = household\(t\.id\)/)
    expect(rise).toMatch(/for \(const id of under\) S\(\)\.updateThought\(id, \{ status: 'done'/)
  })

  it('says how many went, and brings all of them back', () => {
    for (const fn of ['sinkDrop', 'riseDrop']) {
      const b = body(fn)
      expect(b, fn).toMatch(/and the \$\{under\.length\} inside/)
      expect(b, fn).toMatch(/for \(const id of under\) S\(\)\.updateThought\(id, \{ status: 'open'/)
      // a whole household is a bigger thing to have meant than one drop
      expect(b, fn).toMatch(/under\.length \? 9000 : 6000/)
    }
  })

  it('wakes a household from the aside page whichever way it went away', () => {
    const at = page.indexOf('const wake = (t: Thought) => {')
    expect(page.slice(at, at + 420)).toMatch(
      /household\(t\.id, 'snoozed'\), \.\.\.household\(t\.id, 'archived'\)/,
    )
  })
})

// A colour on a group had coloured the shell and nothing else, which is the
// one thing a group's colour cannot mean — you mark a project so you can find
// its work, and its work stayed grey. And the first wash was measured on the
// phone as "slightly different grey": at a hundred pixels across, on a sky
// that is itself coloured all day, a tinted fill alone is a guess.
describe('a colour you can actually see, on everything it belongs to', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')

  it('finds a colour by its edge, not only by its fill', () => {
    const rule = sky.slice(sky.indexOf('.skyb[data-tint] {'), sky.indexOf('.skyb[data-tint]::before'))
    expect(rule).toMatch(/inset 0 0 0 1\.5px rgba\(var\(--tint\), 0\.95\)/)
    expect(rule).toMatch(/0 0 20px rgba\(var\(--tint\), 0\.3\)/)
  })

  it('does not leave a bright accent hairline arguing with the tint', () => {
    expect(sky).toMatch(/\.skyb\[data-tint\]::before \{[^}]*rgba\(var\(--tint\), 0\.95\) 100%/s)
  })

  it('inherits from the nearest coloured thing above it', () => {
    const fn = page.slice(page.indexOf('function effectiveTint'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    expect(body).toMatch(/const own = tintOf\(ex\(t\)\)\s*\n\s*if \(own\) return own/)
    expect(body).toMatch(/view\.parentOf\.get/)
    // …and cannot spin on a cycle rebuild is allowed to leave behind
    expect(body).toMatch(/seen\.has\(up\)/)
  })

  it('reaches a group drawn inside another group', () => {
    // nested groups are painted by their own branch rather than by
    // paintDropEl — a campaign turned iris kept a grey "References" in its ring
    const at = page.indexOf('const inner = view.kidsOf.get(m.id)?.length ?? 0')
    expect(page.slice(at, at + 400)).toMatch(/paintTint\(m, me\)/)
  })

  it('sets the thing’s own mark, while the dot shows what it wears', () => {
    // tapping a swatch toggles the thing's *own* colour; the dot in the top
    // bar shows the effective one, including a colour it only inherits —
    // because that is what you see out in the sky
    expect(page).toMatch(/patchExtra\(tl\.t, \{ tint: tintOf\(ex\(tl\.t\)\) === want \? null : want \}\)/)
    const fn = page.slice(page.indexOf('function paintTone'))
    expect(fn.slice(0, 600)).toMatch(/const shown = t \? effectiveTint\(t\) : null/)
  })
})

// Plain text is where this app's thinking goes to die: a group is a shape,
// and a bulleted list of its members says none of that. What went out also
// carried the agent's markdown raw — somebody's Messages bubble filled up
// with ## and - **.
describe('sharing hands over the picture as well as the words', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const card = readFileSync(join('src/features/sky', 'shareCard.ts'), 'utf8')

  it('draws both of the ways the app shows a group', () => {
    // the constellation, because that is what you recognise; the list,
    // because that is what you read
    expect(card).toMatch(/---- the constellation ----/)
    expect(card).toMatch(/---- and the same thing as a list ----/)
  })

  it('carries the colours into the card', () => {
    const at = page.indexOf('void drawCard({')
    const call = page.slice(at, at + 700)
    expect(call).toMatch(/tint: effectiveTint\(live\.t\)/)
    expect(call).toMatch(/tint: effectiveTint\(m\)/)
  })

  it('reads the thing as it is now, being wired once above the list', () => {
    // the top bar outlives every rebuild of the list below it, so the share
    // must re-resolve rather than close over the TL it was handed
    const fn = page.slice(page.indexOf('function shareThing'))
    expect(fn.slice(0, 300)).toMatch(/const live = view\.byId\.get\(tl\.t\.id\) \?\? tl/)
  })

  it('falls back to words when the phone will not take a picture', () => {
    const share = readFileSync(join('src/features/sky', 'share.ts'), 'utf8')
    expect(share).toMatch(/picture && canSendPicture\(picture\)/)
    // and drawing failing is not sharing failing
    expect(page).toMatch(/png \? new File\(\[png\]/)
  })
})

// Both are things you do *to* a thing rather than inside it, and both used to
// sit at the foot of the list — which on a list of seven is a scroll away,
// and the swatch row had scrolled off the top by the time you were looking at
// anything in it.
describe('the colour and the handing-over live in the top bar', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')

  it('opens along the bar rather than hanging down out of it', () => {
    // it was a column: 280 points of swatches down the middle of the screen,
    // over the list it was about, over Select, over the rows — a curtain
    expect(page).toMatch(/data-sky="pageTone"/)
    expect(page).toMatch(/data-sky="pageTones"/)
    const rule = sky.slice(sky.indexOf('.sky-page .top .tones {'), sky.indexOf('.sky-page .top.picking .tones'))
    expect(rule).not.toMatch(/flex-direction: column/)
    expect(rule).toMatch(/top: calc\(var\(--sat\) \+ 18px\)/)
    expect(rule).toMatch(/height: 44px/)
    // shut means unreachable, not merely invisible
    expect(rule).toMatch(/pointer-events: none/)
    expect(sky).toMatch(/\.sky-page \.top\.picking \.tones \{[^}]*pointer-events: auto/s)
  })

  it('never swallows the way out', () => {
    // an expanding control that covers the close is worse than one that is
    // hard to reach: the row stops short of it
    const rule = sky.slice(sky.indexOf('.sky-page .top .tones {'), sky.indexOf('.sky-page .top.picking .tones'))
    expect(rule).toMatch(/right: 70px/)
    expect(sky).not.toMatch(/\.top\.picking \.x/)
  })

  it('steps the label and the hand-it-over aside for the moment', () => {
    const at = sky.indexOf('.sky-page .top.picking .pq,')
    expect(at).toBeGreaterThan(-1)
    const rule = sky.slice(at, sky.indexOf('}', at))
    expect(rule).toMatch(/\.sky-page \.top\.picking \.hand[,\s]/)
    // …including the chip the row is standing on top of, which otherwise
    // showed through the open palette as a seventh, odd-sized disc
    expect(rule).toMatch(/\.sky-page \.top\.picking \.tone\s*\{/)
    expect(rule).toMatch(/opacity: 0/)
    expect(rule).toMatch(/pointer-events: none/)
  })

  it('puts itself away when you look at anything else', () => {
    const at = page.indexOf("page.addEventListener('pointerdown'")
    expect(at).toBeGreaterThan(-1)
    expect(page.slice(at, at + 420)).toMatch(/closest\('\.tones'\)[\s\S]*shutTones\(\)/)
  })

  it('shows no colour as a ring rather than as a grey one', () => {
    expect(sky).toMatch(/\.sky-page \.top \.tone\.none i \{[^}]*background: transparent/s)
  })

  it('is offered only on a thing’s own page, and shuts when one opens', () => {
    const at = page.indexOf("pageTone.hidden = mode !== 'open'")
    expect(at).toBeGreaterThan(-1)
    const near = page.slice(at, at + 400)
    expect(near).toMatch(/pageShare\.hidden = mode !== 'open'/)
    expect(near).toMatch(/shutTones\(\)/)
    expect(near).toMatch(/paintTone\(\)/)
  })

  it('no longer spends a line of the list on either', () => {
    expect(page).not.toMatch(/class="tints"/)
    expect(page).not.toMatch(/data-act="share"/)
  })
})

describe('holding a bubble opens its actions under your thumb', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')

  // the sky has two hold timers — the empty-sky one that opens capture, and
  // this one, on a bubble you have your finger on
  const held = page.indexOf('const held = drag.tl')

  it('no longer spends the gesture on gathering', () => {
    // holding used to run `startPull`, whose commonest honest answer on a
    // lone thought is "nothing like-minded near it" — a gesture whose usual
    // outcome is being told it did nothing
    expect(held).toBeGreaterThan(-1)
    const body = page.slice(held, held + 520)
    expect(body).not.toMatch(/startPull\(/)
    expect(body).toMatch(/showMoons\(held, true\)/)
    expect(body).toMatch(/sliding = true/)
    // and it aims immediately, so the moon nearest where the thumb already is
    // lights up without waiting for a first move
    expect(body).toMatch(/aimAt\(e\.clientX, e\.clientY\)/)
  })

  it('is offered inside an open group too', () => {
    // the timer used to be wrapped in `if (!memberPool)`, so a thing sitting
    // in a pool — the place you are most likely to want to act on it — was
    // the one place the hold did nothing at all
    expect(page.slice(Math.max(0, held - 900), held)).not.toMatch(/if \(!memberPool\) \{/)
  })

  it('tracks the finger while it is down', () => {
    const at = page.indexOf('if (sliding) {')
    expect(at).toBeGreaterThan(-1)
    expect(page).toMatch(/if \(sliding\) \{\n\s*aimAt\(e\.clientX, e\.clientY\)\n\s*return/)
  })

  it('forgives a thumb that lands short', () => {
    // a fingertip is wider than an icon; the reach is deliberately past the
    // disc rather than exactly it
    expect(page).toMatch(/const AIM_SLOP = \d+/)
    expect(page).toMatch(/d < r\.width \/ 2 \+ AIM_SLOP/)
    // …and nearest wins, so overlapping reaches do not pick by DOM order
    expect(page).toMatch(/d < bestD/)
  })

  it('runs the one under the finger on release, and keeps the rest up on a miss', () => {
    const at = page.indexOf('if (sliding) {\n      sliding = false')
    expect(at).toBeGreaterThan(-1)
    const body = page.slice(at, at + 220)
    expect(body).toMatch(/if \(fireAimed\(\)\) return/)
    // releasing on nothing must not also close them: that punishes the miss
    expect(body).not.toMatch(/closeMoons\(\)/)
  })

  it('fires through the moon’s own handler rather than a second copy of it', () => {
    // the dim case, the action and the closing all live on the click handler
    // already; a parallel path here is a second place to forget one of them
    const at = page.indexOf('function fireAimed()')
    expect(at).toBeGreaterThan(-1)
    expect(page.slice(at, at + 420)).toMatch(/m\.click\(\)/)
  })

  it('grows the aimed moon from the frame loop, not the stylesheet', () => {
    // `layoutMoons` writes an inline transform every frame, so a transform in
    // the stylesheet is overwritten before it is ever seen
    const at = page.indexOf('const grow = ')
    expect(at).toBeGreaterThan(-1)
    expect(page.slice(at, at + 260)).toMatch(/classList\.contains\('aimed'\)/)
    expect(page.slice(at, at + 260)).toMatch(/scale\(\$\{\(\(grow \/ cam\.k\)\)/)
    expect(sky).not.toMatch(/\.sky-moon\.aimed[^{]*\{[^}]*transform:/s)
  })

  it('lights the aimed one brightly enough to read out of the corner of an eye', () => {
    expect(sky).toMatch(/\.sky-moon\.aimed \{[^}]*z-index/s)
    expect(sky).toMatch(/\.sky-moon\.aimed \.ic \{[^}]*box-shadow/s)
    // the label comes up with it: at a glance the glow alone says "one of
    // them", not "this one"
    expect(sky).toMatch(/\.sky-moon\.aimed \.lb \{[^}]*opacity: 1/s)
  })

  it('holds the row still while a thumb is choosing from it', () => {
    // measured with a finger down on a member of an open group: the row
    // walked 170 points down the glass in under a second, because the thing
    // it hangs off was still going round its orbit
    expect(page).toMatch(/if \(sliding && !slideRow\) slideRow = \{ x: p\.x, y: p\.y \+ below \}/)
    expect(page).toMatch(/const rowX = slideRow \? slideRow\.x : p\.x/)
    expect(page).toMatch(/const rowY = slideRow \? slideRow\.y : p\.y \+ below/)
    // and the row is actually placed from those, not from the live position
    expect(page).toMatch(/Math\.min\(hi, rowX\)/)
    expect(page).toMatch(/const y = Math\.min\(rowY, floor\)/)
    // the anchor lets go with the menu, or the next one opens in the old spot
    for (const at of ['function closeMoons()', 'function fireAimed()']) {
      const i = page.indexOf(at)
      expect(i).toBeGreaterThan(-1)
      expect(page.slice(i, i + 400)).toMatch(/slideRow = null/)
    }
  })

  it('arrives already in place when it opens under a finger', () => {
    // the row pops in over ~380ms, staggered, each disc scaling about its own
    // centre — a third of a second of moving targets, right when the thumb is
    // travelling toward one
    expect(page).toMatch(/function showMoons\(tl: TL, atOnce = false\)/)
    expect(page).toMatch(/showMoons\(held, true\)/)
    expect(page).toMatch(/\(atOnce \? ' now' : ''\)/)
    expect(page).toMatch(/if \(!reduced && !atOnce\) m\.style\.animationDelay/)
    expect(sky).toMatch(/\.sky-moon\.now \{ animation: none; \}/)
    // a tap still gets the entrance: nothing is moving toward it yet
    expect(page).toMatch(/showMoons\(tl\)\n/)
  })

  it('lets go of the aim when the moons go', () => {
    const at = page.indexOf('function closeMoons()')
    expect(at).toBeGreaterThan(-1)
    const body = page.slice(at, at + 300)
    expect(body).toMatch(/sliding = false/)
    expect(body).toMatch(/aimed = null/)
  })
})

describe('a tap goes in; the actions belong to the hold', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  // Three glass discs used to appear under everything you touched. On a screen
  // whose whole argument is that thinking needs room, the commonest gesture in
  // the app spent that room on a menu nobody had asked for.
  const at = page.indexOf('function onTap(')
  const body = page.slice(at, page.indexOf('// ---------- frame loop', at))

  it('puts no actions under a tap, anywhere', () => {
    expect(at).toBeGreaterThan(-1)
    expect(body).not.toMatch(/showMoons\(/)
  })

  it('still opens a group, reads one of its members, and puts it away', () => {
    // what a tap is actually for — going in — is untouched
    expect(body).toMatch(/openPool = tl\.t\.id/)
    expect(body).toMatch(/peek = id/)
    expect(body).toMatch(/peek = null/)
  })

  it('clears whatever was up rather than leaving it behind', () => {
    // the menu belonged to the last thing you touched; touching another thing
    // must not leave its actions floating over this one
    expect(body).toMatch(/closeMoons\(\)/)
  })

  it('does not resurrect a menu when you back out of what you were reading', () => {
    // backing out of a peeked member used to restore the group's actions,
    // which made sense only while a tap was what put them there
    expect(page).not.toMatch(/if \(g\) showMoons\(g\)/)
    expect(page).toMatch(/…and nothing comes back up with it/)
  })

  it('teaches the hold once, and only when the tap gave nothing back', () => {
    expect(page).toMatch(/bs-taught-menu/)
    expect(page).toMatch(/press and hold anything for what you can do with it/)
    // a tap that opened a group answered itself; a line about a different
    // gesture on top of that is the app talking over its own reply
    const t = page.indexOf('function teachMenu()')
    expect(t).toBeGreaterThan(-1)
    expect(page.slice(t, t + 500)).toMatch(/localStorage\.getItem\('bs-taught-menu'\)/)
    expect(page.slice(t, t + 500)).toMatch(/catch/)
    expect(body).not.toMatch(/tapPt = at\n\s*teachMenu\(\)/)
  })

  it('is the only thing ringing while a finger is held on something', () => {
    const at = page.indexOf('function drawEchoes()')
    expect(at).toBeGreaterThan(-1)
    const body = page.slice(at, page.indexOf('function coast(', at))
    /*
     * Two other things used to ring at the same moment, and between them they
     * are what "the rings are coming from somewhere else" actually was.
     *
     * The thing with its actions open pulsed here as well — a ring capped at
     * 76 world units and grown to more than twice that, so on a group you
     * never saw a ring, only two arcs entering and leaving the screen with
     * nothing in their curvature to say where they came from. And up to three
     * unrelated ripe drops pulsed wherever they happened to be.
     */
    expect(body).not.toMatch(/push\(moonsFor/)
    // the ambient pulse survives, behind a guard: ambience is fine until a
    // finger is choosing, and then it is somebody else's rings
    expect(body).toMatch(/if \(!moonsFor && !holding\) \{/)
    const ripe = body.indexOf('isRipe(')
    expect(ripe).toBeGreaterThan(body.indexOf('if (!moonsFor && !holding) {'))
  })

  it('answers the hold out of the thing held, and stays on it', () => {
    const h = page.indexOf('showMoons(held, true)')
    expect(h).toBeGreaterThan(-1)
    expect(page.slice(h, h + 320)).toMatch(/rouse\(held\.t\.id\)/)
    expect(page.slice(h, h + 320)).not.toMatch(/wake\(e\.clientX/)

    /*
     * It was an overlay: an SVG hung on the body at the point the gesture
     * happened, in viewport coordinates, sized once. In a still sky it landed
     * on the bubble to the pixel. On a real one it did not — a bubble breathes,
     * the constellation re-centres after anything changes, a member of an open
     * group is going round, and the camera flies — so over the second the rings
     * take to travel, the thing that sent them walked out from under them.
     */
    expect(page).not.toMatch(/roused\(/)
    expect(page).toMatch(/function drawBurst\(\)/)
    const b = page.indexOf('function drawBurst()')
    const body = page.slice(b, b + 1400)
    // redrawn from the live position every frame, so it cannot separate
    expect(body).toMatch(/const p = posOf\(burst\.id\)/)
    expect(body).toMatch(/echoRing\(p\.rx, p\.ry,/)
    // …and off the rim of what you are actually looking at: rings leaving the
    // little disc in the middle of an opened group cross its members on the
    // way out and read as unrelated
    expect(body).toMatch(/openPool === burst\.id/)
    expect(body).toMatch(/Math\.max\(orbitR\(tl\), ringR\) \+ memberR\(tl\.members\.length\)/)
    // it is drawn before anything ambient, and it ends
    const e = page.indexOf('function drawEchoes()')
    expect(page.slice(e, e + 700)).toMatch(/drawBurst\(\)/)
    expect(body).toMatch(/burst = null/)
    // a hold on empty sky still uses the overlay, which is right: there is no
    // thing there for it to be attached to
    expect(page).toMatch(/rippleAt\(x, y, WAKE\)/)
  })
})


describe('a brief that leaves the app reads like a message', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const send = readFileSync(join('src/lib', 'send.ts'), 'utf8')

  it('is levelled to plain text at the one boundary work leaves through', () => {
    // `# Beyond identifying the 3 target lenders…` arrived in a Messages
    // bubble exactly like that. The old code did it deliberately, on the
    // argument that markdown survives where it is understood — and the share
    // sheet never says which somewhere you picked.
    expect(send).toMatch(/import \{ plainText \} from '\.\/plain-text'/)
    expect(send).toMatch(/const text = plainText\(markdown\)/)
    // both ways out, or the desktop path keeps the old behaviour
    expect(send.match(/plainText\(markdown\)/g)?.length).toBe(2)
  })

  it('stops dressing the title and the sources in markup of its own', () => {
    const at = page.indexOf('function sendable(')
    expect(at).toBeGreaterThan(-1)
    const body = page.slice(at, at + 1200)
    expect(body).not.toMatch(/`# \$\{art\.title\}/)
    expect(body).not.toMatch(/## Sources/)
    expect(body).not.toMatch(/- \[\$\{/)
    // the one bullet this app uses, and the address after the words rather
    // than hidden behind them
    expect(body).toMatch(/· \$\{name\} — \$\{x\.url\}/)
  })

  it('does not print the title twice when the brief already opens with it', () => {
    const at = page.indexOf('function sendable(')
    expect(page.slice(at, at + 1200)).toMatch(/replace\(\/\^#\{1,6\}\\s\+\/, ''\)\.startsWith\(title\)/)
  })
})

describe('an answer is not its own list, said twice', () => {
  const answer = readFileSync(join('shared/ai/actions', 'answer.ts'), 'utf8')

  it('sends the enumeration to facts and keeps the prose to what it adds up to', () => {
    // the export led with 700 characters of "(1) business federal tax
    // returns; (2) year-to-date P&L; (3) current balance sheet…" and then
    // printed the same nine as rows underneath
    expect(answer).toMatch(/Never a list in disguise/)
    // split across the template concatenation in source, so matched apart
    expect(answer).toMatch(/facts and this says what they add up to/)
  })

  it('gives the freshness caveat room to finish its sentence', () => {
    // "…exact freshness windows (60 vs 90 days) vary slightly by" — stopped
    // mid-clause at the old cap, which reads as a bug in the app rather than
    // a caveat about the world
    expect(answer).toMatch(/asOf: z\.string\(\)\.max\(220\)/)
    expect(answer).toMatch(/Stop while you have room/)
  })
})


describe('the picture and the words agree about what is finished', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('sends what is left before what is done, to both of them', () => {
    const at = page.indexOf('function shareThing(')
    expect(at).toBeGreaterThan(-1)
    const body = page.slice(at, at + 2400)
    // the card already drew a finished row struck through with its dot
    // filled, and at the size a message thumbnail gives it that strike is two
    // pixels. Order carries it where styling cannot — and the same array
    // feeds the words and the picture, so they cannot disagree.
    expect(body).toMatch(/sort\(\(a, b\) => Number\(a\.status === 'done'\) - Number\(b\.status === 'done'\)\)/)
    expect(body).toMatch(/done: m\.status === 'done'/)
    // …including in the words, which used to be handed bare labels
    const words = body.slice(0, body.indexOf('drawCard'))
    expect(words).toMatch(/done: m\.status === 'done'/)
  })
})


describe('saying something is one gesture', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')

  it('holds the pen to listen, on both of its homes', () => {
    /*
     * Speaking a thought used to be four moves: open the page, find the mic
     * inside it, tap it, and remember to tap it off. Four is three too many
     * for the one act the app exists to serve.
     */
    expect(page).toMatch(/function holdToTalk\(el: HTMLElement\)/)
    expect(page).toMatch(/holdToTalk\(writeEl\)/)
    expect(page).toMatch(/holdToTalk\(nextPen\)/)
    const at = page.indexOf('function holdToTalk(')
    const body = page.slice(at, at + 2400)
    // the page first, then the ear
    expect(body.indexOf("openPage('capture'")).toBeLessThan(body.indexOf('startMic()'))
    // …and the finger is still down on a page that just appeared under it
    expect(body).toMatch(/deafenPage\(\)/)
  })

  it('uses the same timing as holding the sky, because it is the same gesture', () => {
    expect(page).toMatch(/const TALK_HOLD = 420/)
    // the empty-sky capture hold, unchanged and still the sibling of this one
    expect(page).toMatch(/\}, 420\)/)
  })

  it('stops the moment the thumb comes up, however the gesture ends', () => {
    // a microphone that outlives the press is one you find running an hour
    // later; the only honest claim is that it listens while you hold it
    const at = page.indexOf('function holdToTalk(')
    const body = page.slice(at, at + 2400)
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      expect(body).toMatch(new RegExp(`addEventListener\\('${ev}', stop\\)`))
    }
    expect(body).toMatch(/talking = false\n\s*stopMic\(\)/)
  })

  it('still gives the page to a phone that cannot hear', () => {
    const at = page.indexOf('function holdToTalk(')
    // startMic returns false where there is no recognition, and the page —
    // the useful half — has already opened by then. Same path as a phone that
    // has not been asked yet, which is the point: neither one prompts.
    expect(page.slice(at, at + 2400)).toMatch(/talking = mayHear\(\) && startMic\(\)/)
  })

  it('lets the mic inside the page be held or latched', () => {
    // a pure toggle is wrong for a mic you are holding a conversation into;
    // pure push-to-talk is wrong for dictating six sentences hands-free
    expect(page).not.toMatch(/pageMic\.addEventListener\('click'/)
    const at = page.indexOf("pageMic.addEventListener('pointerdown'")
    expect(at).toBeGreaterThan(-1)
    const body = page.slice(at - 400, at + 700)
    expect(body).toMatch(/micWasLive = !!rec/)
    expect(body).toMatch(/performance\.now\(\) - micDownAt >= TALK_HOLD/)
  })

  it('never raises a permission sheet in the middle of the gesture', () => {
    /*
     * The first time anybody holds the pen, the OS would put a dialog over
     * the page with their thumb still down: the hold is eaten, and the reward
     * for learning the gesture is a question they did not ask. A dialog that
     * interrupts a gesture also gets the wrong answer, because nobody reads
     * one. So the gesture listens when it already may, and says where to turn
     * it on when it may not — the asking has its own screen.
     */
    const at = page.indexOf('function holdToTalk(')
    const body = page.slice(at, at + 2400)
    expect(body).toMatch(/talking = mayHear\(\) && startMic\(\)/)
    expect(body).toMatch(/turn on speaking in settings first/)
  })

  it('learns it is allowed from the mic that may ask, and unlearns a refusal', () => {
    // tapping a microphone is a deliberate act and may prompt; that grant is
    // what teaches the hold it is allowed
    const at = page.indexOf('rec.start()')
    expect(page.slice(at, at + 300)).toMatch(/markHeard\(\)/)
    const err = page.indexOf('rec.onerror = (e)')
    expect(err).toBeGreaterThan(-1)
    const body = page.slice(err, err + 500)
    expect(body).toMatch(/not-allowed/)
    expect(body).toMatch(/forgetHeard\(\)/)
  })

  it('stops saying "listening…" when it has stopped listening', () => {
    // the one thing a microphone must never get wrong is claiming to hear you
    // when it cannot. The line stayed up after the mic was off.
    expect(page).toMatch(/let micWas: string \| null = null/)
    const stop = page.indexOf('function stopMic()')
    expect(page.slice(stop, stop + 700)).toMatch(/pageN\.textContent = micWas/)
    // …and on the other way it can end: a timeout, a network blip
    const start = page.indexOf('rec.onend = ()')
    expect(page.slice(start, start + 260)).toMatch(/pageN\.textContent = micWas/)
  })

  it('says on the control itself that it can be held', () => {
    // cheaper than another one-time line, and it is there when you look
    expect(page).toMatch(/aria-label="Write a thought — hold to speak"/)
  })
})


describe('the microphone is asked for on its own screen', () => {
  const settings = readFileSync(join('src/features/settings', 'SettingsPage.tsx'), 'utf8')

  it('offers it as a thing you go and do, not a thing that happens to you', () => {
    expect(settings).toMatch(/function LetItHear\(\)/)
    expect(settings).toMatch(/<LetItHear \/>/)
    expect(settings).toMatch(/Let it hear me/)
    // and says why it is here rather than in the gesture
    expect(settings).toMatch(/better here than in the/)
  })

  it('is absent on a phone that cannot turn speech into words', () => {
    // a button offering a capability that does not exist is worse than no
    // button: it reads as broken rather than unavailable
    const at = settings.indexOf('function LetItHear()')
    expect(settings.slice(at, at + 1400)).toMatch(/if \(!canHear\(\)\) return null/)
  })
})

describe('a plan looks like a plan', () => {
  const page = readFileSync(join('src/features/sky', 'SkyPage.tsx'), 'utf8')
  const sky = readFileSync(join('src/features/sky', 'sky.css'), 'utf8')
  const prepass = readFileSync(join('src/domain', 'prioritize-prepass.ts'), 'utf8')

  /*
   * `rain` returns a real plan — a reading of what the thing is about, and
   * steps that each carry a reason, a size, and what they have to follow. All
   * of it was written to the graph and none of it was ever drawn: the list
   * showed the steps in the order the model happened to emit them, each one a
   * tick and a title. Ten identical rows is a mess; the same ten in order,
   * with their reasons, is a plan.
   */

  it('shows the steps in the order they should be done', () => {
    expect(page).toMatch(/const branches = planned \? orderTree\(tl\.t\.id, walked, rels\) : walked/)
  })

  it('leaves a group that is not a plan exactly as it was', () => {
    // a wall of references has no sequence, and numbering it would be the app
    // inventing one
    expect(page).toMatch(/const planned = hasPlan\(/)
    expect(page).toMatch(/planned \? 'the plan' : 'what is inside'/)
  })

  it('draws the three things that were already in the graph and never shown', () => {
    const at = page.indexOf('const whyEl = row.querySelector')
    expect(at).toBeGreaterThan(-1)
    const body = page.slice(at, at + 1600)
    expect(body).toMatch(/m\.summary/) // the reason rain wrote for this step
    expect(body).toMatch(/effortDots\(m\.effort\)/) // how big a piece of work
    // …and the group's own reading of itself, which rainFlow writes to summary
    expect(page).toMatch(/const readOf = planned \? \(tl\.t\.summary \?\? ''\)\.trim\(\) : ''/)
  })

  it('says nothing beside a step you wrote yourself', () => {
    // the absence is how you tell which ones are yours — a hand-typed step has
    // no reason and no effort, so both elements take themselves out
    const at = page.indexOf('const whyEl = row.querySelector')
    const body = page.slice(at, at + 1600)
    expect(body).toMatch(/else whyEl\.remove\(\)/)
    expect(body).toMatch(/else effortEl\.remove\(\)/)
  })

  it('names what a blocked step is waiting on, rather than only marking it', () => {
    // "waiting" tells you to skip it; the name tells you what to go and do
    expect(page).toMatch(/`after \$\{on\.map\(\(x\) => label\(x\)\)\.join\(' · '\)\}`/)
  })

  it('notices its own progress when a blocker is ticked', () => {
    /*
     * The list paints once and a tick only restyles its own row, so the first
     * build of this left "after Shoot one roll…" under a step whose blocker
     * had just been ticked off in front of it. A plan that does not notice its
     * own progress is worse than none: it tells you to wait for something
     * already done.
     */
    expect(page).toMatch(/const refreshWaits = \(\) => \{/)
    const tick = page.indexOf('landUndo(complete(m.id))')
    expect(page.slice(tick, tick + 420)).toMatch(/refreshWaits\(\)/)
    // …which needs the line to still be there when it is empty
    expect(sky).toMatch(/\.waits:empty \{ display: none; \}/)
  })

  it('does not move a row out from under the thumb when it comes free', () => {
    const at = page.indexOf('const refreshWaits = () => {')
    expect(page.slice(at, at + 900)).not.toMatch(/openPage\(|rebuild\(\)/)
  })

  it('agrees with the Current about what is blocked, by construction', () => {
    // one rule, because two would drift and the app would say different things
    // about the same step on two screens
    expect(prepass).toMatch(/import \{ waitingOn \} from '\.\/plan'/)
    expect(prepass).toMatch(/new Set\(waitingOn\(byId, relationships\)\.keys\(\)\)/)
    expect(prepass).not.toMatch(/blocked\.add\(/)
  })
})
