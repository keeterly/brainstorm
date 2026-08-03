// A thought, drawn the way you actually look at it.
//
// Sharing used to hand over plain text, and plain text is where this app's
// thinking goes to die: a group is a *shape* — a thing with other things
// around it — and a bulleted list of its members says none of that. Worse,
// what went out carried the agent's markdown raw, so somebody's Messages
// bubble filled up with `##` and `- **`. Nobody reads that.
//
// So the picture is the share, and it is both of the ways this app shows you
// a group: the constellation at the top, because that is what you recognise,
// and the list underneath, because that is what you read. One image, so there
// is no chooser and no wrong answer.
//
// Drawn on a canvas rather than screenshotted: the sky is scrolled, zoomed,
// half-covered by a page and lit by whatever hour it is, and none of that
// belongs in something you are handing to a person.
import { TINTS, type TintName } from './tints'

export interface CardThing {
  title: string
  /** a group draws bigger and carries its own count */
  inside?: number
  tint?: TintName | null
  done?: boolean
}

export interface CardSpec {
  title: string
  tint?: TintName | null
  inside: CardThing[]
}

/** Portrait, and the size a phone is happy to hand on. */
export const CARD_W = 1080
export const CARD_H = 1350

/**
 * Break a line to a width, by words.
 *
 * The measurer is passed in so this can be tested without a canvas — jsdom
 * has no text metrics at all, and a wrapper that cannot be tested is a
 * wrapper that silently clips somebody's title in half.
 */
export function wrapWords(text: string, maxW: number, measure: (s: string) => number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (line && measure(next) > maxW) {
      lines.push(line)
      line = w
      if (lines.length === maxLines) break
    } else line = next
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (!lines.length) return ['']
  // the last line carries the ellipsis when there was more than would fit
  const used = lines.join(' ').split(/\s+/).length
  if (used < words.length) {
    let last = lines[lines.length - 1]
    while (last && measure(`${last}…`) > maxW) last = last.replace(/\s*\S+$/, '')
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}

/** Where the members sit around the one in the middle. */
export function ringLayout(n: number, cx: number, cy: number, r: number): { x: number; y: number }[] {
  if (n <= 0) return []
  // starting at the top and going round, which is the order the eye reads a
  // ring in — and the same direction the sky lays a pool out
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
  })
}

/** How many members the constellation shows before it starts saying "+N". */
export const RING_MAX = 7
/** …and how many rows the list underneath shows. */
export const LIST_MAX = 9

const INK = '#e8eef6'
const rgba = (rgb: string, a: number) => `rgba(${rgb}, ${a})`

function bubble(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  tint: TintName | null | undefined,
) {
  const rgb = tint ? TINTS[tint] : '150, 172, 200'
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.3, r * 0.1, x, y, r)
  g.addColorStop(0, rgba(rgb, tint ? 0.5 : 0.17))
  g.addColorStop(1, rgba(rgb, tint ? 0.26 : 0.07))
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fillStyle = g
  c.fill()
  // the rim, which is what an eye finds a colour by
  c.lineWidth = Math.max(1.5, r * 0.022)
  c.strokeStyle = rgba(rgb, tint ? 0.95 : 0.42)
  c.stroke()
}

