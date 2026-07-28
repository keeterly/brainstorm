// Capture parsing: blank lines split independent blocks; inside a block, a
// heading line followed by bullet lines becomes a goal with child actions.
// Port of the proven VENIA parseDumpBlock behavior.
import { parseNLDate } from './parse-nl-date'

const BULLET = /^\s*[-•*–—]\s+/

export interface ParsedBlock {
  title: string
  body: string // full text of a plain note (may be multi-line)
  due: string | null
  children: string[] // child action titles; non-empty ⇒ this is a goal
}

export function parseBlock(block: string, now: Date = new Date()): ParsedBlock | null {
  const lines = String(block || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim())
  if (!lines.length) return null

  // NL due date on the first line applies to the whole block.
  const nl = parseNLDate(lines[0], now)
  if (nl.due) lines[0] = nl.text

  const hasBullets = lines.slice(1).some((l) => BULLET.test(l))
  if (lines.length >= 2 && hasBullets) {
    const title = lines[0].replace(BULLET, '').replace(/:\s*$/, '').trim() || 'Untitled plan'
    const children = lines
      .slice(1)
      .map((l) => l.replace(BULLET, '').trim())
      .filter(Boolean)
    return { title, body: title, due: nl.due, children }
  }
  const body = lines.join('\n')
  return { title: lines[0].slice(0, 120), body, due: nl.due, children: [] }
}

export function parseCapture(text: string, now: Date = new Date()): ParsedBlock[] {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((b) => parseBlock(b, now))
    .filter((b): b is ParsedBlock => !!b)
}
