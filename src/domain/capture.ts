// One capture is one thought.
//
// It used to be several, by two different rules nobody had put side by side.
// Blank lines split what you wrote into independent blocks, and then the sky
// split each block again, line by line — throwing away the joined body this
// file had just built for exactly that case. So two lines with no blank line
// between them, a thought and its own continuation, arrived as two bubbles, the
// second an orphan that meant nothing on its own:
//
//     Call the mill about the linen
//     they said 3 weeks last time
//
// That is the app making a mess at the one moment you are trying not to. There
// is one rule now, and it is the one you would guess: what you wrote is what
// you get. The only thing that still becomes more than one thing is a heading
// over a list — and a goal with its steps under it is still one thing on the
// sky, not several.
import { parseNLDate } from './parse-nl-date'

const BULLET = /^\s*[-•*–—]\s+/

export interface Capture {
  /** the whole of what you wrote — the thought's own words, blank lines and all */
  body: string
  due: string | null
  /** the bullets under a heading; non-empty ⇒ a goal with its steps */
  steps: string[]
  /**
   * What to call the goal. Only meaningful when `steps` is non-empty — a plain
   * thought is deliberately given no name here, because the sky's only field
   * for a drop shows `title || raw_content`, so naming a note after its first
   * line would hide every line after it with nowhere left to reach them.
   */
  heading: string
}

export function parseCapture(text: string, now: Date = new Date()): Capture | null {
  // Kept as written. The whole of it is one thought's own words now, and a
  // paragraph break is part of what you meant by them; only trailing space goes.
  const raw = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
  const first = raw.findIndex((l) => l.trim())
  if (first < 0) return null

  // A natural-language due date on the first line belongs to the whole of it,
  // and comes out of the words: "order fabric by friday" is called "order
  // fabric", due Friday.
  const nl = parseNLDate(raw[first], now)
  if (nl.due) raw[first] = nl.text

  const said = raw.filter((l) => l.trim())
  /*
   * A heading, and then nothing but bullets.
   *
   * `some` was safe while blank lines still split a capture: a paragraph
   * written under a list was its own block and could not be mistaken for a
   * step. It is not safe now. Every line after the first is in reach, so
   * `some` would read
   *
   *     Spring line:
   *     - linen shirt
   *     - wide trousers
   *     the palette should stay in the sand range
   *
   * as a goal with three steps, the third of them a sentence of prose — which
   * is the exact fragmenting this change removes, moved to a new place. A list
   * with prose after it is prose: it falls through and every word is kept.
   *
   * And the first line may not itself be a bullet, or a bare list becomes a
   * goal named after its own first item — "- milk / - eggs" arriving as a goal
   * called "milk" with one step in it.
   */
  if (said.length >= 2 && !BULLET.test(said[0]) && said.slice(1).every((l) => BULLET.test(l))) {
    return {
      heading: said[0].replace(/:\s*$/, '').trim() || 'Untitled plan',
      body: said[0].replace(/:\s*$/, '').trim() || 'Untitled plan',
      due: nl.due,
      steps: said
        .slice(1)
        .map((l) => l.replace(BULLET, '').trim())
        .filter(Boolean),
    }
  }
  return { heading: '', body: raw.join('\n').trim(), due: nl.due, steps: [] }
}