function text(
  c: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  weight = '400',
  lines = 3,
  align: CanvasTextAlign = 'center',
) {
  c.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`
  c.textAlign = align
  c.textBaseline = 'middle'
  const rows = wrapWords(s, maxW, (t) => c.measureText(t).width, lines)
  const lh = size * 1.28
  const top = y - ((rows.length - 1) * lh) / 2
  rows.forEach((r, i) => c.fillText(r, x, top + i * lh))
  return rows.length
}

/**
 * The card itself.
 *
 * Returns null when there is no canvas to draw on — an old browser, a
 * headless run — and the caller falls back to words rather than failing.
 */
export async function drawCard(spec: CardSpec): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas')
  cv.width = CARD_W
  cv.height = CARD_H
  const c = cv.getContext('2d')
  if (!c) return null

  // ---- the sky it is standing on ----
  const sky = c.createLinearGradient(0, 0, 0, CARD_H)
  sky.addColorStop(0, '#101827')
  sky.addColorStop(0.55, '#0a111d')
  sky.addColorStop(1, '#070b13')
  c.fillStyle = sky
  c.fillRect(0, 0, CARD_W, CARD_H)
  const glow = c.createRadialGradient(CARD_W * 0.5, 340, 60, CARD_W * 0.5, 340, 620)
  glow.addColorStop(0, rgba(spec.tint ? TINTS[spec.tint] : '120, 150, 200', 0.16))
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = glow
  c.fillRect(0, 0, CARD_W, 900)

  // ---- the constellation ----
  const cx = CARD_W / 2
  const cy = 380
  const shown = spec.inside.slice(0, RING_MAX)
  const ring = ringLayout(shown.length, cx, cy, 268)
  c.strokeStyle = 'rgba(205, 228, 255, 0.13)'
  c.lineWidth = 1
  for (const p of ring) {
    c.beginPath()
    c.moveTo(cx, cy)
    c.lineTo(p.x, p.y)
    c.stroke()
  }
  shown.forEach((m, i) => {
    const p = ring[i]
    const r = m.inside ? 84 : 70
    bubble(c, p.x, p.y, r, m.tint ?? spec.tint)
    c.fillStyle = m.done ? 'rgba(232, 238, 246, 0.45)' : INK
    text(c, m.title, p.x, p.y, r * 1.72, 21, '400', 3)
  })
  bubble(c, cx, cy, 150, spec.tint)
  c.fillStyle = INK
  const used = text(c, spec.title, cx, cy - 8, 250, 34, '600', 3)
  c.fillStyle = 'rgba(232, 238, 246, 0.55)'
  c.font = '400 21px -apple-system, BlinkMacSystemFont, sans-serif'
  c.textAlign = 'center'
  c.fillText(
    `${spec.inside.length} inside`,
    cx,
    cy - 8 + (used * 34 * 1.28) / 2 + 26,
  )

  // ---- and the same thing as a list ----
  let y = 760
  c.strokeStyle = 'rgba(205, 228, 255, 0.14)'
  c.beginPath()
  c.moveTo(80, y)
  c.lineTo(CARD_W - 80, y)
  c.stroke()
  y += 62
  let drawn = 0
  for (const m of spec.inside.slice(0, LIST_MAX)) {
    const rgb = m.tint ? TINTS[m.tint] : spec.tint ? TINTS[spec.tint] : '205, 228, 255'
    c.beginPath()
    c.arc(120, y, 17, 0, Math.PI * 2)
    c.strokeStyle = rgba(rgb, m.done ? 0.75 : 0.42)
    c.lineWidth = 2.5
    c.stroke()
    if (m.done) {
      c.fillStyle = rgba(rgb, 0.7)
      c.fill()
    }
    c.fillStyle = m.done ? 'rgba(232, 238, 246, 0.42)' : 'rgba(232, 238, 246, 0.92)'
    const rows = text(c, m.title, 168, y, CARD_W - 268, 27, '400', 2, 'left')
    if (m.done) {
      // struck through, the way the group page strikes it
      c.strokeStyle = 'rgba(232, 238, 246, 0.42)'
      c.lineWidth = 1.6
      c.beginPath()
      c.moveTo(168, y)
      c.lineTo(168 + Math.min(CARD_W - 268, c.measureText(m.title).width), y)
      c.stroke()
    }
    drawn++
    y += rows > 1 ? 96 : 68
    if (y > CARD_H - 150) break
  }
  /*
   * …and what would not fit, said out loud.
   *
   * The count in the middle is the whole household, and the list stops at
   * whatever the card has room for — nine rows, or fewer when the titles run
   * long. Counted against what was actually drawn rather than against the
   * cap: the first version subtracted the cap, so a card that ran out of room
   * at six of nine printed nothing at all and quietly claimed to be complete.
   */
  const over = spec.inside.length - drawn
  if (over > 0) {
    c.fillStyle = 'rgba(232, 238, 246, 0.4)'
    c.font = '400 25px -apple-system, BlinkMacSystemFont, sans-serif'
    c.textAlign = 'left'
    c.fillText(`and ${over} more`, 168, y + 6)
  }

  // ---- whose sky it came out of ----
  c.fillStyle = 'rgba(232, 238, 246, 0.3)'
  c.font = '500 23px -apple-system, BlinkMacSystemFont, sans-serif'
  c.textAlign = 'center'
  c.fillText('Brainstorm', CARD_W / 2, CARD_H - 56)

  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'))
}
