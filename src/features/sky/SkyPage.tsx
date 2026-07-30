// The Sky — the app's home. The interface IS the water world from the
// prototype: glass drops backed by real thoughts, pools backed by goals,
// threads backed by relationships, the ocean backed by done, the high
// clouds backed by snooze. No cards, no forms — hold the sky and write.
import { useEffect, useRef } from 'react'
import { useGraph } from '@/store/graph'
import { parseCapture } from '@/domain/parse-blocks'
import { runAction } from '@/ai/client'
import type { ClassifyOutput } from '@shared/ai/actions/classify-thought'
import { nameThePool, organizeText, tidySky } from './absorbFlow'
import { seaLineAt, waterlineY } from '@/world/water'
import { KIN_EVIDENCE, KIN_POOL, KIN_THREAD, type Kinship, kinship } from '@/domain/kinship'
import { humanDate } from '@/domain/human-date'
import { nextAction } from '@/domain/next-action'
import { armUpright, stepUpright, worldTilt } from '@/world/upright'
import { applyDeepen, deepenThought } from './deepenFlow'
import { applyAnswer, answerThought } from './answerFlow'
import { fullDepth, sizeUp, waitingWord, type Sizing } from './gaugeFlow'
import { isQuestion } from '@/domain/question'
import { addTo, bin, complete, groupInto, membersOf, rename, takeOut, ungroup, type Undone } from './groupFlow'
import { awaitRun, markApplied, pendingRuns, subjectOf } from '@/ai/pending'
import { reshapeTally, reshapeThought } from './reshapeFlow'
import { haptics } from '@/lib/haptics'
import { noteTrail } from '@/lib/trail'
import { echoRing, wabiBlob, wabiPill, wabiSeed } from '@/world/echo'
import { type Body, card, contact, disc, oilPath, pull } from '@/world/shape'
import type { Thought } from '@/domain/types'
import './sky.css'

export default function SkyPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => mountSky(rootRef.current as HTMLDivElement), [])
  return (
    <div ref={rootRef} className="sky-root">
      <div className="sky-stage" data-sky="stage">
        <svg className="sky-links" aria-hidden="true">
          <g data-sky="links">
            <g className="sky-echo" data-sky="echo" />
            <g className="sky-oil" data-sky="oil" />
            <path className="sky-goo" data-sky="goo" />
          </g>
        </svg>
        <div data-sky="field" />
      </div>
      <div className="sky-tide" data-sky="tide" aria-hidden="true" />
      <div className="sky-sea-word" data-sky="seaword" aria-hidden="true" />
      <div className="sky-meter" data-sky="meter" aria-hidden="true" />
      <button className="sky-rest" data-sky="rest" aria-label="Resting thoughts">
        ☁
      </button>
      <button className="sky-next" data-sky="next" aria-label="What to do next">
        <span className="lb" data-sky="nextLb" />
        <span className="why" data-sky="nextWhy" />
      </button>
      <button className="sky-tidy" data-sky="tidy" aria-label="Gather loose thoughts into pools">
        ✦ tidy
      </button>
      {/* Where the agent speaks. See say()/hold(). */}
      <div className="sky-voice" data-sky="voice" role="status">
        <span className="who" data-sky="voiceWho" />
        <span className="lb" data-sky="voiceLb" />
      </div>
      {/* speaking is one tap: no page to open first, no button to find inside it */}
      <div className="sky-undo" data-sky="undo">
        <span className="lb" data-sky="undoLb" />
        <b data-sky="undoGo">bring it back</b>
      </div>
      <div className="sky-page" data-sky="page" role="dialog" aria-label="Write">
        <div className="top">
          <div className="pq" data-sky="pageQ" />
          <button className="x" data-sky="pageX" aria-label="Close">
            ×
          </button>
        </div>
        <textarea data-sky="pageT" />
        <div className="pans" data-sky="pageA" style={{ display: 'none' }} />
        <div className="bot">
          <div className="tools">
            <button className="tool" data-sky="pageMic" aria-label="Speak">
              <Ico d="M12 3.4a2.6 2.6 0 0 0-2.6 2.6v5a2.6 2.6 0 0 0 5.2 0V6A2.6 2.6 0 0 0 12 3.4ZM6.2 10.6a5.8 5.8 0 0 0 11.6 0M12 16.4v4.2" />
            </button>
            <button className="tool" data-sky="pagePic" aria-label="Add a photo">
              <Ico d="M3.6 6.8a2 2 0 0 1 2-2h12.8a2 2 0 0 1 2 2v10.4a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2V6.8ZM3.9 16l4.6-4.3a1.7 1.7 0 0 1 2.3 0l4 3.7M14 13.4l1.6-1.5a1.7 1.7 0 0 1 2.3 0l2.2 2M9 9.4a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z" />
            </button>
            <button
              className="tool"
              data-sky="pageAbsorb"
              aria-label="Organize this"
              title="Read it through, gather the themes, draw the threads"
            >
              <Ico d="M12 3.2c.7 4.2 1.9 5.4 6.1 6.1-4.2.7-5.4 1.9-6.1 6.1-.7-4.2-1.9-5.4-6.1-6.1 4.2-.7 5.4-1.9 6.1-6.1ZM17.6 15.2c.35 2 .95 2.6 2.95 2.95-2 .35-2.6.95-2.95 2.95-.35-2-.95-2.6-2.95-2.95 2-.35 2.6-.95 2.95-2.95Z" />
            </button>
            <button className="tool" data-sky="pageLater" aria-label="Let it rest">
              <Ico d="M7.2 18.4a4.2 4.2 0 0 1-.5-8.37 5.6 5.6 0 0 1 10.75-1.2 3.8 3.8 0 0 1 .35 7.55 4 4 0 0 1-.6.04H7.2Z" />
            </button>
            <span className="note" data-sky="pageN" />
          </div>
          {/* The second way out, and it only ever appears on the page that has
              two. See the `say` mode: you choose what happens to what you
              wrote after you have written it. */}
          <button className="done alt" data-sky="pageD2" hidden>
            Work it in
          </button>
          <button className="done" data-sky="pageD">
            Done
          </button>
        </div>
      </div>
      <input type="file" data-sky="pageFile" accept="image/*" style={{ display: 'none' }} />
      {/* A photo you kept, at the size you kept it. See openPhoto. */}
      <div className="sky-lightbox" data-sky="lightbox" role="dialog" aria-label="The photo" aria-modal="true">
        <img data-sky="lightboxImg" alt="" />
        <button className="x" data-sky="lightboxX" aria-label="Close">
          ×
        </button>
      </div>
    </div>
  )
}

/**
 * The brief, as something you can read on a phone.
 *
 * The agent writes markdown, and a brief is a small and entirely predictable
 * subset of it: headings, bullets, a numbered list, bold leads. Rendering it
 * with a markdown library would be a dependency and a licence to inject; this
 * walks the lines it actually writes and escapes everything else, so nothing
 * that came back off the open web can put markup into the page.
 */
export function briefHtml(md: string, sources: { title: string; url: string }[]): string {
  const esc = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // **lead** — the rest, which is the one bit of inline markup it uses
  const inline = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  const out: string[] = []
  let n = 0
  let inSources = false
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (inSources && !line.startsWith('#')) continue
    if (line.startsWith('## ')) {
      // the sources are rebuilt below from the real list, with links and hosts,
      // so the agent's own plain-text version of them is skipped entirely
      if (/^sources$/i.test(line.slice(3).trim())) {
        inSources = true
        continue
      }
      inSources = false
      out.push(`<div class="lab">${inline(line.slice(3))}</div>`)
      n = 0
    } else if (line.startsWith('# ')) {
      continue // the title is already the page's own heading
    } else if (line.startsWith('- ')) {
      // a source list is rendered from the sources array instead, with links
      if (/^- \[.+\]\(.+\)$/.test(line)) continue
      out.push(`<div class="a">${inline(line.slice(2))}</div>`)
    } else if (/^\d+\.\s/.test(line)) {
      n++
      out.push(
        `<div class="step${n === 1 ? ' first' : ''}"><div class="k">${n}</div>` +
          `<div class="v">${inline(line.replace(/^\d+\.\s*/, ''))}</div></div>`,
      )
    } else {
      out.push(`<div class="a">${inline(line)}</div>`)
    }
  }
  if (sources.length) {
    out.push(`<div class="lab">where this came from</div>`)
    for (const s of sources) {
      let host = ''
      try {
        host = new URL(s.url).hostname.replace(/^www\./, '')
      } catch {
        host = ''
      }
      // only ever http(s): a brief comes off the open web and a url is the one
      // thing in it that the page hands back to the operating system
      if (!/^https?:\/\//i.test(s.url)) continue
      const name = s.title.trim()
      out.push(
        `<a class="src" href="${esc(s.url)}"><span class="t">${esc(name || host || s.url)}</span>` +
          (host && name ? `<span class="h">${esc(host)}</span>` : '') +
          `</a>`,
      )
    }
  }
  return out.join('') || `<div class="a">Nothing was written down.</div>`
}

// one drawn family for every tool, so nothing is a stray emoji
function Ico({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden focusable="false">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// the engine — imperative, like the prototype, so nothing re-renders per frame
// ---------------------------------------------------------------------------

interface Step {
  ph: string
  pt: string
  detail: string
}
interface TL {
  kind: 'drop' | 'pool'
  t: Thought
  members: Thought[]
}
interface Pos {
  x: number
  y: number
  rx: number
  ry: number
  s: number
  vx: number
  vy: number
  // how far this drop is leaning toward another — mk eases toward mt, and
  // mx/my is the unit direction of the pull
  mk: number
  mt: number
  mx: number
  my: number
}

const QUESTIONS = [
  'What makes this one matter?',
  'What is the smallest true version?',
  'Who is it really for?',
]
const STOP = new Set(['what', 'when', 'where', 'which', 'would', 'could', 'should', 'about', 'with', 'this', 'that', 'than', 'then', 'like', 'look', 'from', 'have', 'over', 'into', 'your', 'their', 'there', 'they', 'want', 'need', 'make', 'build', 'helps', 'really', 'thing', 'something', 'anything'])

// the same drawn family as the page tools — no stray emoji in the sky
const MOON_ICONS: Record<string, string> = {
  grow: 'M12 3.4c.72 4.3 1.94 5.52 6.24 6.24-4.3.72-5.52 1.94-6.24 6.24-.72-4.3-1.94-5.52-6.24-6.24 4.3-.72 5.52-1.94 6.24-6.24ZM17.7 15.6c.32 1.9.88 2.46 2.78 2.78-1.9.32-2.46.88-2.78 2.78-.32-1.9-.88-2.46-2.78-2.78 1.9-.32 2.46-.88 2.78-2.78Z',
  gather: 'M3.2 12h5.4M20.8 12h-5.4M6.2 9.2 8.9 12l-2.7 2.8M17.8 9.2 15.1 12l2.7 2.8',
  rain: 'M7.6 13.6a3.7 3.7 0 0 1-.44-7.37 4.95 4.95 0 0 1 9.5-1.06 3.36 3.36 0 0 1 .3 6.67 3.6 3.6 0 0 1-.53.03H7.6M8.4 16.4l-1 3M13 16.4l-1 3M17.6 16.4l-1 3',
  // the bolt from the first Brainstorm: hand it over and it goes to work
  work: 'M13.2 2.8 5.4 13.1a.5.5 0 0 0 .4.8h4.3l-1.3 7.3 7.8-10.3a.5.5 0 0 0-.4-.8h-4.3l1.3-7.3Z',
  // what it brought back: pages, with something written on them
  brief: 'M6.2 3.6h8.1l3.5 3.5v13.3H6.2zM14.3 3.6v3.5h3.5M9 12.2h6M9 15.6h4.2',
  // telling it something: a line going in, and the shape rearranging around it
  tell: 'M3.4 8.6h6.2M3.4 12h4M3.4 15.4h6.2M14 5.4l6 6.6-6 6.6M20 12h-6.4',
  // asking it something: the mark itself, because nothing else means this
  ask: 'M9.1 8.6a3 3 0 1 1 3.9 2.87c-.7.24-1.1.85-1.1 1.58v.85M12 17.6v.5',
  // what is in this group, as a list you can work on: rows, each with a mark
  list: 'M4.4 6.6h1.2M4.4 12h1.2M4.4 17.4h1.2M9 6.6h10.6M9 12h10.6M9 17.4h10.6',
  // the picture you kept, at the size you kept it: a frame with a horizon in it
  photo:
    'M3.6 6.8a2 2 0 0 1 2-2h12.8a2 2 0 0 1 2 2v10.4a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2V6.8ZM3.9 16l4.6-4.3a1.7 1.7 0 0 1 2.3 0l4 3.7M14 13.4l1.6-1.5a1.7 1.7 0 0 1 2.3 0l2.2 2M9 9.4a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z',
}
function moonSvg(key: string) {
  return (
    `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">` +
    `<path d="${MOON_ICONS[key] ?? MOON_ICONS.grow}" stroke="currentColor" stroke-width="1.5" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}

// Wabi-sabi: a real droplet is never a true circle. Each drop gets its own
// quiet asymmetry, derived from its id so it is the same one every time.
function blobOf(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const v = (n: number) => {
    const x = Math.sin(h * 0.0001 + n * 12.9898) * 43758.5453
    return (46.6 + (x - Math.floor(x)) * 6.8).toFixed(1)
  }
  return `${v(1)}% ${v(2)}% ${v(3)}% ${v(4)}% / ${v(5)}% ${v(6)}% ${v(7)}% ${v(8)}%`
}

// How much of a drop's stretch toward its partner is paid for by narrowing
// across it. Water has a volume; a body that reaches has to thin somewhere.
export const MORPH_PERP = 0.55
export { echoRing }

// The neck two droplets form as they reach for each other. Circles do not
// merge by overlapping — surface tension draws a waisted bridge between them
// that thickens as they close. Drawn as a path rather than an SVG blur filter,
// because that filter renders as flat grey rectangles on iOS.
//
// k1/k2 are how far each body has deformed toward the other: 0 leaves it a
// circle, 0.16 stretches it 16% along the line between them and narrows it
// across. The drop elements are transformed by exactly the same amounts, so
// the silhouette this path traces is the silhouette you see.
export function metaballPath(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
  k1 = 0,
  k2 = 0,
): string | null {
  const dx = x2 - x1
  const dy = y2 - y1
  const d = Math.hypot(dx, dy)
  // semi-axes: a along the line between them, b across it
  const a1r = r1 * (1 + k1)
  const b1r = r1 * (1 - k1 * MORPH_PERP)
  const a2r = r2 * (1 + k2)
  const b2r = r2 * (1 - k2 * MORPH_PERP)
  const maxReach = (a1r + a2r) * 1.62
  if (d <= 0 || d > maxReach) return null
  const angle = Math.atan2(dy, dx)
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const deg = ((angle * 180) / Math.PI).toFixed(1)
  // a point on a body, at parameter t measured from the line between them
  const rim = (cx: number, cy: number, a: number, b: number, t: number) => {
    const lx = a * Math.cos(t)
    const ly = b * Math.sin(t)
    return [cx + lx * ca - ly * sa, cy + lx * sa + ly * ca]
  }

  if (d <= Math.abs(a1r - a2r)) {
    // fully inside one another: there is no neck left, only one surface
    const [cx, cy, a, b] = a1r >= a2r ? [x1, y1, a1r, b1r] : [x2, y2, a2r, b2r]
    const [sx, sy] = rim(cx, cy, a, b, Math.PI)
    const [ex, ey] = rim(cx, cy, a, b, 0)
    return (
      `M ${sx.toFixed(1)} ${sy.toFixed(1)}` +
      ` A ${a.toFixed(1)} ${b.toFixed(1)} ${deg} 1 0 ${ex.toFixed(1)} ${ey.toFixed(1)}` +
      ` A ${a.toFixed(1)} ${b.toFixed(1)} ${deg} 1 0 ${sx.toFixed(1)} ${sy.toFixed(1)} Z`
    )
  }

  // how far into the reach we are, 0 (just touching range) → 1 (overlapping)
  const v = Math.max(0, Math.min(1, 1 - (d - (a1r + a2r) * 0.42) / (maxReach - (a1r + a2r) * 0.42)))
  const spread = Math.PI / 2.6

  let u1 = 0
  let u2 = 0
  if (d < a1r + a2r) {
    u1 = Math.acos(Math.max(-1, Math.min(1, (a1r * a1r + d * d - a2r * a2r) / (2 * a1r * d))))
    u2 = Math.acos(Math.max(-1, Math.min(1, (a2r * a2r + d * d - a1r * a1r) / (2 * a2r * d))))
  }
  // the neck attaches no further round than where the two surfaces already
  // cross — past that it would be cutting into the body it is joining
  const t1 = u1 + Math.max(0, spread - u1) * v
  const t2 = -t1
  const t3 = Math.PI - u2 - Math.max(0, Math.PI - u2 - spread) * v
  const t4 = -t3

  const [p1x, p1y] = rim(x1, y1, a1r, b1r, t1)
  const [p2x, p2y] = rim(x1, y1, a1r, b1r, t2)
  const [p3x, p3y] = rim(x2, y2, a2r, b2r, t3)
  const [p4x, p4y] = rim(x2, y2, a2r, b2r, t4)

  // the waist: control handles run along each rim toward it, shortening as
  // the two close. `sign` picks which way around the body the handle leaves.
  const handle = (px: number, py: number, a: number, b: number, t: number, len: number, sign: number) => {
    const lx = -a * Math.sin(t) * sign
    const ly = b * Math.cos(t) * sign
    const m = Math.hypot(lx, ly) || 1
    const ux = (lx / m) * len
    const uy = (ly / m) * len
    return [px + ux * ca - uy * sa, py + ux * sa + uy * ca]
  }
  const totalRadius = a1r + a2r
  // once the two are genuinely inside one another the union is already the
  // shape; the neck stands down rather than bulging out past it
  const over = Math.max(0, (totalRadius - d) / totalRadius)
  const d2 =
    Math.min(v * 0.7, Math.hypot(p1x - p3x, p1y - p3y) / totalRadius) *
    Math.min(1, (d * 2) / totalRadius) *
    Math.max(0, 1 - over * 1.7)
  const h1 = a1r * d2 * 2.4
  const h2 = a2r * d2 * 2.4
  const c1 = handle(p1x, p1y, a1r, b1r, t1, h1, -1)
  const c2 = handle(p3x, p3y, a2r, b2r, t3, h2, 1)
  const c3 = handle(p4x, p4y, a2r, b2r, t4, h2, -1)
  const c4 = handle(p2x, p2y, a1r, b1r, t2, h1, 1)

  return (
    `M ${p1x.toFixed(1)} ${p1y.toFixed(1)}` +
    ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p3x.toFixed(1)} ${p3y.toFixed(1)}` +
    ` A ${a2r.toFixed(1)} ${b2r.toFixed(1)} ${deg} 0 1 ${p4x.toFixed(1)} ${p4y.toFixed(1)}` +
    ` C ${c3[0].toFixed(1)} ${c3[1].toFixed(1)}, ${c4[0].toFixed(1)} ${c4[1].toFixed(1)}, ${p2x.toFixed(1)} ${p2y.toFixed(1)}` +
    ` A ${a1r.toFixed(1)} ${b1r.toFixed(1)} ${deg} 0 1 ${p1x.toFixed(1)} ${p1y.toFixed(1)} Z`
  )
}

function mountSky(root: HTMLDivElement) {
  const $ = <T extends HTMLElement>(k: string) => root.querySelector(`[data-sky="${k}"]`) as T
  const stage = $('stage')
  const field = $('field')
  const links = root.querySelector('[data-sky="links"]') as unknown as SVGGElement
  const voiceEl = $('voice')
  const voiceWho = $('voiceWho')
  const voiceLb = $('voiceLb')
  const meter = $('meter')
  const tide = $('tide')
  const goo = root.querySelector('[data-sky="goo"]') as unknown as SVGPathElement
  const oilG = root.querySelector('[data-sky="oil"]') as unknown as SVGGElement
  const echoG = root.querySelector('[data-sky="echo"]') as unknown as SVGGElement
  const seaWord = $('seaword')
  const restEl = $('rest')
  const tidyEl = $('tidy')
  const nextEl = $('next')
  const nextLb = $('nextLb')
  const nextWhy = $('nextWhy')
  nextEl.style.setProperty('--next-blob', wabiPill('sky-next', 15, 5))
  const undoEl = $('undo')
  const undoLb = $('undoLb')
  const undoGo = $('undoGo')
  const page = $('page')
  const pageQ = $('pageQ')
  const pageT = $<HTMLTextAreaElement>('pageT')
  const pageA = $('pageA')
  const pageN = $('pageN')
  const pageD = $('pageD')
  const pageD2 = $('pageD2')
  const pageX = $('pageX')
  const pageMic = $('pageMic')
  const pagePic = $('pagePic')
  const pageAbsorb = $('pageAbsorb')
  const pageLater = $('pageLater')
  const pageFile = root.querySelector('[data-sky="pageFile"]') as HTMLInputElement
  const lightbox = $('lightbox')
  const lightboxImg = root.querySelector('[data-sky="lightboxImg"]') as HTMLImageElement
  const lightboxX = $('lightboxX')

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  document.body.classList.add('sky-held')
  // how close a dragged drop is to the sea, 0 → 1, and whether it would go
  let seaNear = 0
  function showTide(near: number, ready: boolean) {
    if (near === seaNear) return
    seaNear = near
    const line = waterlineY()
    tide.style.top = line - 120 + 'px'
    tide.style.height = 260 + 'px'
    tide.style.background =
      `linear-gradient(rgba(var(--accent-rgb), 0) 0%, rgba(var(--accent-rgb), ${(0.05 * near).toFixed(3)}) 44%,` +
      ` rgba(150,215,255,${(0.16 * near).toFixed(3)}) 47%, rgba(90,170,230,${(0.1 * near).toFixed(3)}) 60%, transparent 100%)`
    tide.classList.toggle('on', near > 0.02)
    seaWord.style.top = line - 52 + 'px'
    seaWord.textContent = ready ? 'let go' : 'the ocean keeps what’s done'
    seaWord.classList.toggle('on', near > 0.25)
    seaWord.classList.toggle('ready', ready)
  }
  function hideTide() {
    if (seaNear === 0 && !tide.classList.contains('on')) return
    seaNear = 0
    tide.classList.remove('on')
    seaWord.classList.remove('on', 'ready')
  }
  const S = () => useGraph.getState()
  const todayISO = () => new Date().toISOString().slice(0, 10)
  const ex = (t: Thought) => (t.extra ?? {}) as Record<string, unknown>
  const label = (t: Thought) => t.title || t.raw_content
  const answersOf = (t: Thought) => (ex(t).answers as string[] | undefined) ?? []
  const isKept = (t: Thought) => ex(t).kept === true
  const isRipe = (t: Thought) => !isKept(t) && answersOf(t).length >= 1
  const imgOf = (t: Thought) => ex(t).img as string | undefined
  /**
   * The version worth looking at.
   *
   * Falls back to the face for every photo kept before there was a second
   * version — those open blurry rather than not at all, which is the right way
   * round.
   */
  const fullOf = (t: Thought) => (ex(t).full as string | undefined) ?? imgOf(t)
  const patchExtra = (t: Thought, patch: Record<string, unknown>) =>
    S().updateThought(t.id, { extra: { ...ex(t), ...patch } })

  let W = innerWidth
  let H = stage.clientHeight || innerHeight
  // The world is bigger than the glass you look through it with. Everything
  // below works in world coordinates; the camera maps them to the screen.
  const cam = { x: 0, y: 0, k: 1 }
  const MIN_K = 0.35
  const MAX_K = 1.8
  const worldW = () => W * 1.9
  const worldH = () => (waterlineY() - 74) * 1.7
  const toWorldX = (sx: number) => (sx - cam.x) / cam.k
  // and back: anything positioned against the glass rather than the world —
  // the writing page opening out of a drop, for one — needs screen space
  const toScreenX = (wx: number) => wx * cam.k + cam.x
  const toScreenY = (wy: number) => wy * cam.k + cam.y
  const toWorldY = (sy: number) => (sy - cam.y) / cam.k
  function applyCam() {
    const t = `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`
    field.style.transform = t
    field.style.transformOrigin = '0 0'
    links.setAttribute('transform', `translate(${cam.x} ${cam.y}) scale(${cam.k})`)
  }
  function zoomAt(sx: number, sy: number, k: number) {
    const next = Math.max(MIN_K, Math.min(MAX_K, k))
    const wx = toWorldX(sx)
    const wy = toWorldY(sy)
    cam.k = next
    cam.x = sx - wx * next
    cam.y = sy - wy * next
    applyCam()
  }
  /** The world's occupied box, or null when there is nothing in it. */
  function contentBox() {
    const tls = view.tls
    if (!tls.length) return null
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const tl of tls) {
      const p = posOf(tl.t.id)
      const r = radiusOf(tl) + 12
      x0 = Math.min(x0, p.x - r)
      y0 = Math.min(y0, p.y - r)
      x1 = Math.max(x1, p.x + r)
      y1 = Math.max(y1, p.y + r)
    }
    return { x0, y0, x1, y1 }
  }
  /**
   * Is there anywhere to pan to?
   *
   * Two ways there can be. The sky may be bigger than the glass — that was the
   * only one this asked about, and it was wrong the moment anything moved the
   * camera off centre. Following a recommendation deliberately decentres the
   * view, so a sky that *fits* can still be half off the edge, and answering
   * "no" then left you looking at something you could not drag back. The other
   * way is simply that some of it is off the glass right now.
   */
  function canPan() {
    const b = contentBox()
    if (!b) return false
    const top = 76
    const floor = waterlineY() - 94
    const l = toScreenX(b.x0)
    const r = toScreenX(b.x1)
    const t = toScreenY(b.y0)
    const bot = toScreenY(b.y1)
    if (r - l > W + 12 || bot - t > floor - top) return true
    return l < -12 || r > W + 12 || t < top - 12 || bot > floor + 12
  }
  /** Bring one thing to the middle of the glass, without changing how close
   *  you are standing — a recommendation should not re-frame your whole sky. */
  function focusOn(p: { x: number; y: number }) {
    const k = cam.k
    camTarget = { k, x: W / 2 - p.x * k, y: (76 + (waterlineY() - 150)) / 2 - p.y * k }
  }
  /** Frame everything, with a little air. */
  function fitAll(animate = true) {
    const b = contentBox()
    if (!b) return
    const { x0, y0, x1, y1 } = b
    const top = 76
    const bottom = waterlineY() - 18
    // framing, never magnifying: a nearly empty sky used to zoom in past 1:1
    // and push what little was in it off the edges
    const k = Math.max(MIN_K, Math.min(1, Math.min(W / Math.max(1, x1 - x0), (bottom - top) / Math.max(1, y1 - y0))))
    const target = {
      k,
      x: (W - (x1 - x0) * k) / 2 - x0 * k,
      y: top + (bottom - top - (y1 - y0) * k) / 2 - y0 * k,
    }
    if (!animate || reduced) {
      cam.k = target.k
      cam.x = target.x
      cam.y = target.y
      applyCam()
      return
    }
    camTarget = target
  }
  /** Frame one opened pool and the whole ring it lays out, and nothing else. */
  function frameOpen(g: TL) {
    const p = posOf(g.t.id)
    const reach = orbitR(g) + memberR(g.members.length) + 22
    // keep the ring inside the world so no part of it can be clamped away
    p.x = Math.max(Math.min(reach, worldW() / 2), Math.min(worldW() - reach, p.x))
    p.y = Math.max(Math.min(reach, worldH() / 2), Math.min(worldH() - reach, p.y))
    const top = 76
    // the pool's own actions wait below it; leave them room
    const bottom = waterlineY() - 118
    const k = Math.max(MIN_K, Math.min(MAX_K, Math.min(W / (reach * 2), (bottom - top) / (reach * 2))))
    const target = { k, x: W / 2 - p.x * k, y: (top + bottom) / 2 - p.y * k }
    if (reduced) {
      cam.k = target.k
      cam.x = target.x
      cam.y = target.y
      applyCam()
      return
    }
    camTarget = target
  }
  let camTarget: { x: number; y: number; k: number } | null = null
  const onResize = () => {
    W = innerWidth
    H = stage.clientHeight || innerHeight
  }
  addEventListener('resize', onResize)

  // ---------- world view over the store ----------
  let ver = 0
  let view: {
    /** what is on stage at rest: the roots */
    tls: TL[]
    /** every node, however deep, so anything can be opened or measured */
    byId: Map<string, TL>
    threads: { a: string; b: string; id: string }[]
    parentOf: Map<string, string>
    kidsOf: Map<string, Thought[]>
  } = {
    tls: [],
    byId: new Map(),
    threads: [],
    parentOf: new Map(),
    kidsOf: new Map(),
  }
  function rebuild() {
    const s = S()
    const open = s.thoughts.filter((t) => t.status === 'open')
    const alive = new Map(open.map((t) => [t.id, t]))
    // Groups within groups: a thing belongs to whatever it is part of, whether
    // that parent is a goal or not, and a thing with anything under it is a
    // pool. Nesting is just this map read one level at a time.
    const parentOf = new Map<string, string>()
    const kidsOf = new Map<string, Thought[]>()
    for (const r of s.relationships) {
      if (r.type !== 'part_of') continue
      const child = alive.get(r.from_id)
      if (!child || !alive.has(r.to_id) || r.from_id === r.to_id) continue
      // one home each: a second parent is ignored rather than duplicating it
      if (parentOf.has(child.id)) continue
      parentOf.set(child.id, r.to_id)
      if (!kidsOf.has(r.to_id)) kidsOf.set(r.to_id, [])
      ;(kidsOf.get(r.to_id) as Thought[]).push(child)
    }
    // a cycle would hang the walk up; break any that a bad edge created
    for (const id of [...parentOf.keys()]) {
      const seen = new Set([id])
      let p = parentOf.get(id)
      while (p) {
        if (seen.has(p)) {
          parentOf.delete(id)
          const sib = kidsOf.get(p)
          if (sib) kidsOf.set(p, sib.filter((k) => k.id !== id))
          break
        }
        seen.add(p)
        p = parentOf.get(p)
      }
    }

    const nodeOf = (t: Thought): TL => {
      const kids = kidsOf.get(t.id) ?? []
      return { kind: kids.length ? 'pool' : 'drop', t, members: kids }
    }
    // every node is addressable, so a pool nested three deep can still be
    // opened, measured and drawn; only the roots go on stage at rest
    const byId = new Map(open.map((t) => [t.id, nodeOf(t)]))
    const tls = open.filter((t) => !parentOf.has(t.id)).map((t) => byId.get(t.id) as TL)

    const topIds = new Set(tls.map((tl) => tl.t.id))
    const threads = s.relationships
      .filter((r) => r.type === 'relates_to' && topIds.has(r.from_id) && topIds.has(r.to_id))
      .map((r) => ({ a: r.from_id, b: r.to_id, id: r.id }))

    view = { tls, byId, threads, parentOf, kidsOf }
    ver++
    sweepSoon()
  }

  /**
   * An emptied group is a label in the way — but only once things have settled.
   *
   * This used to run inside rebuild(), which re-derives on every single store
   * change, and it *deleted*. Both halves were wrong and together they lost
   * data. Undoing an ungroup does two things in order — put the group back,
   * then put its contents back inside it — and rebuild ran in the gap, saw a
   * goal with nothing in it, and destroyed it before the second half of the
   * undo arrived. Anything that moves members between groups had the same hole
   * in it, and a hard delete takes the id with it, so nothing could be undone.
   *
   * So: after the dust settles, not during. And archived, not deleted, with the
   * offer to bring it back — because "you emptied this, so I threw the name
   * away" is a decision the app should be willing to be wrong about.
   */
  let sweepT: ReturnType<typeof setTimeout> | null = null
  function sweepSoon() {
    if (sweepT) clearTimeout(sweepT)
    sweepT = setTimeout(sweep, 1200)
  }
  function sweep() {
    const s = S()
    const held = new Set(s.relationships.filter((r) => r.type === 'part_of').map((r) => r.to_id))
    const empty = s.thoughts.filter(
      (t) =>
        t.status === 'open' &&
        t.type === 'goal' &&
        !held.has(t.id) &&
        Date.now() - new Date(t.created_at).getTime() > 8000,
    )
    if (!empty.length) return
    for (const t of empty) s.updateThought(t.id, { status: 'archived' })
    const one = empty.length === 1 ? `“${trim(label(empty[0]), 30)}” is empty` : `${empty.length} empty groups`
    offerAction(`${one} — put away`, 'bring it back', () => {
      for (const t of empty) S().updateThought(t.id, { status: 'open' })
      rebuild()
      paintAll()
      say('back the way it was')
    }, 8000)
  }

  // ---------- positions (persisted to the layouts table) ----------
  const pos = new Map<string, Pos>()
  const savedLayout: Record<string, { x: number; y: number }> = S().layouts['sky'] ?? {}
  function posOf(id: string): Pos {
    let p = pos.get(id)
    if (!p) {
      const saved = savedLayout[id]
      const x = saved ? saved.x * W : W * (0.2 + Math.random() * 0.6)
      const y = saved ? saved.y * H : H * (0.2 + Math.random() * 0.5)
      // a drop that has never been placed rises into the sky and settles;
      // one returning from a saved layout is simply already there
      const born = !saved && !reduced
      p = {
        x,
        y,
        rx: x,
        ry: born ? Math.min(y + 96, waterlineY() + 10) : y,
        s: born ? 0.42 : 1,
        vx: 0,
        vy: 0,
        mk: 0,
        mt: 0,
        mx: 1,
        my: 0,
      }
      pos.set(id, p)
    }
    return p
  }
  let layoutT: ReturnType<typeof setTimeout> | null = null
  function persistLayout() {
    if (layoutT) clearTimeout(layoutT)
    layoutT = setTimeout(() => {
      const out: Record<string, { x: number; y: number }> = {}
      for (const tl of view.tls) {
        const p = pos.get(tl.t.id)
        if (p) out[tl.t.id] = { x: p.x / W, y: p.y / H }
      }
      S().saveLayout('sky', out)
    }, 1200)
  }

  // ---------- language ----------
  function words(text: string) {
    return new Set(
      String(text || '')
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    )
  }
  function trim(s: string, n: number) {
    s = String(s).replace(/\s+/g, ' ').trim()
    return s.length > n ? s.slice(0, n - 1) + '…' : s
  }
  /**
   * How alike everything on stage is, worked out across the whole sky at once
   * because how much a word is worth depends on how many thoughts use it.
   * Rebuilt when the sky changes, not per question.
   */
  let kinIx: { v: number; k: Kinship } = { v: -1, k: kinship([]) }
  function kin(): Kinship {
    if (kinIx.v !== ver) {
      kinIx = {
        v: ver,
        k: kinship(
          view.tls.map((tl) => ({
            id: tl.t.id,
            title: label(tl.t) + (tl.kind === 'drop' ? ' ' + answersOf(tl.t).join(' ') : ''),
            inside: tl.kind === 'pool' ? tl.members.map((m) => label(m)) : undefined,
          })),
        ),
      }
    }
    return kinIx.k
  }
  /**
   * What a thought could reasonably be gathered with, closest first.
   *
   * `pool` is the ones it would actually go inside — which asks how much of
   * this thought the other one already accounts for, not how alike the two
   * are. A group is never much "like" one thing inside it, and asking that
   * question was half of why gather kept pulling in the wrong things.
   */
  function kinOf(tl: TL) {
    const k = kin()
    return k
      .nearest(tl.t.id, KIN_THREAD)
      .map((n) => {
        const byId = view.tls.find((x) => x.t.id === n.id)
        return byId
          ? {
              tl: byId,
              score: n.score,
              pool: k.belongs(tl.t.id, n.id) >= KIN_POOL && k.evidence(tl.t.id, n.id) >= KIN_EVIDENCE,
            }
          : null
      })
      .filter((x): x is { tl: TL; score: number; pool: boolean } => !!x)
  }
  let kinCache: { v: number; pairs: { a: TL; b: TL; score: number }[] } = { v: -1, pairs: [] }
  function allKinPairs() {
    if (kinCache.v === ver) return kinCache.pairs
    const k = kin()
    const pairs: { a: TL; b: TL; score: number }[] = []
    for (let i = 0; i < view.tls.length; i++) {
      for (let j = i + 1; j < view.tls.length; j++) {
        const score = k.score(view.tls[i].t.id, view.tls[j].t.id)
        if (score >= KIN_THREAD) pairs.push({ a: view.tls[i], b: view.tls[j], score })
      }
    }
    kinCache = { v: ver, pairs: pairs.sort((a, b) => b.score - a.score).slice(0, 12) }
    return kinCache.pairs
  }
  function hasThread(a: string, b: string) {
    return view.threads.some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a))
  }
  function sharedConcept(texts: string[]): string | null {
    const counts = new Map<string, number>()
    for (const t of texts) for (const w of words(t)) counts.set(w, (counts.get(w) ?? 0) + 1)
    let best: string | null = null
    for (const [w, n] of counts) if (n >= 2 && (!best || n > (counts.get(best) ?? 0))) best = w
    return best ? best[0].toUpperCase() + best.slice(1) : null
  }
  function conceptName(texts: string[]) {
    const counts = new Map<string, number>()
    for (const t of texts) for (const w of words(t)) counts.set(w, (counts.get(w) ?? 0) + 1)
    let best: string | null = null
    for (const [w, n] of counts) if (n >= 2 && (!best || n > (counts.get(best) ?? 0))) best = w
    if (best) return best[0].toUpperCase() + best.slice(1)
    const first = String(texts[0] || 'Pool')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    const guess = first.slice(0, 2).join(' ')
    // Never name a group after one of the things inside it. With nothing in
    // common the fallback took words off the first member, so a new group and
    // its own child wore the same label until the real name landed.
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    if (!guess || texts.some((t) => same(guess, t))) return `${texts.length} together`
    return guess
  }
  function sigOf(tl: TL) {
    return tl.kind === 'pool'
      ? tl.members.map((m) => label(m)).sort().join('|')
      : label(tl.t) + '·' + answersOf(tl.t).length
  }

  // ---------- radii ----------
  const looseCount = () => view.tls.filter((tl) => tl.kind === 'drop').length
  function radiusOf(tl: TL) {
    if (tl.kind === 'pool') return Math.min(126, 78 + tl.members.length * 9)
    if (openPool && memberShown(tl.t)) return 50
    const shrink = Math.min(22, Math.max(0, (looseCount() - 5) * 2.5))
    return Math.max(36, Math.min(112, 62 + answersOf(tl.t).length * 13 - shrink))
  }
  const memberShown = (_t: Thought) => false // members render via their own paint path

  // ---------- painting ----------
  const els = new Map<string, HTMLDivElement>()
  function mountEl(id: string, cls: string) {
    const el = document.createElement('div')
    el.className = cls
    el.dataset.id = id
    el.style.setProperty('--blob', blobOf(id))
    field.appendChild(el)
    els.set(id, el)
    return el
  }
  function unmountEl(id: string) {
    els.get(id)?.remove()
    els.delete(id)
  }
  // A pool with a lot inside it holds smaller members, so the ring it needs
  // does not run away with the whole sky. The cost is that at twenty members
  // they are too small to read — which is what tapping one is for.
  function memberR(n = 1) {
    // Sized for the ring it will actually stand in, not for the whole pool.
    // Twenty in one ring meant twenty tiny discs; twenty across two rings is
    // ten each, and ten can be read.
    return Math.max(38, Math.min(50, 54 - perRing(n) * 1.6))
  }
  /**
   * How a pool's contents are laid out: one ring while one will do, and more
   * than one as soon as a single ring stops being a ring.
   *
   * At twenty members a lone ring is a bad shape twice over — every drop
   * shrinks to fit the circumference, and the circumference gets so long that
   * the far side of it is off the screen. Neither is what "open the group" is
   * supposed to look like. Rings inside rings keep each one loose enough to
   * read and the whole thing small enough to see at once.
   */
  const RING_MAX = 11
  function ringCounts(n: number): number[] {
    if (n <= RING_MAX) return n ? [n] : []
    // as few rings as will hold it, then shared out so no ring is nearly empty
    const rings = Math.ceil(n / RING_MAX)
    const out: number[] = []
    let left = n
    for (let i = 0; i < rings; i++) {
      // outer rings are longer and can carry more, which also keeps the gaps
      // between neighbours about equal from the inside out
      const share = Math.round((n * (i + 1.4)) / ((rings * (rings + 1)) / 2 + rings * 0.4))
      const take = i === rings - 1 ? left : Math.max(1, Math.min(left - (rings - 1 - i), share))
      out.push(take)
      left -= take
    }
    return out
  }
  /** How many will be standing beside each other, for sizing. */
  function perRing(n: number): number {
    const counts = ringCounts(n)
    return counts.length ? Math.max(...counts) : n
  }
  /** The one member you have tapped open, so it can be read. */
  let peek: string | null = null
  /** Where on the ring it was standing when you tapped it. It grows from
   *  there rather than travelling anywhere, so what you opened is still the
   *  thing under your finger. */
  let peekAt: { a: number; r: number } | null = null
  /** The ring turns, slowly, so an open pool is never quite still. */
  const ringSpin = () => t * 0.05
  /** Frames left in which the view may still slide to fit the opening card.
   *  It settles once and then lets go — asserting it forever would mean you
   *  could never pan away from the thing you were reading. */
  let peekSettle = 0
  /** The radius the open ring is *actually* standing at this frame. It grows
   *  to make room for a card, and anything placed outside the ring has to know
   *  that or it ends up sitting in the middle of the members. */
  let ringR = 0
  /**
   * How much room a member takes up.
   *
   * The one you are reading is not a circle. A circle is a poor container for
   * a sentence — you lose the four corners and what is left is a narrow column
   * — so it spreads into a soft rounded card sized to its own text. Everything
   * that places members needs one number, so this reports the radius of the
   * circle that would contain it, measured off the real element once it exists.
   */
  function memberRadiusOf(id: string, n: number) {
    const base = memberR(n)
    if (peek !== id) return base
    const el = els.get(id)
    if (el?.clientWidth) return Math.hypot(el.clientWidth, el.clientHeight) / 2
    return Math.max(base * 2.4, 96)
  }
  /**
   * The opened card, sized in screen terms so it reads the same at any zoom.
   *
   * Narrow on purpose. Run it to the full width of the glass and three lines
   * of text come out four times as wide as they are tall — and a shape that
   * flat can only be an oblong, however its corners are drawn. Held closer to
   * the width of a column of prose, the same words take more lines, the body
   * comes out nearer square, and what opens reads as a drop that swelled
   * rather than a bar laid across the sky.
   */
  function peekBox() {
    const k = camTarget?.k ?? cam.k
    const per = 1 / Math.max(0.2, k)
    return { w: Math.min(224, W - 112) * per, font: 15 * per, pad: 16 * per }
  }
  /**
   * What shape each thing on stage actually is, measured off the real element.
   *
   * Everything that has to reason about crowding — who is overlapping whom,
   * which way to move, where two surfaces meet — asks this rather than assuming
   * a circle, because once one member is a card the circles stop being true.
   * Measured when the paint changes and not per frame: sizes only move when
   * something is repainted, and reading them back forces a layout.
   */
  const shapes = new Map<string, { hw: number; hh: number; r: number }>()
  function measureOne(id: string, el: HTMLDivElement) {
    const hw = el.offsetWidth / 2
    const hh = el.offsetHeight / 2
    if (!hw || !hh) return
    // Every body's corners now run to the full half of its short side — a disc
    // is that all the way round, an opened card is that at both ends. Nothing
    // is measured as a rectangle any more, because nothing is drawn as one.
    shapes.set(id, { hw, hh, r: Math.min(hw, hh) })
  }
  function measureShapes() {
    for (const [id, el] of els) measureOne(id, el)
    for (const id of [...shapes.keys()]) if (!els.has(id)) shapes.delete(id)
  }
  /**
   * Bring the thing being read fully onto the glass.
   *
   * A card opens where it stood, and a card that stood near the edge of the
   * ring opens over the edge of the screen. Moving the card to fix that is the
   * one thing it must not do — so the view comes to the card instead. Only the
   * camera slides, and only as far as it has to; the zoom is left alone,
   * because the card is sized off the zoom and chasing one with the other never
   * settles.
   */
  function bringIntoView(id: string, box: { hw: number; hh: number }) {
    const p = pos.get(id)
    if (!p) return
    const k = cam.k
    const pad = 14
    const left = toScreenX(p.x - box.hw)
    const right = toScreenX(p.x + box.hw)
    const top = toScreenY(p.y - box.hh)
    const bottom = toScreenY(p.y + box.hh)
    let dx = 0
    let dy = 0
    // if it is wider than the glass there is no framing that contains it;
    // centre it and let both ends run off rather than pinning one edge
    if (right - left > W - pad * 2) dx = W / 2 - (left + right) / 2
    else if (left < pad) dx = pad - left
    else if (right > W - pad) dx = W - pad - right
    const ceil = 68
    const floor = waterlineY() - 108
    if (bottom - top > floor - ceil) dy = (ceil + floor) / 2 - (top + bottom) / 2
    else if (top < ceil) dy = ceil - top
    else if (bottom > floor) dy = floor - bottom
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    // fold into whatever the camera was already doing rather than fighting it
    const to = camTarget ?? { x: cam.x, y: cam.y, k }
    camTarget = { x: to.x + dx, y: to.y + dy, k: to.k }
  }

  /** A body at its live position, in world coordinates. */
  function bodyOf(id: string, fallbackR = 40): Body {
    const p = pos.get(id)
    const x = p?.x ?? 0
    const y = p?.y ?? 0
    const s = shapes.get(id)
    return s ? card(x, y, s.hw, s.hh, s.r, wabiSeed(id)) : disc(x, y, fallbackR, wabiSeed(id))
  }
  /** The same body where it is being *drawn* this frame, not where it is
   *  heading — anything drawn between two bodies has to be built from the
   *  positions they are actually at or it trails a frame behind them. */
  function drawnBodyOf(id: string, fallbackR = 40): Body {
    const p = pos.get(id)
    const x = p?.rx ?? 0
    const y = p?.ry ?? 0
    const k = p?.s ?? 1
    const s = shapes.get(id)
    return s
      ? card(x, y, s.hw * k, s.hh * k, s.r * k, wabiSeed(id))
      : disc(x, y, fallbackR * k, wabiSeed(id))
  }
  /**
   * Let an open pool's members settle against one another.
   *
   * The ring only ever says roughly where each thing belongs. What decides
   * where it actually ends up is not being on top of its neighbours — and that
   * is measured against their real outlines, so a drop can tuck into the space
   * beside a card rather than orbiting a corner the card does not have.
   *
   * The thing you are reading is the one thing that never gives way: it is what
   * you asked for, so everything else moves around it.
   */
  const SETTLE_GAP = 8
  function separate(g: TL, gp: Pos) {
    const movers = g.members.map((m) => m.id)
    if (movers.length < 2) return
    const fallback = memberR(movers.length)
    const bodies = movers.map((id) => bodyOf(id, fallback))
    const held = movers.map((id) => id === peek || (drag && drag.id === id))
    const pool = { ...bodyOf(g.t.id, radiusOf(g)), x: gp.x, y: gp.y }
    // four passes rather than three: the ring is pulling them back together
    // every frame, and three left a few pixels of overlap standing in a crowd
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          if (held[i] && held[j]) continue
          const c = contact(bodies[i], bodies[j], SETTLE_GAP)
          if (!c) continue
          // whichever of the two can move takes the whole correction
          const wi = held[i] ? 0 : held[j] ? 1 : 0.5
          const move = c.depth * 0.58
          bodies[i].x -= c.nx * move * wi
          bodies[i].y -= c.ny * move * wi
          bodies[j].x += c.nx * move * (1 - wi)
          bodies[j].y += c.ny * move * (1 - wi)
        }
        if (held[i]) continue
        // and nothing comes to rest sitting on the pool's own name
        const c = contact(pool, bodies[i], 6)
        if (c) {
          bodies[i].x += c.nx * c.depth * 0.6
          bodies[i].y += c.ny * c.depth * 0.6
        }
      }
    }
    movers.forEach((id, i) => {
      if (held[i]) return
      const p = posOf(id)
      p.x = bodies[i].x
      p.y = bodies[i].y
    })
  }
  // The ring an opened pool lays its members out on. Big enough to clear the
  // pool's own body and its name, and big enough that no two members touch —
  // whichever of those is the larger demand.
  /** Every ring an open pool stands on, innermost first. */
  function ringRadii(g: TL): number[] {
    const n = Math.max(1, g.members.length)
    const mr = memberR(n)
    const counts = ringCounts(n)
    const inner = radiusOf(g) + mr + 18
    let r = inner
    return counts.map((c, i) => {
      if (i > 0) r += mr * 2 + 14
      // and never so tight that neighbours on this ring would touch
      const apart = c > 1 ? (mr + 9) / Math.sin(Math.PI / c) : 0
      r = Math.max(r, apart)
      return r
    })
  }
  /** The outermost of them, which is what everything outside has to clear. */
  function orbitR(g: TL) {
    const rs = ringRadii(g)
    return rs.length ? rs[rs.length - 1] : radiusOf(g) + memberR(1) + 18
  }
  function paintDropEl(t: Thought, el: HTMLDivElement, r: number, asMember: boolean) {
    el.style.width = el.style.height = r * 2 + 'px'
    el.classList.toggle('saturated', isRipe(t))
    el.classList.toggle('member', asMember)
    el.classList.toggle('small', r < 50)
    const dots = answersOf(t).length
      ? `<div class="dots">${'<i></i>'.repeat(Math.min(3, answersOf(t).length))}</div>`
      : ''
    // A thought the agent went out for wears that permanently. It was the one
    // thing ⚡ did not leave behind: a minute of real research, and nothing in
    // the sky to say it had ever happened.
    const brief = briefOf(t.id)
    // A question that has been answered says "answered", not "a brief". The
    // difference is the whole of it: one of those means there is reading still
    // to do, and the other means you already know.
    const st = ex(t).answered_at
      ? `<div class="state blue">answered</div>`
      : brief
        ? `<div class="state blue">a brief${brief.sources.length ? ` · ${brief.sources.length} sources` : ''}</div>`
        : isRipe(t)
          ? `<div class="state blue">saturated</div>`
          : isKept(t)
            ? `<div class="state">has a path</div>`
            : dots
    const photo = imgOf(t) ? `<div class="photo"></div>` : ''
    el.innerHTML = (isRipe(t) ? `<div class="ring"></div>` : '') + photo + `<div class="t"></div>${r < 50 ? '' : st}`
    const ph = el.querySelector('.photo') as HTMLDivElement | null
    if (ph && imgOf(t)) ph.style.backgroundImage = `url(${imgOf(t)})`
    const tx = el.querySelector('.t') as HTMLDivElement
    // type grows with the drop, so a big idea reads big and a small one stays quiet
    tx.style.fontSize = Math.round(Math.max(10.5, Math.min(17, 6 + r * 0.105)) * 10) / 10 + 'px'
    tx.textContent = trim(label(t), r < 50 ? 40 : 92)
  }
  /** What is on stage: the roots, plus the group you are currently inside if
   *  that group is itself nested and so is not a root. */
  function onStage(): TL[] {
    if (!openPool) return view.tls
    const o = view.byId.get(openPool)
    if (!o || view.tls.some((tl) => tl.t.id === openPool)) return view.tls
    return [...view.tls, o]
  }

  /** How much of the top-right corner the sky's own two notes are using. The
   *  header that used to have to dodge them is gone — the app speaks at the
   *  bottom now — but the corner is still measured, because anything that ever
   *  wants to sit up there needs to know. */
  function measureCorner() {
    const w =
      (restEl.classList.contains('show') ? restEl.offsetWidth + 8 : 0) +
      (tidyEl.classList.contains('show') ? tidyEl.offsetWidth + 8 : 0)
    document.documentElement.style.setProperty('--head-clear', `${Math.round(w)}px`)
  }

  function paintAll() {
    // Two things have to still be true before anything is drawn, and when they
    // stop being true the sky does not merely look wrong — it becomes unusable.
    //
    // `recede` is "something else is holding the stage": six per cent opacity
    // and no pointer events. It is applied to everything that is not the open
    // pool. So if `openPool` names something that is no longer there — a group
    // archived by the empty-group sweep a second after you took its last
    // member out, a group you put away from its own page — then *nothing* is
    // the open pool, everything recedes, and you are left looking at a sky at
    // six per cent that will not answer a tap. The same for `peek`: a card that
    // was being read and has since been put away leaves the whole group dimmed
    // behind a thing that is not on screen.
    if (openPool && view.byId.get(openPool)?.kind !== 'pool') openPool = null
    if (peek && !view.byId.has(peek)) {
      peek = null
      peekAt = null
    }
    const stage = onStage()
    // and the same again from the other end: whatever the reason, if the thing
    // holding the stage is not on it, nothing is holding the stage
    if (openPool && !stage.some((tl) => tl.t.id === openPool)) openPool = null

    const alive = new Set<string>()
    for (const tl of stage) {
      alive.add(tl.t.id)
      const el = els.get(tl.t.id) ?? mountEl(tl.t.id, tl.kind === 'pool' ? 'skyb pool' : 'skyb')
      el.classList.toggle('pool', tl.kind === 'pool')
      // an open pool takes the stage; everything else steps back
      el.classList.toggle('recede', !!openPool && openPool !== tl.t.id)
      // the group steps back while you read one of the things inside it, so
      // the card is not sitting on top of its own name
      el.classList.toggle('behind', !!peek && openPool === tl.t.id)
      if (tl.kind === 'pool') {
        const r = radiusOf(tl)
        el.style.width = el.style.height = r * 2 + 'px'
        const shifted = isKept(tl.t) && !!ex(tl.t).planSig && ex(tl.t).planSig !== sigOf(tl)
        const open = openPool === tl.t.id
        const pb = briefOf(tl.t.id)
        const st = open
          ? ''
          : shifted
            ? 'the sky shifted'
            : pb
              ? `a brief · ${tl.members.length} inside`
              : isKept(tl.t)
                ? 'has a path'
                : `${tl.members.length} inside`
        const next = tl.members[0]
        const peek = !open && next ? `<div class="peek"></div>` : ''
        el.innerHTML =
          `<div class="t" style="font-weight:600"></div>` + peek + (st ? `<div class="state ${shifted || pb ? 'blue' : ''}"></div>` : '')
        const nameEl = el.querySelector('.t') as HTMLDivElement
        nameEl.style.fontSize = Math.round(Math.max(12, Math.min(18, 7 + r * 0.1)) * 10) / 10 + 'px'
        nameEl.textContent = label(tl.t)
        if (st) (el.querySelector('.state') as HTMLDivElement).textContent = st
        if (peek) (el.querySelector('.peek') as HTMLDivElement).textContent = '→ ' + trim(label(next), 34)
      } else {
        paintDropEl(tl.t, el, radiusOf(tl), false)
      }
      // open pool renders its contents in orbit — and one of those may itself
      // be a pool, which is what makes groups within groups visible
      if (tl.kind === 'pool' && openPool === tl.t.id) {
        for (const m of tl.members) {
          alive.add(m.id)
          const mr = memberRadiusOf(m.id, tl.members.length)
          const me = els.get(m.id) ?? mountEl(m.id, 'skyb')
          me.classList.remove('recede')
          // opened for reading: full text, in the middle, above a dimmed ring.
          // Everything else steps back — reading one thing should not mean
          // reading it through twenty others.
          me.classList.toggle('peek', peek === m.id)
          me.classList.toggle('behind', !!peek && peek !== m.id)
          const inner = view.kidsOf.get(m.id)?.length ?? 0
          if (inner) {
            me.classList.add('pool', 'member')
            me.classList.remove('small')
            me.style.width = me.style.height = mr * 2 + 'px'
            me.innerHTML = `<div class="t" style="font-weight:600"></div><div class="state"></div>`
            const nm = me.querySelector('.t') as HTMLDivElement
            nm.style.fontSize = Math.round(Math.max(11, Math.min(15, 6 + mr * 0.11)) * 10) / 10 + 'px'
            nm.textContent = label(m)
            ;(me.querySelector('.state') as HTMLDivElement).textContent = `${inner} inside`
          } else if (peek === m.id) {
            // as wide as a sentence wants and only as tall as it needs, with a
            // hand-blown rounded edge rather than a circle
            const box = peekBox()
            me.classList.remove('pool', 'small')
            me.classList.add('member')
            me.style.width = box.w + 'px'
            me.style.height = 'auto'
            // Generous all round, and generous above and below on purpose: air
            // there is what stops two lines of text coming out in a body four
            // times as wide as it is tall. The corners still take room off the
            // ends, so the sides keep a little more than the top and bottom.
            me.style.padding = `${(box.pad * 1.5).toFixed(1)}px ${(box.pad * 1.62).toFixed(1)}px`
            // its corners are set from the box, not in pixels, so they eat
            // almost the whole of the sides: what opens is a blob that happens
            // to hold a sentence, not a rectangle with the edges taken off
            me.style.setProperty('--blob', wabiBlob(m.id))
            me.innerHTML = `<div class="t"></div>`
            const tx = me.querySelector('.t') as HTMLDivElement
            tx.style.fontSize = box.font.toFixed(1) + 'px'
            tx.style.width = '100%'
            tx.textContent = label(m)
          } else {
            me.classList.remove('pool')
            me.style.height = ''
            me.style.padding = ''
            me.style.setProperty('--blob', blobOf(m.id))
            paintDropEl(m, me, mr, true)
          }
        }
      }
    }
    for (const [id] of els) if (!alive.has(id)) unmountEl(id)
    // Last resort, and the reason it exists: a sky where every single thing is
    // behind glass has no way back out of itself, because the things you would
    // tap to escape are the things that stopped taking taps. If that ever
    // happens, whatever we believed was open was wrong.
    if (openPool && ![...els.values()].some((e) => !e.classList.contains('recede'))) {
      openPool = null
      for (const e of els.values()) e.classList.remove('recede')
    }
    // What is out of the sky but not gone. Resting and put-away are the same
    // category as far as anyone reading is concerned — things you moved aside
    // and might want back — and one pill for both keeps the corner from growing
    // a third thing. Without this, a group you put away was recoverable only
    // until your next action replaced the undo bar, which is not a bin, it is a
    // grace period.
    const resting = S().thoughts.filter((t) => t.status === 'snoozed').length
    const aside = putAway().length
    restEl.textContent =
      resting && aside
        ? `☁ ${resting + aside} aside`
        : aside
          ? `☁ ${aside} put away`
          : `☁ ${resting} resting`
    restEl.classList.toggle('show', resting + aside > 0)
    // the tidy pill stands beside it rather than across the screen from it,
    // and needs to know how much room the count is taking
    document.body.classList.toggle('sky-resting', resting > 0)
    if (resting > 0) document.documentElement.style.setProperty('--rest-w', `${Math.round(restEl.offsetWidth)}px`)
    measureCorner()
    // first-run invite
    inviteEl.style.display = view.tls.length === 0 ? '' : 'none'
    measureShapes()
    paintNext()
  }

  // the question bubble — pure invitation, not a stored thought
  const inviteEl = document.createElement('div')
  inviteEl.className = 'skyb'
  inviteEl.dataset.id = '__invite'
  inviteEl.style.width = inviteEl.style.height = '192px'
  inviteEl.innerHTML = `<div class="q">What’s on your mind?</div>`
  field.appendChild(inviteEl)
  const invitePos: Pos = { x: W / 2, y: H * 0.34, rx: W / 2, ry: H * 0.34, s: 1, vx: 0, vy: 0, mk: 0, mt: 0, mx: 1, my: 0 }

  // ---------- splash / say ----------
  function splash(x: number) {
    for (const s of [26, 48]) {
      const r = document.createElement('div')
      r.className = 'sky-ripple'
      r.style.width = r.style.height = s + 'px'
      r.style.left = x - s / 2 + 'px'
      r.style.top = waterlineY() - 5 + 'px'
      r.style.transform = 'scaleY(0.32)'
      stage.appendChild(r)
      setTimeout(() => r.remove(), 950)
    }
  }
  let sayT: ReturnType<typeof setTimeout> | null = null
  /** Standing text: while something is genuinely still happening, or has just
   *  finished and has not been acknowledged. `say` must not wipe it. */
  let held: string | null = null
  let heldWho: string | null = null
  /**
   * Where the app speaks, and why it is no longer the top of the sky.
   *
   * It was a line of small grey type centred across the head of the screen,
   * and for a four-word acknowledgement that was right: quiet, out of the way,
   * gone in four seconds. Then the agent started answering questions, and the
   * same line had to carry three sentences of an answer — so it wrapped across
   * four rows, laid itself over the bubbles, and ran underneath the cloud pill
   * in the corner. Legible and calm, and not focused: the most considered
   * thing the app had ever said to you, delivered as a watermark.
   *
   * So it has its own surface, at the bottom where your thumb already is, made
   * of the same glass as everything else — and it takes over the slot the
   * recommendation uses, because the app saying something and the app
   * suggesting something are the same voice and should never be two.
   */
  function paintVoice() {
    const msg = voiceT ?? held
    const who = voiceT ? voiceWhoT : heldWho
    voiceEl.classList.toggle('show', !!msg)
    voiceWho.textContent = who ?? ''
    voiceWho.hidden = !who
    voiceLb.textContent = msg ?? ''
    // the recommendation and the agent share one place; whoever is speaking wins
    paintNext()
  }
  let voiceT: string | null = null
  let voiceWhoT: string | null = null
  function say(msg: string, who?: string) {
    voiceT = msg
    voiceWhoT = who ?? null
    paintVoice()
    if (sayT) clearTimeout(sayT)
    sayT = setTimeout(() => {
      // fall back to whatever is still going on rather than to silence
      sayT = null
      voiceT = null
      voiceWhoT = null
      paintVoice()
    }, 4200)
  }
  /**
   * Say something and keep saying it.
   *
   * A four-second message is right for "returned to the ocean" and wrong for
   * anything you might have walked away from. ⚡ is out for the best part of a
   * minute; a line that vanishes after four seconds of that reads as the
   * button having done nothing at all.
   */
  function hold(msg: string | null, who?: string) {
    held = msg
    heldWho = msg ? (who ?? null) : null
    if (msg && sayT) {
      clearTimeout(sayT)
      sayT = null
      voiceT = null
      voiceWhoT = null
    }
    paintVoice()
  }

  /**
   * Something happened to your thinking, and here is the record of it.
   *
   * Only outcomes. "Working it in…" and "still out there · 40s" are the app
   * talking about itself; a log of those is a transcript, and a transcript is
   * not what you want when you come back tomorrow to a sky that has moved.
   */
  function record(what: string, subject?: string) {
    noteTrail(what, subject)
  }

  // ---------- undo / ocean / clouds ----------
  let undoFn: (() => void) | null = null
  let undoT: ReturnType<typeof setTimeout> | null = null
  function offerUndo(lb: string, fn: () => void) {
    offerAction(lb, 'bring it back', fn, 6000)
  }
  /**
   * The bar at the foot of the sky: something happened, and here is the one
   * thing you might want to do about it.
   *
   * With no `ms` it stays. Undo has to expire — an offer to reverse something
   * you did ten minutes ago is noise — but a result you waited a minute for
   * must not, because the waiting is exactly when you put the phone down.
   */
  function offerAction(lb: string, go: string, fn: () => void, ms?: number) {
    undoLb.textContent = lb
    undoGo.textContent = go
    undoFn = fn
    undoEl.classList.add('show')
    if (undoT) clearTimeout(undoT)
    undoT = ms ? setTimeout(() => hideUndo(), ms) : null
  }
  function hideUndo() {
    undoEl.classList.remove('show')
    undoFn = null
  }
  undoGo.addEventListener('click', () => {
    if (!undoFn) return
    const f = undoFn
    hideUndo()
    hold(null)
    f()
  })

  function completeDrop(t: Thought) {
    const el = els.get(t.id)
    const p = posOf(t.id)
    const poolId = view.tls.find((tl) => tl.kind === 'pool' && tl.members.some((m) => m.id === t.id))?.t.id
    S().updateThought(t.id, { status: 'done', completed_at: new Date().toISOString() })
    let poolDone = false
    if (poolId) {
      const remaining = view.byId.get(poolId)?.members.filter((m) => m.id !== t.id).length ?? 0
      if (remaining === 0) {
        S().updateThought(poolId, { status: 'done', completed_at: new Date().toISOString() })
        poolDone = true
      }
    }
    if (el) {
      els.delete(t.id)
      const r = el.clientWidth / 2 || 40
      const line = waterlineY()
      // pulled under: it flattens as it meets the surface, then goes down
      el.style.transition = 'transform 560ms cubic-bezier(0.35, 0, 0.7, 0.55), opacity 560ms ease-in 180ms'
      el.style.transform = `translate3d(${p.rx - r}px, ${(line - cam.y) / cam.k - r}px, 0) scale(1.06, 0.7)`
      setTimeout(() => {
        el.style.transition = 'transform 620ms cubic-bezier(0.5, 0, 0.9, 0.5), opacity 620ms'
        el.style.transform = `translate3d(${p.rx - r}px, ${(line + 90 - cam.y) / cam.k - r}px, 0) scale(0.3, 0.24)`
        el.style.opacity = '0'
      }, reduced ? 0 : 420)
      setTimeout(() => el.remove(), reduced ? 0 : 1120)
    }
    setTimeout(() => splash(p.rx * cam.k + cam.x), reduced ? 0 : 420)
    haptics.sink()
    say(poolDone ? 'returned to the ocean — the pool with it' : 'returned to the ocean')
    offerUndo(`“${trim(label(t), 26)}” returned to the ocean`, () => {
      S().updateThought(t.id, { status: 'open', completed_at: null })
      if (poolDone && poolId) S().updateThought(poolId, { status: 'open', completed_at: null })
      say('back from the ocean')
    })
  }
  function restDrop(t: Thought) {
    const until = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    S().updateThought(t.id, { status: 'snoozed', snooze_until: until })
    clearAll()
    say('rising into the high clouds — back tomorrow')
    offerUndo(`“${trim(label(t), 26)}” is resting`, () => {
      S().updateThought(t.id, { status: 'open', snooze_until: null })
    })
  }
  let tidying = false
  tidyEl.addEventListener('click', async () => {
    if (tidying) return
    tidying = true
    tidyEl.textContent = 'tidying…'
    const res = await tidySky((goalId, i, total) => {
      const p = posOf(goalId)
      const ang = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
      p.x = p.rx = worldW() / 2 + Math.cos(ang) * 220
      p.y = p.ry = worldH() / 2 + Math.sin(ang) * 180
    })
    tidying = false
    tidyEl.textContent = '✦ tidy'
    if (res.kind === 'tidied') {
      haptics.join()
      fitWhenSettled()
      const bits: string[] = []
      if (res.made) bits.push(`${res.made} new pool${res.made === 1 ? '' : 's'}`)
      if (res.joined) bits.push(`${res.joined} gathered`)
      say(res.note || bits.join(' · '))
      record(`tidied the sky — ${bits.join(' · ') || 'nothing moved'}`)
      if (res.focus) setTimeout(() => say(`worth your attention: ${res.focus}`), 4400)
    } else say(res.kind === 'failed' ? 'could not tidy just now' : 'nothing obvious to gather')
  })
  /**
   * Everything put away, however long ago.
   *
   * This was a week, so that the pill would not grow a number nobody reads —
   * which quietly meant anything older simply ceased to exist as far as the app
   * was concerned. Now that there is a page listing them, the honest count is
   * all of them: a pill saying twelve when there are forty is worse than a pill
   * saying forty.
   */
  function putAway(): Thought[] {
    return S().thoughts.filter((t) => t.status === 'archived')
  }
  // The pill used to bring everything back at once, which is the right gesture
  // for three resting thoughts and the wrong one for a group you put away last
  // month among forty others. It opens the list instead, and the list still has
  // "bring all back" in it for when that is what you meant.
  restEl.addEventListener('click', () => {
    clearAll()
    openPage('aside', undefined, W / 2, 120)
  })
  // wake anything whose rest is over
  for (const t of S().thoughts) {
    if (t.status === 'snoozed' && t.snooze_until && t.snooze_until <= todayISO()) {
      S().updateThought(t.id, { status: 'open', snooze_until: null })
    }
  }

  // ---------- pools / threads ----------
  function partOfRel(childId: string) {
    return S().relationships.find((r) => r.type === 'part_of' && r.from_id === childId)
  }
  // Two drops do not blink into a pool — they rush together, meet, and the
  // pool grows out of where they met.
  function coalesce(from: { x: number; y: number; r: number }[], at: { x: number; y: number }) {
    if (reduced) return
    for (const f of from) {
      const g = document.createElement('div')
      g.className = 'sky-ghost'
      g.style.width = g.style.height = f.r * 2 + 'px'
      g.style.transform = `translate3d(${f.x - f.r}px, ${f.y - f.r}px, 0) scale(1)`
      field.appendChild(g)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          g.style.transform = `translate3d(${at.x - f.r}px, ${at.y - f.r}px, 0) scale(0.22)`
          g.style.opacity = '0'
        }),
      )
      setTimeout(() => g.remove(), 640)
    }
    const ring = document.createElement('div')
    ring.className = 'sky-join'
    const rr = Math.max(...from.map((f) => f.r)) * 2.1
    ring.style.width = ring.style.height = rr + 'px'
    ring.style.transform = `translate3d(${at.x - rr / 2}px, ${at.y - rr / 2}px, 0)`
    field.appendChild(ring)
    setTimeout(() => ring.remove(), 1160)
  }

  function poolTogether(a: TL, b: TL, at: { x: number; y: number }, parent?: string) {
    // one home each: whatever either of these belonged to, it belongs to the
    // result now. Leaving the old edge behind gives a node two parents, and
    // which one wins is then a matter of row order.
    const rehome = (id: string, to: string) => {
      const old = partOfRel(id)
      if (old) S().deleteRelationship(old.id)
      if (id !== to) S().addRelationship(id, to, 'part_of')
    }
    const pa = posOf(a.t.id)
    const pb = posOf(b.t.id)
    coalesce(
      [
        { x: pa.x, y: pa.y, r: radiusOf(a) },
        { x: pb.x, y: pb.y, r: radiusOf(b) },
      ],
      at,
    )
    if (a.kind === 'pool' && b.kind === 'pool') {
      for (const m of b.members) {
        const rel = partOfRel(m.id)
        if (rel) S().deleteRelationship(rel.id)
        S().addRelationship(m.id, a.t.id, 'part_of')
      }
      S().deleteThought(b.t.id)
      say(`pooled into “${label(a.t)}”`)
    } else if (a.kind === 'pool' || b.kind === 'pool') {
      const pool = a.kind === 'pool' ? a : b
      const drop = a.kind === 'pool' ? b : a
      rehome(drop.t.id, pool.t.id)
      say(`inside “${label(pool.t)}”`)
    } else {
      // the local guess lands instantly so the drag never waits; a real name
      // replaces it a moment later
      const name = conceptName([label(a.t), label(b.t)])
      const g = S().addThought({ raw_content: name, title: name, type: 'goal' })
      const p = posOf(g.id)
      p.x = p.rx = at.x
      p.y = p.ry = at.y
      p.s = 0.18 // the spring swells it out of the meeting point
      rehome(a.t.id, g.id)
      rehome(b.t.id, g.id)
      // a group made inside a group stays inside it
      if (parent && parent !== g.id) S().addRelationship(g.id, parent, 'part_of')
      const texts = [a, b].flatMap((tl) => (tl.kind === 'pool' ? tl.members.map(label) : [label(tl.t)]))
      nameThePool(g.id, texts)
      say(parent ? `a group inside — “${name}”` : `pooled — “${name}”`)
      record(parent ? `a group inside — “${name}”` : `pooled — “${name}”`)
    }
    splash(at.x)
    haptics.join()
  }
  function releaseMember(t: Thought, poolId: string) {
    const rel = partOfRel(t.id)
    if (rel) S().deleteRelationship(rel.id)
    say('released from the pool')
    const remaining = view.byId.get(poolId)?.members.filter((m) => m.id !== t.id) ?? []
    if (remaining.length === 0) openPool = null
  }

  // ---------- hold-gravity ----------
  let holding: { id: string; auto: boolean; started: number } | null = null
  function startPull(tl: TL, auto: boolean) {
    const kin = kinOf(tl)
      .slice(0, 6)
      .filter((k) => k.pool || !hasThread(tl.t.id, k.tl.t.id))
    if (!kin.length) {
      say('nothing like-minded nearby yet')
      return
    }
    closeMoons()
    holding = { id: tl.t.id, auto, started: performance.now() }
    els.get(tl.t.id)?.classList.add('holding')
    haptics.grab()
    say(auto ? 'gathering like-minded ideas…' : 'hold — like-minded ideas are drawn in')
  }
  function stepHold() {
    if (!holding) return
    const host = view.byId.get(holding.id)
    if (!host) {
      endHold(false)
      return
    }
    const kin = kinOf(host)
    let settled = true
    for (const k of kin.slice(0, 6)) {
      const strong = k.pool
      if (!strong && hasThread(host.t.id, k.tl.t.id)) continue
      const hp = posOf(host.t.id)
      const kp = posOf(k.tl.t.id)
      const dx = hp.x - kp.x
      const dy = hp.y - kp.y
      const dist = Math.hypot(dx, dy) || 1
      const target = radiusOf(host) + radiusOf(k.tl) + (strong ? -8 : 52)
      if (dist > target + 12) {
        settled = false
        const speed = Math.min(strong ? 8 : 5, dist * 0.07)
        kp.x += (dx / dist) * speed
        kp.y += (dy / dist) * speed
      }
    }
    if (holding.auto && (settled || performance.now() - holding.started > 3600)) endHold(true)
  }
  function endHold(resolve: boolean) {
    if (!holding) return
    const hostId = holding.id
    els.get(hostId)?.classList.remove('holding')
    holding = null
    if (!resolve) return
    let host = view.byId.get(hostId)
    if (!host) return
    const kin = kinOf(host).slice(0, 6)
    let merged = 0
    let threaded = 0
    for (const k of kin) {
      host = view.byId.get(hostId) ?? (host.kind === 'drop' ? view.tls.find((tl) => tl.kind === 'pool' && tl.members.some((m) => m.id === hostId)) : undefined)
      if (!host) break
      const cur = view.byId.get(k.tl.t.id)
      if (!cur) continue
      if (k.pool) {
        const hp = posOf(host.t.id)
        poolTogether(host, cur, { x: hp.x, y: hp.y })
        rebuild()
        merged++
      } else if (!hasThread(host.t.id, cur.t.id)) {
        S().addRelationship(host.t.id, cur.t.id, 'relates_to')
        threaded++
      }
    }
    rebuild()
    paintAll()
    if (merged || threaded) {
      const bits: string[] = []
      if (merged) bits.push(`${merged + 1} became one`)
      if (threaded) bits.push(`${threaded} now share a thread`)
      say(bits.join(' · '))
      record(`gathered — ${bits.join(' · ')}`, host ? trim(label(host.t), 40) : undefined)
    } else say('they drift near — but nothing binds yet')
  }

  /**
   * The one thing to do next, said quietly and permanently.
   *
   * The loop this app describes ends at "here is what to do next, and why",
   * and it never did — it handed you a sky full of steps and left you to pick,
   * which is the part you opened it to avoid. Worked out from the graph rather
   * than asked of a model, so it is instant, works offline, and the reason is
   * one you can check and disagree with.
   *
   * Hidden while you are inside something: it is a thing to notice on the way
   * past, never a thing in the way.
   */
  let nextFor: string | null = null
  function paintNext() {
    // …and it steps aside for the app's own voice, which stands in the same
    // place. Two things in one slot is a layout bug; the app suggesting
    // something and the app telling you something are one voice, so whichever
    // has something to say has it.
    const hide = !!openPool || !!pageFor || !!moonsFor || voiceEl.classList.contains('show')
    let n = hide ? null : nextAction(S().thoughts, S().relationships, todayISO())
    // If the agent has been asked to choose, its pick wins here too. Current
    // honours it; the sky did not, so the two could name different things at
    // the same moment — which is two recommendations, not one.
    const rec = S().profile?.settings.recommended_action as { id?: string; why?: string } | undefined
    if (!hide && rec?.id) {
      const t = S().thoughts.find((x) => x.id === rec.id && x.status === 'open')
      if (t) n = { thought: t, why: rec.why || 'the agent put this first' }
    }
    nextFor = n?.thought.id ?? null
    nextEl.classList.toggle('show', !!n)
    if (!n) return
    nextLb.textContent = trim(label(n.thought), 40)
    nextWhy.textContent = n.why
  }
  nextEl.addEventListener('click', () => {
    if (!nextFor) return
    const tl = view.byId.get(nextFor)
    // it may be inside a pool: go to the pool, and the thing is in the ring
    const parent = view.parentOf.get(nextFor)
    if (parent && view.byId.has(parent)) {
      openPool = parent
      peek = nextFor
      const g = view.byId.get(parent) as TL
      const mp = pos.get(nextFor)
      const gp = posOf(parent)
      // A member of a closed pool has never been placed, so there is no angle
      // to hold. Null rather than the last card's — the ring will give it one.
      peekAt = mp ? { a: Math.atan2(mp.y - gp.y, mp.x - gp.x) - ringSpin(), r: Math.hypot(mp.x - gp.x, mp.y - gp.y) } : null
      peekSettle = 96
      frameOpen(g)
      paintAll()
      haptics.grab()
      return
    }
    if (!tl) return
    // Moons first: opening them pushes the drop down to make room for them,
    // and framing where it *was* left the thing you asked for below the tab
    // bar with its actions off the bottom of the screen entirely.
    showMoons(tl)
    focusOn(posOf(nextFor))
    paintAll()
    haptics.grab()
  })

  // ---------- the light page ----------
  type PageMode = 'capture' | 'say' | 'edit' | 'path' | 'brief' | 'open' | 'aside'
  /** The brief ⚡ brought back for this thought, if it went out for one. */
  const briefOf = (id: string) => S().artifacts.find((a) => a.thought_id === id) ?? null
  let pageFor: { mode: PageMode; tl?: TL; ox: number; oy: number } | null = null
  /**
   * Which group the writing box is currently naming.
   *
   * The group page has no Save, because the × sits an inch from the name box
   * and a page that throws your typing away when you close it the obvious way
   * is a page that does not work. So the name commits the moment you leave the
   * field — the same rule every other field on that page already followed.
   */
  let nameFor: string | null = null
  /**
   * What still has to be written down before this page can go.
   *
   * Every field on the group page saves on `change`, which fires on blur. That
   * is enough on a desktop, where blur is delivered before the click that
   * caused it finishes. It is not enough on a phone: iOS can deliver blur
   * *after* the page has already begun tearing down, and a commit that arrives
   * after teardown is a commit that finds nothing to write to. So each field
   * also leaves behind a way to be read directly, and closing the page reads
   * them all first. Nothing here depends on an event arriving in time.
   */
  let pending: (() => void)[] = []
  function planOf(tl: TL): Step[] {
    if (tl.kind === 'drop') {
      const a = answersOf(tl.t)
      const why = a[0] || 'the reason it surfaced at all'
      const small = a[1] || 'the smallest version you can picture'
      const who = a[2] || 'one person who would get it'
      return [
        { ph: 'first', pt: 'Sit with it', detail: `Hold on to “${trim(why, 60)}.” Notice what keeps returning.` },
        { ph: 'then', pt: 'Shape the smallest true version', detail: `${trim(small, 70)} — small enough to finish before doubt arrives.` },
        { ph: 'then', pt: 'Make one piece of it real', detail: 'One sitting, one artifact. Rough is correct.' },
        { ph: 'later', pt: `Show it to ${trim(who, 36)}`, detail: 'Not for approval — to watch what happens.' },
      ]
    }
    const steps = tl.members.slice(0, 3).map((m) => {
      const t = trim(label(m), 46)
      if (/\?$/.test(label(m).trim())) return { ph: 'then', pt: `Answer: ${t}`, detail: 'One honest paragraph is enough.' }
      return { ph: 'then', pt: `Rough out “${t}”`, detail: 'A sketch, a note, a photo — proof it can exist.' }
    })
    return [
      { ph: 'first', pt: `Name the thread: ${label(tl.t)}`, detail: 'These ideas pooled for a reason. Say it in one line.' },
      ...steps,
      { ph: 'later', pt: 'Show the pool to someone who gets it', detail: 'Not for approval — to watch what happens.' },
    ].slice(0, 5)
  }
  /** Ignore whatever is left of the press that opened the page. */
  let deafT: ReturnType<typeof setTimeout> | null = null
  function deafenPage() {
    page.style.pointerEvents = 'none'
    if (deafT) clearTimeout(deafT)
    const hear = () => {
      page.style.pointerEvents = ''
      removeEventListener('pointerup', hear)
      removeEventListener('pointercancel', hear)
    }
    addEventListener('pointerup', hear, { once: true })
    addEventListener('pointercancel', hear, { once: true })
    // and a backstop, in case that release never arrives
    deafT = setTimeout(hear, 1400)
  }

  // How much of the glass the keyboard is covering. iOS never resizes the
  // layout viewport for it, so a fixed page has no idea it is there and puts
  // its own controls underneath it.
  const vv = window.visualViewport
  function measureKeyboard() {
    if (!vv) return
    const covered = Math.max(0, innerHeight - vv.height - vv.offsetTop)
    document.documentElement.style.setProperty('--kb', `${Math.round(covered)}px`)
  }
  vv?.addEventListener('resize', measureKeyboard)
  vv?.addEventListener('scroll', measureKeyboard)
  measureKeyboard()

  function openPage(mode: PageMode, tl: TL | undefined, ox: number, oy: number) {
    // The group page re-renders itself in place whenever its list changes, and
    // a half-typed name in the box above that list must survive the row you
    // just took out. Anything the outgoing render still owed goes in first —
    // safely, because every one of these is a no-op when nothing changed.
    const owed = pending
    pending = []
    for (const write of owed) write()
    pageFor = { mode, tl, ox, oy }
    nameFor = null
    pageA.style.display = 'none'
    pageA.innerHTML = ''
    const reading = mode === 'path' || mode === 'brief' || mode === 'aside'
    pageT.style.display = reading ? 'none' : ''
    page.classList.toggle('path', reading)
    page.classList.toggle('brief', mode === 'brief')
    page.classList.toggle('group', mode === 'open' || mode === 'aside')
    pageD.textContent =
      mode === 'brief'
        ? 'Done reading'
        : mode === 'aside'
          ? 'Done'
          : mode === 'say'
            ? 'Keep it'
            : mode === 'path'
              ? (tl && isKept(tl.t) ? 'Keep it' : 'Keep this path')
              : 'Done'
    // The agent's way out of the writing page. Not offered with nothing to
    // send it, and not offered when there is no way to reach it.
    pageD2.hidden = mode !== 'say' || S().offline
    if (mode === 'path' && tl) {
      pageQ.textContent = `The rain from “${trim(label(tl.t), 44)}”`
      const stale = isKept(tl.t) && !!ex(tl.t).planSig && ex(tl.t).planSig !== sigOf(tl)
      pageN.textContent = stale ? 'the sky shifted — this is fresh' : ''
      const plan = (isKept(tl.t) && !stale && (ex(tl.t).plan as Step[] | undefined)) || planOf(tl)
      patchExtra(tl.t, { plan, planSig: sigOf(tl) })
      pageA.style.display = 'block'
      pageA.innerHTML = plan
        .map((_, i) => `<div class="step${i === 0 ? ' first' : ''}"><div class="k"></div><div class="v"></div><div class="d"></div></div>`)
        .join('')
      const stepEls = [...pageA.querySelectorAll('.step')] as HTMLDivElement[]
      stepEls.forEach((el, i) => {
        // a numeral, not "then / then / then" — repetition carries no information
        ;(el.querySelector('.k') as HTMLElement).textContent = String(i + 1)
        ;(el.querySelector('.v') as HTMLElement).textContent = plan[i].pt
        ;(el.querySelector('.d') as HTMLElement).textContent = plan[i].detail
        el.style.transitionDelay = reduced ? '0ms' : 180 + i * 90 + 'ms'
      })
    } else if (mode === 'brief' && tl) {
      // What ⚡ actually came back with. It ran for the best part of a minute
      // and wrote all of this down; before, the only trace of it was four
      // seconds of text at the top of the sky and then nothing.
      const art = briefOf(tl.t.id)
      pageQ.textContent = art?.title || 'What came back'
      const when = art ? humanDate(art.created_at.slice(0, 10), todayISO()) : ''
      pageN.textContent = when ? `found ${when}` : ''
      pageA.style.display = 'block'
      pageA.innerHTML = briefHtml(art?.content_md ?? '', art?.sources ?? [])
      // sources are the point of a brief — they open, and they open out
      for (const a of [...pageA.querySelectorAll('a')]) {
        a.setAttribute('target', '_blank')
        a.setAttribute('rel', 'noreferrer noopener')
      }
    } else if (mode === 'open' && tl) {
      // Everything you can do to a group, in the one place a group is a thing
      // rather than a container: its name, what is in it, what is done, what
      // you want to add, which of its contents belong together, and the two
      // ways to be rid of it.
      //
      // Nothing here has a Save. Every field commits when you leave it, because
      // the × sits an inch from the name box and a page that loses your typing
      // when you close it the obvious way is a page that does not work.
      pageQ.textContent = tl.kind === 'pool' ? 'This group' : 'This drop'
      pageT.value = label(tl.t)
      pageT.placeholder = 'Name it'
      nameFor = tl.t.id
      pending.push(() => landUndo(rename(tl.t.id, pageT.value)))
      // Keeping what was just ticked, so the row strikes through under your
      // finger instead of vanishing out from under it — and settling to the
      // bottom, because four finished things stranded among nine unfinished
      // ones is a list you have to read twice to find your place in.
      const statusOf = (id: string) => S().thoughts.find((t) => t.id === id)?.status
      const inside = membersOf(tl.t.id, true).sort((a2, b2) => {
        const da = statusOf(a2.id) === 'done' ? 1 : 0
        const db = statusOf(b2.id) === 'done' ? 1 : 0
        if (da !== db) return da - db
        // among the finished, in the order they were finished
        return da ? String(a2.completed_at ?? '').localeCompare(String(b2.completed_at ?? '')) : 0
      })
      const done = () => inside.filter((m) => S().thoughts.find((t) => t.id === m.id)?.status === 'done').length
      const tally = () => {
        const d = done()
        pageN.textContent = !inside.length
          ? 'nothing inside it yet'
          : d
            ? `${inside.length} inside · ${d} done`
            : `${inside.length} inside`
      }
      tally()
      // Everything this thing holds, on the one page it has.
      //
      // It used to be three: a group page here, the brief behind its own moon,
      // the photo behind another. All three were "open what this holds", and
      // three buttons for one destination is how a row of actions gets to six.
      // Each section appears only when there is something in it, so a bare
      // drop still opens onto a name, a place to add, and a way to put it away.
      const answers = answersOf(tl.t)
      const shot = fullOf(tl.t)
      const hasBrief = !!briefOf(tl.t.id)
      const kin = kinOf(tl)
      pageA.style.display = 'block'
      pageA.innerHTML =
        (shot ? `<button class="shot" aria-label="See the photo full screen"><img alt="" /></button>` : '') +
        (inside.length
          ? `<div class="lab head"><span>what is inside</span>` +
            `<button class="ctl sel">Select</button></div>` +
            inside
              .map(
                (_m, i) =>
                  `<div class="row" data-i="${i}">` +
                  `<button class="tick" role="checkbox" aria-checked="false" aria-label="Done"></button>` +
                  `<input class="t" aria-label="What this is called" enterkeyhint="done" />` +
                  `<button class="ctl out" aria-label="Take it out of this group">take out</button></div>`,
              )
              .join('')
          : '') +
        `<div class="row add"><input class="t" placeholder="${
          inside.length || tl.kind === 'pool' ? 'Add something to this group…' : 'Add something under this…'
        }" enterkeyhint="done" aria-label="Add something to this" /></div>` +
        `<div class="picked" hidden><button class="ctl d go">Group these</button>` +
        `<button class="ctl d out">Take these out</button>` +
        `<button class="ctl d bad away">Put these away</button></div>` +
        (answers.length
          ? `<div class="lab">what it has absorbed</div>` + answers.map(() => `<div class="a"></div>`).join('')
          : '') +
        `<div class="danger">` +
        (hasBrief ? `<button class="ctl d" data-act="brief">Read what it brought back</button>` : '') +
        (kin.length ? `<button class="ctl d" data-act="gather">Gather what is like this</button>` : '') +
        (inside.length ? `<button class="ctl d" data-act="ungroup">Ungroup — keep what is inside</button>` : '') +
        `<button class="ctl d bad" data-act="bin">${
          inside.length ? 'Put the whole group away' : 'Put this away'
        }</button>` +
        `</div>`
      // the photo, and the two ways out that are journeys rather than deletions
      const shotBtn = pageA.querySelector('.shot')
      if (shotBtn && shot) {
        const im = shotBtn.querySelector('img') as HTMLImageElement
        im.src = imgOf(tl.t) as string
        shotBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          openPhoto(shot, label(tl.t))
        })
      }
      ;[...pageA.querySelectorAll('.a')].forEach((el, i) => ((el as HTMLElement).textContent = answers[i]))
      const briefBtn = pageA.querySelector('[data-act="brief"]')
      briefBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        closePage(true)
        setTimeout(() => openPage('brief', tl, ox, oy), reduced ? 0 : 120)
      })
      const gatherBtn = pageA.querySelector('[data-act="gather"]')
      gatherBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        closePage(true)
        startPull(tl, true)
      })

      // Two things a round control on the left of a row can mean, and they are
      // not the same thing: "this is finished" and "I have chosen this one".
      // Ticking off is what you do constantly, so it keeps the always-visible
      // spot and the shape everybody already reads. Choosing several is
      // occasional, so it lives behind a word — and while it is on, the ticks
      // become squares, because a mode you cannot see is a trap.
      let picking = false
      const picked = new Set<string>()
      const selBtn = pageA.querySelector('.sel') as HTMLButtonElement | null
      const pickedBar = pageA.querySelector('.picked') as HTMLDivElement
      const groupBtn = pickedBar.querySelector('.go') as HTMLButtonElement
      const takeBtn = pickedBar.querySelector('.out') as HTMLButtonElement
      const awayBtn = pickedBar.querySelector('.away') as HTMLButtonElement
      const refreshPicked = () => {
        pageA.classList.toggle('picking', picking)
        pickedBar.hidden = !picking || picked.size < 1
        groupBtn.hidden = picked.size < 2
        groupBtn.textContent = `Group these ${picked.size}`
        takeBtn.textContent = picked.size === 1 ? 'Take it out' : `Take these ${picked.size} out`
        awayBtn.textContent = picked.size === 1 ? 'Put it away' : `Put these ${picked.size} away`
        // "Cancel" rather than "Done selecting": leaving the mode drops the
        // picks, which is exactly what cancelling means, and the short word
        // keeps the header a header rather than a slab.
        if (selBtn) selBtn.textContent = picking ? 'Cancel' : 'Select'
      }
      selBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        picking = !picking
        if (!picking) {
          picked.clear()
          for (const r of [...pageA.querySelectorAll('.row.on')]) r.classList.remove('on')
        }
        refreshPicked()
      })
      refreshPicked()

      // .value, never innerHTML: these are the user's own words and they are
      // not markup
      ;[...pageA.querySelectorAll('.row:not(.add)')].forEach((row, i) => {
        const m = inside[i]
        const field = row.querySelector('.t') as HTMLInputElement
        field.value = label(m)
        row.classList.toggle('ticked', S().thoughts.find((t) => t.id === m.id)?.status === 'done')
        // No edit mode, no pencil, no second screen: the row is the field, so
        // fixing a name is typing over it. Committed when you leave it or press
        // return — and re-rendering the list here would steal the caret, so it
        // does not.
        const commit = () => landUndo(rename(m.id, field.value))
        pending.push(commit)
        field.addEventListener('change', commit)
        field.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') {
            e.preventDefault()
            field.blur()
          }
        })
        const tick = row.querySelector('.tick') as HTMLButtonElement
        tick.addEventListener('click', (e) => {
          e.stopPropagation()
          if (picking) {
            const on = !picked.has(m.id)
            if (on) picked.add(m.id)
            else picked.delete(m.id)
            tick.setAttribute('aria-checked', String(on))
            row.classList.toggle('on', on)
            refreshPicked()
            return
          }
          // ticked off: struck through here, gone from the sky, and one tap
          // away from being open again
          landUndo(complete(m.id))
          const nowDone = S().thoughts.find((t) => t.id === m.id)?.status === 'done'
          tick.setAttribute('aria-checked', String(nowDone))
          row.classList.toggle('ticked', nowDone)
          settle(row as HTMLDivElement, nowDone)
          tally()
        })
        row.querySelector('.out')?.addEventListener('click', (e) => {
          e.stopPropagation()
          // whatever they typed and did not commit goes in before the row does
          commit()
          landUndo(takeOut(m.id))
          // the page is showing a list that just changed
          openPage('open', tl, ox, oy)
        })
      })

      // Something new, straight in. Closing the page, finding the sky, holding
      // it, writing and dragging the result back is five moves for one thought.
      const addField = pageA.querySelector('.row.add .t') as HTMLInputElement
      const addOne = () => {
        const u = addTo(tl.t.id, addField.value)
        if (!u) return
        // emptied, so closing the page does not add it a second time
        addField.value = ''
        landUndo(u)
        openPage('open', tl, ox, oy)
        // and the caret stays where you were typing, ready for the next one
        ;(pageA.querySelector('.row.add .t') as HTMLInputElement)?.focus()
      }
      // half-typed and then closed is still something you wrote
      pending.push(() => {
        const u = addTo(tl.t.id, addField.value)
        if (u) landUndo(u)
      })
      addField.addEventListener('change', addOne)
      addField.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') {
          e.preventDefault()
          addOne()
        }
      })

      groupBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const chosen = inside.filter((m) => picked.has(m.id))
        const res = groupInto(tl.t.id, chosen.map((m) => m.id), conceptName(chosen.map(label)))
        if (!res) return
        landUndo(res.undone)
        // the local guess lands instantly; a real name replaces it a moment later
        nameThePool(res.groupId, res.texts)
        closePage(false)
        openPool = tl.t.id
        paintAll()
      })
      const bulk = (act: (id: string) => Undone | null, word: string) => (e: Event) => {
        e.stopPropagation()
        const ids = inside.filter((m) => picked.has(m.id)).map((m) => m.id)
        const undos = ids.map(act).filter((u): u is Undone => !!u)
        if (!undos.length) return
        rebuild()
        paintAll()
        const note = undos.length === 1 ? undos[0].note : `${undos.length} ${word}`
        record(note)
        offerAction(note, 'put them back', () => {
          for (const u of [...undos].reverse()) u.undo()
          rebuild()
          paintAll()
          redrawGroupPage()
          say('back the way it was')
        })
        openPage('open', tl, ox, oy)
      }
      takeBtn.addEventListener('click', bulk(takeOut, 'loose again'))
      // Running ⚡ on a goal twice fills it with near-duplicates — six pairs in
      // a list of twenty-five — and taking those out only moves the mess into
      // the sky. This is the one that clears them.
      awayBtn.addEventListener('click', bulk(bin, 'put away'))

      wireDanger(pageA, tl)
    } else if (mode === 'aside') {
      // Everything that is out of the sky but not gone. Resting things come
      // back on their own date; put-away things do not come back at all, and
      // before this page the only way to reach one was an undo bar that the
      // next action replaced. A bin you cannot open is a shredder.
      const rest = S().thoughts.filter((t) => t.status === 'snoozed')
      const away = S().thoughts
        .filter((t) => t.status === 'archived')
        .sort((a2, b2) => (a2.updated_at < b2.updated_at ? 1 : -1))
      pageQ.textContent = 'Set aside'
      pageN.textContent = ''
      pageA.style.display = 'block'
      const rows = (list: Thought[]) =>
        list
          .map(
            (_t, i) =>
              `<div class="row"><span class="t"></span>` +
              `<button class="ctl out" data-back="${i}" aria-label="Bring it back">bring back</button></div>`,
          )
          .join('')
      pageA.innerHTML =
        (rest.length ? `<div class="lab">resting — back on their own</div><div class="grp rest">${rows(rest)}</div>` : '') +
        (away.length ? `<div class="lab">put away</div><div class="grp away">${rows(away)}</div>` : '') +
        (!rest.length && !away.length ? `<div class="a">Nothing is set aside.</div>` : '') +
        (rest.length + away.length > 1
          ? `<div class="danger"><button class="ctl d" data-act="all">Bring all ${rest.length + away.length} back</button></div>`
          : '')
      const wake = (t: Thought) => {
        S().updateThought(t.id, { status: 'open', snooze_until: null })
      }
      for (const [sel, list] of [
        ['.grp.rest .row', rest],
        ['.grp.away .row', away],
      ] as [string, Thought[]][]) {
        ;[...pageA.querySelectorAll(sel)].forEach((row, i) => {
          // textContent: the user's own words, not markup
          ;(row.querySelector('.t') as HTMLElement).textContent = trim(label(list[i]), 46)
          row.querySelector('.out')?.addEventListener('click', (e) => {
            e.stopPropagation()
            wake(list[i])
            say(`“${trim(label(list[i]), 30)}” is back`)
            openPage('aside', undefined, ox, oy)
          })
        })
      }
      pageA.querySelector('.danger .d')?.addEventListener('click', (e) => {
        e.stopPropagation()
        for (const t of [...rest, ...away]) wake(t)
        closePage(false)
        say(`${rest.length + away.length} back in the sky`)
        fitWhenSettled()
      })
    } else if (mode === 'capture') {
      pendingImage = null
      pageQ.textContent = 'What’s on your mind?'
      pageT.value = ''
      pageT.placeholder = 'Let it storm.'
      pageN.textContent = '✦ organizes · or a line, a drop'
    } else if (mode === 'say' && tl) {
      /*
       * One page for putting words into a thing.
       *
       * There were two, and the line between them was mine rather than yours:
       * `grow` kept what you wrote inside the drop, `tell it` handed it to the
       * agent to move the map around. Both are "I want to add to this", and
       * both made you pick which one you meant *before* you had written a
       * word — which is the wrong order, because you find out what you have
       * said by saying it.
       *
       * So: write first. The two ways out are at the bottom, and choosing
       * between them is a decision about the sentence in front of you rather
       * than a guess about the sentence you are about to write.
       */
      pendingImage = null
      pageQ.textContent = QUESTIONS[answersOf(tl.t).length] || 'What else wants to be said?'
      pageT.value = ''
      pageT.placeholder = 'Anything at all — what you know, what changed, what you found out…'
      // The subject is the one thing you cannot have forgotten — you tapped it
      // a second ago — and with two buttons in the row it was being ellipsised
      // down to four characters. The room goes to the verbs.
      pageN.textContent = ''
    } else if (tl) {
      pageQ.textContent = 'Inside this drop'
      pageT.value = tl.t.raw_content
      pageT.placeholder = ''
      pageN.textContent = answersOf(tl.t).length ? '' : 'edits are kept'
      const answers = answersOf(tl.t)
      // Always shown now, because there was no way to throw a drop away from
      // anywhere in the sky. Every gesture in this app added; the only delete
      // in it lived on a route the sky has never linked to.
      pageA.style.display = 'block'
      pageA.innerHTML =
        (imgOf(tl.t) ? `<button class="shot" aria-label="See the photo full screen"><img alt="" /></button>` : '') +
        (answers.length
          ? `<div class="lab">what it has absorbed</div>` + answers.map(() => `<div class="a"></div>`).join('')
          : '') +
        `<div class="danger"><button class="ctl d bad" data-act="bin">Put this away</button></div>`
      const im = pageA.querySelector('img')
      if (im && imgOf(tl.t)) im.src = imgOf(tl.t) as string
      // the thumbnail is a way in, not a decoration: a picture you cannot open
      // is the exact thing this page was missing
      const shotBtn = pageA.querySelector('.shot')
      const big = fullOf(tl.t)
      if (shotBtn && big) {
        shotBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          openPhoto(big, label(tl.t))
        })
      }
      ;[...pageA.querySelectorAll('.a')].forEach((el, i) => ((el as HTMLElement).textContent = answers[i]))
      wireDanger(pageA, tl)
    }
    pageMic.classList.toggle('show', speechOK && (mode === 'capture' || mode === 'say'))
    pageMic.classList.remove('live')
    pagePic.classList.toggle('show', mode === 'capture' || mode === 'say')
    pageAbsorb.classList.toggle('show', mode === 'capture' && !S().offline)
    pageLater.classList.toggle('show', mode === 'edit')
    page.classList.add('show')
    page.style.clipPath = `circle(0px at ${ox}px ${oy}px)`
    // Far enough to reach every corner from wherever it opened. A fixed screen
    // diagonal is only enough when the origin is on screen — and a drop's
    // position is in world space, so after a pan it may be nowhere near it.
    // Getting that wrong leaves the page frozen as a giant arc across a corner.
    const reach = Math.max(
      Math.hypot(ox, oy),
      Math.hypot(W - ox, oy),
      Math.hypot(ox, innerHeight - oy),
      Math.hypot(W - ox, innerHeight - oy),
    )
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        page.style.clipPath = `circle(${Math.ceil(reach) + 4}px at ${ox}px ${oy}px)`
        page.classList.add('on')
      }),
    )
    if (!reading) setTimeout(() => pageT.focus(), reduced ? 0 : 260)
  }
  function classifyQuiet(t: Thought) {
    if (S().offline) return
    void runAction<ClassifyOutput>('classify_thought', { raw_content: t.raw_content })
      .then(({ output }) =>
        S().updateThought(t.id, {
          type: output.type === 'goal' ? 'idea' : output.type,
          title: output.title,
          summary: output.summary || null,
          confidence: output.confidence,
        }),
      )
      .catch(() => {})
  }
  /**
   * A photo you kept, at the size you kept it.
   *
   * A drop with a picture in it draws that picture ninety pixels across and
   * then has nothing else to offer: the only other place it appeared was a
   * 120px thumbnail on the drop's own page. You photograph a care label to be
   * able to read the care label, and there was nowhere in the app that let you.
   *
   * Black, edge to edge, one way out. Not a page — a page is where you write
   * things, and there is nothing to write here.
   */
  function openPhoto(src: string, alt: string) {
    lightboxImg.src = src
    lightboxImg.alt = alt
    lightbox.classList.add('show')
    // one frame, so the transition has a state to come from
    requestAnimationFrame(() => lightbox.classList.add('on'))
  }
  function closePhoto() {
    if (!lightbox.classList.contains('show')) return
    lightbox.classList.remove('on')
    setTimeout(() => {
      lightbox.classList.remove('show')
      // a megabyte of data URL is not worth holding on to once it is off screen
      lightboxImg.removeAttribute('src')
    }, reduced ? 0 : 240)
  }
  lightboxX.addEventListener('click', closePhoto)
  // anywhere. The picture fills the glass, so "off the picture" is not a target
  // anybody can find — the whole thing is the way out.
  lightbox.addEventListener('click', closePhoto)

  function closePage(commit: boolean) {
    if (!pageFor) return
    // Whatever is in the fields goes in now, read straight from them, whether
    // or not blur ever arrives. There is no cancel on the group page — every
    // other thing you do there saves itself — so the name and the rows must
    // save the same way, however you left.
    const owed = pending
    pending = []
    nameFor = null
    for (const write of owed) write()
    stopMic()
    const pf = pageFor
    pageFor = null
    pageT.blur() // fires change, which is what commits a group's name
    nameFor = null
    page.classList.remove('on')
    page.style.clipPath = `circle(0px at ${pf.ox}px ${pf.oy}px)`
    setTimeout(() => page.classList.remove('show', 'path', 'reading'), reduced ? 0 : 580)
    if (!commit) return
    const v = pageT.value
    if (pf.mode === 'capture') {
      const blocks = parseCapture(v.trim())
      if (!blocks.length) return
      let drops = 0
      let pools = 0
      for (const b of blocks) {
        if (b.children.length) {
          pools++
          const g = S().addThought({ raw_content: b.title, title: b.title, type: 'goal', due_date: b.due })
          const gp = posOf(g.id)
          gp.x = gp.rx = pf.ox + (Math.random() - 0.5) * 60
          gp.y = gp.ry = Math.max(140, pf.oy - 60)
          for (const c of b.children) {
            const child = S().addThought({ raw_content: c, title: c, type: 'action' })
            S().addRelationship(child.id, g.id, 'part_of')
          }
        } else {
          for (const line of b.body.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
            drops++
            const t = S().addThought({ raw_content: line, due_date: b.due, source: micUsed ? 'voice' : 'text' })
            const p = posOf(t.id)
            const a = Math.random() * Math.PI * 2
            const rad = drops === 1 && pools === 0 ? 0 : 100 + (drops % 3) * 46
            p.x = p.rx = Math.max(60, Math.min(W - 60, pf.ox + Math.cos(a) * rad))
            p.y = p.ry = Math.max(140, Math.min(H - 160, pf.oy + Math.sin(a) * rad * 0.8))
            classifyQuiet(t)
          }
        }
      }
      micUsed = false
      splash(pf.ox)
      persistLayout()
      say(
        pools
          ? `${pools === 1 ? 'a pool formed' : pools + ' pools formed'}${drops ? ` · ${drops} loose drop${drops > 1 ? 's' : ''}` : ''}`
          : drops > 1
            ? `the storm settles — ${drops} drops in the sky`
            : 'it’s yours — drag it, grow it, pool it',
      )
    } else if (pf.mode === 'say' && pf.tl) {
      // Which of the two things happens to what you wrote was decided by the
      // button you left through — `handOver` is set by "Work it in" and by
      // nothing else.
      const txt = v.trim()
      const img = pendingImage
      if (handOver) {
        handOver = false
        if (!txt && !img) return
        void runReshape(pf.tl, txt, img, micUsed)
        micUsed = false
        pendingImage = null
        return
      }
      if (!txt) return
      const t = pf.tl.t
      patchExtra(t, { answers: [...answersOf(t), txt], plan: null, planSig: null })
      absorbAnim(t.id)
      say(answersOf(t).length === 0 ? 'saturated — it’s ready to rain' : 'absorbed — the path grows richer')
    } else if (pf.mode === 'path' && pf.tl) {
      patchExtra(pf.tl.t, { kept: true })
      say('the path is kept — it will wait for you')
    } else if (pf.mode === 'open' && pf.tl) {
      landUndo(rename(pf.tl.t.id, v))
    } else if (pf.tl) {
      const txt = v.trim()
      if (txt) S().updateThought(pf.tl.t.id, { raw_content: txt, title: null })
    }
  }

  /**
   * Fold a reversible change in, and offer it back.
   *
   * Everything on the taking-apart side of the grammar returns its own undo,
   * and none of it is worth having unless the undo is one tap away from where
   * you were standing when you did it.
   */
  function landUndo(u: Undone | null) {
    if (!u) return
    rebuild()
    paintAll()
    haptics.join()
    record(u.note)
    offerAction(u.note, 'put it back', () => {
      u.undo()
      rebuild()
      paintAll()
      redrawGroupPage()
      say('back the way it was')
    })
  }

  /**
   * Send a finished row to the bottom, and bring an un-finished one back up.
   *
   * Ticking something off left it exactly where it was, so a list of nine
   * ended up with four struck-through rows scattered through it and you had to
   * read the whole thing to find your place. Done work belongs underneath the
   * work that is left.
   *
   * Moved, then animated from where it was — measure, reorder, offset every row
   * that shifted by how far it shifted, and let all of them travel to zero
   * together. Offsets are taken from offsetTop rather than the viewport,
   * because the list scrolls and reordering inside a scrolled box moves the
   * viewport out from under the measurement.
   */
  function settle(row: HTMLDivElement, done: boolean) {
    const host = row.parentElement
    if (!host) return
    const rows = () => [...host.querySelectorAll('.row:not(.add)')] as HTMLDivElement[]
    const before = new Map(rows().map((r) => [r, r.offsetTop]))

    const all = rows()
    if (done) {
      // after everything, finished or not: the most recently done sits last
      const last = all[all.length - 1]
      if (last !== row) last.after(row)
    } else {
      // back up to just above the first finished row, which is where the
      // unfinished work ends
      const firstDone = all.find((r) => r !== row && r.classList.contains('ticked'))
      if (firstDone) firstDone.before(row)
      else {
        const last = all[all.length - 1]
        if (last !== row) last.after(row)
      }
    }
    if (reduced) return

    for (const r of rows()) {
      const was = before.get(r)
      if (was === undefined) continue
      const delta = was - r.offsetTop
      if (!delta) continue
      r.style.transition = 'none'
      r.style.transform = `translateY(${delta}px)`
    }
    // one reflow, then let them all travel home together
    void host.offsetHeight
    for (const r of rows()) {
      if (!r.style.transform) continue
      r.style.transition = 'transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      r.style.transform = ''
    }
  }

  /**
   * Put the list back in step with the map.
   *
   * The group page stays open while you organise, so an undo taken from the
   * bar at the foot of the screen changes what the graph holds and leaves the
   * list above it showing the world as it was a second ago.
   */
  function redrawGroupPage() {
    const pf = pageFor
    if (pf?.mode !== 'open' || !pf.tl) return
    const tl = view.byId.get(pf.tl.t.id)
    if (tl) openPage('open', tl, pf.ox, pf.oy)
  }

  /**
   * Two taps for the ones that take things away.
   *
   * Not a modal — a modal to confirm a reversible act is a lecture. The button
   * changes into the question and waits; anywhere else you touch, it forgets it
   * asked.
   */
  function wireDanger(host: HTMLElement, tl: TL) {
    for (const el of [...host.querySelectorAll('.d')] as HTMLButtonElement[]) {
      const act = el.dataset.act
      // The two that take something apart, and only those. Reading a brief and
      // gathering what is like this share the row and the styling, and asking
      // "Sure?" before letting you read something is how a confirmation stops
      // meaning anything.
      if (act !== 'bin' && act !== 'ungroup') continue
      const said = el.textContent ?? ''
      let armed = false
      const disarm = () => {
        armed = false
        el.textContent = said
        el.classList.remove('armed')
      }
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!armed) {
          for (const other of [...host.querySelectorAll('.d.armed')] as HTMLButtonElement[]) other.click()
          armed = true
          el.textContent = act === 'bin' ? 'Sure? It can be brought back' : 'Sure?'
          el.classList.add('armed')
          setTimeout(disarm, 4000)
          return
        }
        closePage(false)
        openPool = view.parentOf.get(tl.t.id) ?? null
        landUndo(act === 'bin' ? bin(tl.t.id) : ungroup(tl.t.id))
      })
    }
  }

  // Leaving the name box is committing it, wherever you are going next.
  pageT.addEventListener('change', () => {
    if (nameFor) landUndo(rename(nameFor, pageT.value))
  })
  pageD.addEventListener('click', () => {
    if (pageFor?.mode === 'capture' && micUsed && pageT.value.trim().length > 80) {
      void runOrganize(true)
      return
    }
    closePage(true)
  })
  pageD2.addEventListener('click', () => {
    handOver = true
    closePage(true)
  })
  pageX.addEventListener('click', () => closePage(false))
  function absorbAnim(id: string) {
    const p = posOf(id)
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
    const d = document.createElement('div')
    d.className = 'sky-drop-in'
    d.style.transform = `translate(${p.x + Math.cos(a) * 140 - 13}px, ${p.y + Math.sin(a) * 140 - 13}px)`
    field.appendChild(d)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        d.style.transform = `translate(${p.x - 13}px, ${p.y - 13}px) scale(0.4)`
        d.style.opacity = '0.2'
      }),
    )
    setTimeout(() => d.remove(), reduced ? 0 : 780)
  }

  // voice + photo + absorb tools
  const SRCls =
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition ||
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
  const speechOK = !!SRCls
  let rec: SpeechRecognitionLike | null = null
  let micUsed = false
  /** Set only by the writing page's second button: give this to the agent. */
  let handOver = false
  // the stored thumbnail is far too small to read text from, so a capture also
  // keeps a legible copy in memory for as long as the page is open
  let pendingImage: { mediaType: string; dataB64: string } | null = null
  function stopMic() {
    if (rec) {
      const r = rec
      rec = null
      try {
        r.stop()
      } catch {
        /* already stopped */
      }
    }
    pageMic.classList.remove('live')
  }
  /** Begin listening, from the mic inside the page. Holding the sky opens
   *  that page, so speaking a thought is still one gesture away — which is
   *  why the second microphone that used to sit beside the tabs is gone. */
  function startMic(): boolean {
    if (rec || !SRCls) return false
    rec = new SRCls()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = navigator.language || 'en-US'
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (!ev.results[i].isFinal) continue
        const said = (ev.results[i][0]?.transcript || '').trim()
        if (!said) continue
        micUsed = true
        pageT.value = pageT.value.trim() ? pageT.value.replace(/\s+$/, '') + '\n' + said : said
      }
    }
    rec.onend = () => {
      rec = null
      pageMic.classList.remove('live')
    }
    rec.onerror = () => stopMic()
    try {
      rec.start()
      pageMic.classList.add('live')
      pageN.textContent = 'listening…'
      return true
    } catch {
      rec = null
      return false
    }
  }
  pageMic.addEventListener('click', () => {
    if (rec) stopMic()
    else startMic()
  })
  pagePic.addEventListener('click', () => pageFile.click())
  pageFile.addEventListener('change', () => {
    const f = pageFile.files && pageFile.files[0]
    pageFile.value = ''
    if (!f || !pageFor) return
    const url = URL.createObjectURL(f)
    const im = new Image()
    im.onload = () => {
      URL.revokeObjectURL(url)
      const draw = (max: number, q: number) => {
        const k = Math.min(1, max / Math.max(im.width, im.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(im.width * k))
        c.height = Math.max(1, Math.round(im.height * k))
        ;(c.getContext('2d') as CanvasRenderingContext2D).drawImage(im, 0, 0, c.width, c.height)
        return c.toDataURL('image/jpeg', q)
      }
      let img: string
      let readable: string
      let full: string
      try {
        img = draw(320, 0.8) // the drop's face — small enough to live in a row
        readable = draw(1400, 0.85) // legible enough for the model to read
        // and one you can actually look at. The face is 320px because it is
        // drawn at 90 on a bubble; opened full screen it is a smear. This is
        // the version the lightbox shows — big enough to read a care label on,
        // small enough that a row carrying it still syncs.
        full = draw(1200, 0.72)
      } catch {
        return
      }
      pendingImage = { mediaType: 'image/jpeg', dataB64: readable.split(',')[1] }
      // show it. Picking a photo with no visible result is indistinguishable
      // from the picker having failed.
      pageA.style.display = 'block'
      pageA.innerHTML = `<div class="lab">attached</div><img alt="the photo you just added" />`
      const prev = pageA.querySelector('img')
      if (prev) prev.src = img
      const pf = pageFor
      const t = S().addThought({ raw_content: 'Photo', title: 'Photo', extra: { img, full } })
      const p = posOf(t.id)
      const a = Math.random() * Math.PI * 2
      p.x = p.rx = Math.max(60, Math.min(W - 60, (pf?.ox ?? W / 2) + Math.cos(a) * 110))
      p.y = p.ry = Math.max(140, Math.min(waterlineY() - 90, (pf?.oy ?? H / 2) + Math.sin(a) * 90))
      // choosing a picture is the request to read it — no second tap needed
      if (!S().offline) void runOrganize(false, t.id)
      else pageN.textContent = 'kept — reading needs a connection'
    }
    im.onerror = () => URL.revokeObjectURL(url)
    im.src = url
  })
  // scatter what organize creates around where the dump was written
  function placeNear(ox: number, oy: number) {
    return (id: string, i: number, total: number) => {
      const p = posOf(id)
      const ang = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
      const rad = total === 1 ? 0 : 110 + (i % 3) * 52
      p.x = Math.max(60, Math.min(W - 60, ox + Math.cos(ang) * rad))
      p.y = Math.max(140, Math.min(waterlineY() - 90, oy + Math.sin(ang) * rad * 0.8))
    }
  }
  let organizing = false
  async function runOrganize(spoken: boolean, photoId?: string) {
    const v = pageT.value.trim()
    if ((!v && !pendingImage) || organizing) return
    const pf = pageFor
    const ox = pf?.ox ?? W / 2
    const oy = pf?.oy ?? H / 2
    organizing = true
    pageAbsorb.classList.add('busy')
    page.classList.add('reading')
    pageN.textContent = pendingImage ? 'reading the picture…' : spoken ? 'making sense of what you said…' : 'reading it through…'
    const res = await organizeText(v, spoken, placeNear(ox, oy), pendingImage ?? undefined)
    organizing = false
    pageAbsorb.classList.remove('busy')
    page.classList.remove('reading')
    if (res.kind === 'organized') {
      // the picture now knows what it shows
      if (photoId && res.source) S().updateThought(photoId, { title: res.source, raw_content: res.source })
      pageT.value = ''
      micUsed = false
      pendingImage = null
      closePage(false)
      splash(ox)
      haptics.arrive()
      const bits: string[] = []
      if (res.pools) bits.push(`${res.pools} pool${res.pools === 1 ? '' : 's'}`)
      if (res.links) bits.push(`${res.links} thread${res.links === 1 ? '' : 's'}`)
      say(res.note || `${res.drops} drops${bits.length ? ' · ' + bits.join(' · ') : ''}`)
    } else {
      // nothing found, or the engine is down — the words still become drops
      closePage(true)
      if (photoId) say(res.kind === 'failed' ? 'the picture is kept — reading it failed' : 'the picture is kept')
      else say(res.kind === 'failed' ? 'kept as written — the thinking engine is quiet' : 'kept as written')
    }
  }
  pageAbsorb.addEventListener('click', () => void runOrganize(micUsed))

  pageLater.addEventListener('click', () => {
    if (!pageFor || pageFor.mode !== 'edit' || !pageFor.tl) return
    const t = pageFor.tl.t
    closePage(false)
    restDrop(t)
  })

  // ---------- moons ----------
  /** half the glass disc — the label hangs below it and is not part of this */
  const MOON_R = 25
  /** what the outermost disc must keep between itself and the edge */
  const MOON_EDGE = 12
  /** the most air a row is allowed; fewer moons do not spread further apart */
  const MOON_STEP = 76
  let moonsFor: string | null = null
  const moonEls: HTMLDivElement[] = []
  function closeMoons() {
    moonEls.forEach((m) => m.remove())
    moonEls.length = 0
    moonsFor = null
    // the recommendation comes back out when the actions go away
    paintNext()
  }
  function showMoons(tl: TL) {
    closeMoons()
    moonsFor = tl.t.id
    // The recommendation steps out of the way of the actions. It knew to — it
    // is hidden whenever a menu is up — but nothing repainted when a menu was
    // opened by tapping a bubble, so the two sat on top of each other and
    // neither could be read.
    paintNext()
    const p = posOf(tl.t.id)
    // an opened pool has already been framed by the camera; leave it where it is
    if (openPool !== tl.t.id) p.y = Math.max(p.y, radiusOf(tl) + 170)
    /*
     * Three. Always the same three, always in this order.
     *
     * There were six, and which six depended on what you had tapped, so the
     * row was never twice in the same shape and nothing about it could be
     * learned. Worse, it was six because it had grown one button per feature
     * rather than one per intention, and three separate pairs of them were
     * saying the same thing:
     *
     *   the brief · the group · the photo   — three ways to say "open what
     *     this holds", which is one destination and should be one button.
     *   grow · tell it                      — both "put words into this". The
     *     only difference was whether they went to the agent, which is my
     *     concern and not yours, and it made you choose before you had
     *     written a word.
     *   gather                              — the same act as ✦ tidy, which
     *     is already standing in the sky. It moves in with the other
     *     organising verbs, on the page where organising happens.
     *
     * What is left is the three things you can actually intend: look at it,
     * add to it, and get on with it.
     */
    const acts: { icon: string; lb: string; dim?: boolean; run: () => void }[] = []
    const asking = tl.kind === 'drop' && isQuestion(label(tl.t))
    const ready = isKept(tl.t) || isRipe(tl.t) || !!briefOf(tl.t.id)
    const canRain = tl.kind === 'drop' || tl.members.length >= 1

    // 1. Everything this thing holds, in one place.
    acts.push({
      icon: 'list',
      lb: 'open',
      run: () => {
        closeMoons()
        openPage('open', tl, toScreenX(p.x), toScreenY(p.y))
      },
    })

    // 2. Words into it. What happens to them is decided on the page, after
    //    they exist.
    acts.push({
      icon: 'tell',
      lb: 'say',
      run: () => {
        closeMoons()
        openPage('say', tl, toScreenX(p.x), toScreenY(p.y))
      },
    })

    // 3. Get on with it — and what that means is read off the thing rather
    //    than asked of you. A question wants an answer. Something that has
    //    already been worked out wants to become work, and that costs nothing
    //    and needs no connection. Anything else has to be worked out first.
    acts.push({
      icon: asking ? 'ask' : ready && canRain ? 'rain' : 'work',
      lb: asking ? 'answer it' : ready && canRain ? (isKept(tl.t) ? 'path' : 'rain') : 'work it',
      dim: (asking || !ready) && S().offline,
      run: () => {
        closeMoons()
        if (asking) void runAnswer(tl)
        else if (ready && canRain) rain(tl)
        else void runDeepen(tl)
      },
    })
    acts.forEach((a, i) => {
      const m = document.createElement('div')
      m.className = 'sky-moon' + (a.dim ? ' dim' : '')
      m.innerHTML = `<div class="ic">${moonSvg(a.icon)}</div><div class="lb">${a.lb}</div>`
      if (!reduced) m.style.animationDelay = i * 45 + 'ms'
      // the disc's own centre, so a moon shrinks and grows around the thing you
      // are aiming at rather than around the top-left of its label block
      m.style.transformOrigin = `${MOON_R}px ${MOON_R}px`
      m.addEventListener('pointerdown', (e) => e.stopPropagation())
      m.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!a.dim) a.run()
        else say('nothing similar yet')
      })
      field.appendChild(m)
      moonEls.push(m)
      ;(m as HTMLDivElement & { _slot?: number; _of?: number })._slot = i
      ;(m as HTMLDivElement & { _slot?: number; _of?: number })._of = acts.length
    })
  }
  /**
   * Where a thing's actions wait.
   *
   * In one row, directly beneath it, always. They used to fan out on an arc
   * swung toward open space, which sounded considerate and was chaos: five of
   * them at five angles, overlapping each other and whatever else was nearby,
   * each a different distance from the thing it acts on, and never twice in
   * the same place. Nothing about that helps you — you cannot learn where a
   * button is if it moves, and you read a row far faster than an arc.
   *
   * One rule for a drop and for an open pool. The only difference is how far
   * down they sit, because a pool has rings to clear first.
   */
  function layoutMoons() {
    if (!moonsFor) return
    const tl = view.byId.get(moonsFor)
    if (!tl) {
      closeMoons()
      return
    }
    const p = posOf(tl.t.id)
    const open = openPool === tl.t.id
    // below whatever the thing actually occupies: its own body, or the whole
    // orbit if it has opened out into one. A member you have opened up is a
    // card rather than a disc and is measured, not guessed — radiusOf would
    // put its actions across the middle of it.
    const grown = shapes.get(tl.t.id)
    const below = open
      ? Math.max(orbitR(tl), ringR) + memberR(tl.members.length) + 46
      : (peek === tl.t.id && grown ? grown.hh : radiusOf(tl)) + 52
    // As wide as they can be and still all fit — worked out in screen pixels,
    // because the glass is measured in screen pixels and a moon undoes the
    // camera's scale to keep its real size. The old sum did the spacing in
    // world units and then compared it against a screen-width budget, so it
    // was only ever right at one zoom level: pull the camera in and the row it
    // thought it had centred hung off the left edge.
    const n0 = moonEls.length || 1
    const room = n0 > 1 ? (W - 2 * MOON_R - 2 * MOON_EDGE) / (n0 - 1) : MOON_STEP
    const step = Math.min(MOON_STEP, room)
    const gap = step / cam.k
    moonEls.forEach((m) => {
      const el = m as HTMLDivElement & { _slot?: number; _of?: number }
      const n = el._of ?? 1
      const slot = el._slot ?? 0
      // Centred on the subject, but never off the glass — a thing near an edge
      // is exactly when you most need its actions to still be reachable. `half`
      // is how far the outermost disc sits from the row's centre, plus the
      // margin it must keep; `step` is capped so this can never exceed W/2.
      const half = ((n - 1) / 2) * step + MOON_R + MOON_EDGE
      const lo = toWorldX(half)
      const hi = toWorldX(W - half)
      const cx = lo > hi ? (toWorldX(0) + toWorldX(W)) / 2 : Math.max(lo, Math.min(hi, p.x))
      const x = cx + (slot - (n - 1) / 2) * gap - MOON_R
      // and never under the tab bar, however low the thing itself is — the
      // label hangs below the disc now, so this clears more than the disc
      const floor = toWorldY(waterlineY() - 132) - MOON_R
      const y = Math.min(p.y + below, floor)
      // the moons live in the world but are things you tap: they keep their
      // real size however far out the camera has pulled
      m.style.transform = `translate(${x}px, ${y}px) scale(${(1 / cam.k).toFixed(3)})`
    })
  }


  function rain(tl: TL) {
    closeMoons()
    openPool = null
    const p = posOf(tl.t.id)
    const r0 = radiusOf(tl)
    if (!reduced) {
      for (let k = 0; k < 7; k++) {
        const d = document.createElement('div')
        d.className = 'sky-rain-drop'
        const dx = (Math.random() - 0.5) * r0 * 1.5
        d.style.transform = `translate(${p.x + dx}px, ${p.y + r0 * 0.5}px)`
        d.style.opacity = '0.9'
        field.appendChild(d)
        setTimeout(() => {
          d.style.transform = `translate(${p.x + dx * 1.4}px, ${waterlineY()}px)`
          d.style.opacity = '0'
        }, 30 + k * 55)
        setTimeout(() => d.remove(), 900 + k * 55)
      }
      setTimeout(() => splash(p.x), 480)
    }
    haptics.arrive()
    setTimeout(() => openPage('path', tl, toScreenX(p.x), toScreenY(p.y)), reduced ? 0 : 430)
  }
  // ⚡ — the agent goes away and does the legwork on one drop, and what it
  // finds arrives as real work hanging under it rather than as a wall of prose.
  let working: string | null = null
  /**
   * Work new information into a part of the map.
   *
   * The one thing here that can take something away, so it is the one thing
   * that must be a single move you can put back. It is offered as one, and the
   * offer does not expire on its own — an edit you cannot see the shape of yet
   * is exactly the one you want to undo two minutes later.
   */
  async function runReshape(tl: TL, news: string, img: { mediaType: string; dataB64: string } | null, spoken: boolean) {
    if (working || S().offline) return
    const id = tl.t.id
    working = id
    els.get(id)?.classList.add('working')
    hold('working it in…', trim(label(tl.t), 34))
    const res = await reshapeThought(id, news || 'See the attached picture.', {
      image: img ? { mediaType: img.mediaType, dataB64: img.dataB64 } : undefined,
      spoken: spoken || undefined,
    })
    working = null
    els.get(id)?.classList.remove('working')
    if (res.kind === 'failed') {
      hold(res.why ?? 'could not work that in just now', trim(label(tl.t), 34))
      offerAction('nothing was changed', 'try again', () => {
        hold(null)
        void runReshape(tl, news, img, spoken)
      })
      return
    }
    if (res.kind === 'unchanged') {
      // Saying "the map already covered that" is a real answer and a good one.
      // Inventing an edit to look busy is how a map fills up with noise.
      hold(null)
      say(res.note)
      return
    }
    // whatever it made arrives around the thing it belongs to
    const gp = posOf(id)
    const fresh = S()
      .relationships.filter((r) => r.type === 'part_of' && r.to_id === id)
      .slice(-res.change.added - res.change.grouped)
    fresh.forEach((r, i, all) => {
      const p = pos.get(r.from_id)
      if (p && p.s >= 1) return // already on stage; leave it where it stands
      const q = posOf(r.from_id)
      const a = -Math.PI / 2 + (i / Math.max(1, all.length)) * Math.PI * 2
      q.x = q.rx = gp.x + Math.cos(a) * 150
      q.y = q.ry = gp.y + Math.sin(a) * 120
      q.s = 0.3
    })
    rebuild()
    paintAll()
    haptics.join()
    hold(res.change.note, trim(label(tl.t), 34))
    record(`${reshapeTally(res.change) || 'the map moved'} — you told it something`, trim(label(tl.t), 40))
    offerAction(reshapeTally(res.change) || 'the map moved', 'put it back', () => {
      res.change.undo()
      rebuild()
      paintAll()
      say('back the way it was')
    })
    fitWhenSettled()
  }

  /**
   * Pick up whatever the agent still owes you.
   *
   * Runs outlive the page that started them. Coming back to a sky that is
   * exactly as you left it — when a minute of research finished twenty seconds
   * after you locked the phone — is the difference between ⚡ being something
   * you trust and something you babysit.
   */
  async function collectOwed() {
    if (S().offline || !S().userId) return
    let runs: Awaited<ReturnType<typeof pendingRuns>>
    try {
      runs = await pendingRuns()
    } catch {
      return
    }
    for (const run of runs) {
      if (dead) return
      // the two that go away for a minute: one comes back with a way through,
      // the other with an answer, and both have to survive a locked phone
      if (run.action !== 'deepen' && run.action !== 'answer') continue
      const id = subjectOf(run)
      const tl = id ? view.byId.get(id) : null
      if (!id || !tl) {
        // the thought it was about is gone; nothing to land it on
        void markApplied(run.id)
        continue
      }
      if (run.status === 'running') {
        // still out there. Take over the watch, and show it as out.
        working = id
        els.get(id)?.classList.add('working')
        hold('still out there — picking up where it left off')
        const res = await awaitRun(run.id, { startedAt: run.createdAt })
        if (dead) return
        working = null
        els.get(id)?.classList.remove('working')
        if (!res.ok) {
          void markApplied(run.id)
          hold(null)
          say(res.why)
          continue
        }
        landRun(run.action, tl, run.id, res.output)
      } else if (run.status === 'succeeded') {
        landRun(run.action, tl, run.id, run.output)
      }
    }
  }
  /** Whichever of the two it was, folded in and said out loud. */
  function landRun(action: string, tl: TL, runId: string, output: unknown) {
    if (action === 'answer') {
      const res = applyAnswer(tl.t.id, output as Parameters<typeof applyAnswer>[1], runId)
      void markApplied(runId)
      if (res.kind === 'answered') landAnswer(tl, res, true)
      return
    }
    landDeepen(tl, runId, output, true)
  }
  /** Fold a finished run into the sky, and say so. */
  function landDeepen(tl: TL, runId: string, output: unknown, whileAway: boolean) {
    const res = applyDeepen(tl.t.id, output as Parameters<typeof applyDeepen>[1], runId)
    void markApplied(runId)
    if (res.kind !== 'deepened') return
    rebuild()
    paintAll()
    haptics.join()
    hold(whileAway ? `while you were away — ${res.note || 'it finished'}` : res.note, trim(label(tl.t), 34))
    record(`⚡ came back with ${res.added} step${res.added === 1 ? '' : 's'}`, trim(label(tl.t), 40))
    if (briefOf(tl.t.id)) {
      offerAction(trim(label(tl.t), 30), 'read it', () => {
        hold(null)
        const q = posOf(tl.t.id)
        openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
      })
    }
  }

  async function runDeepen(tl: TL) {
    if (working || S().offline) return
    working = tl.t.id
    const el = els.get(tl.t.id)
    el?.classList.add('working')
    // It really is gone for a minute: the research runs as a background job
    // because it does not fit inside a request. So the notice stands for the
    // whole of that, and counts, rather than blinking once and leaving a
    // glowing drop and silence — which reads as nothing happening.
    const began = Date.now()
    // How long this takes is a property of the ask, not of the button, so the
    // notice stops promising a minute for everything. A cheap read decides
    // first, and what it says stands as the wait.
    let sizing: Sizing = { ...fullDepth(4), why: 'sizing it up' }
    const tick = () => {
      if (working !== tl.t.id) return
      hold(waitingWord(sizing, Math.round((Date.now() - began) / 1000)), trim(label(tl.t), 34))
    }
    tick()
    const patience = setInterval(tick, 1000)
    sizing = await sizeUp(tl.t.id, 'plan', 4)
    if (dead) {
      clearInterval(patience)
      return
    }
    tick()
    // if the drop is a picture, the picture is the thing being asked about
    const img = ex(tl.t).img as string | undefined
    const b64 = img?.includes(',') ? img.split(',')[1] : undefined
    const res = await deepenThought(tl.t.id, {
      image: b64 ? { mediaType: 'image/jpeg', dataB64: b64 } : undefined,
      sizing,
    })
    clearInterval(patience)
    working = null
    els.get(tl.t.id)?.classList.remove('working')
    if (res.kind === 'failed') {
      // a minute of waiting deserves better than four seconds of apology, and
      // an offer to try again rather than hunting for the button
      hold(res.why ?? 'could not get out there just now', trim(label(tl.t), 34))
      offerAction('tap to try again', 'again', () => {
        hold(null)
        void runDeepen(tl)
      })
      return
    }
    // the new steps arrive around the thing they belong to
    const gp = posOf(tl.t.id)
    const kids = S().relationships.filter((r) => r.type === 'part_of' && r.to_id === tl.t.id)
    kids.slice(-res.added).forEach((r, i, all) => {
      const p = posOf(r.from_id)
      const a = -Math.PI / 2 + (i / Math.max(1, all.length)) * Math.PI * 2
      p.x = p.rx = gp.x + Math.cos(a) * 150
      p.y = p.ry = gp.y + Math.sin(a) * 120
      p.s = 0.3
    })
    rebuild()
    paintAll()
    haptics.join()
    // It waits for you. You may well have put the phone down — that is the
    // whole point of it running in the background — and coming back to a sky
    // that silently has more in it than it did is not the same as being told
    // what happened and being handed what it wrote.
    const found = res.output.found.length
    const parts = [
      res.added ? `${res.added} step${res.added === 1 ? '' : 's'}` : '',
      found ? `${found} thing${found === 1 ? '' : 's'} found` : '',
    ].filter(Boolean)
    hold(res.note || parts.join(' · ') || 'back from finding out', trim(label(tl.t), 34))
    record(`⚡ ${parts.join(' · ') || 'came back'}`, trim(label(tl.t), 40))
    if (briefOf(tl.t.id)) {
      offerAction(parts.join(' · ') || 'it wrote something down', 'read it', () => {
        hold(null)
        const q = posOf(tl.t.id)
        openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
      })
    }
    fitWhenSettled()
  }

  /**
   * Ask one thing on the map, and be told.
   *
   * The other half of ⚡. Half of what a map of real work holds is not work —
   * "Pull live LAX→CDG premium economy fares for Sept 28" is a question with a
   * number for an answer, and handing that a plan for finding the number out is
   * the app describing the errand instead of running it.
   *
   * The one behavioural difference from ⚡ is what happens at the end. A brief
   * of research is something to read later, so it is offered. An answer is the
   * thing you asked for, so if you are still standing here when it lands, it
   * opens. Nobody waits a minute for a number and then wants to tap twice more.
   */
  async function runAnswer(tl: TL) {
    if (working || S().offline) return
    working = tl.t.id
    els.get(tl.t.id)?.classList.add('working')
    const began = Date.now()
    let sizing: Sizing = { ...fullDepth(3), why: 'sizing it up' }
    const tick = () => {
      if (working !== tl.t.id) return
      hold(waitingWord(sizing, Math.round((Date.now() - began) / 1000)), trim(label(tl.t), 34))
    }
    tick()
    const patience = setInterval(tick, 1000)
    sizing = await sizeUp(tl.t.id, 'answer', 3)
    if (dead) {
      clearInterval(patience)
      return
    }
    tick()
    const img = ex(tl.t).img as string | undefined
    const b64 = img?.includes(',') ? img.split(',')[1] : undefined
    const res = await answerThought(tl.t.id, {
      image: b64 ? { mediaType: 'image/jpeg', dataB64: b64 } : undefined,
      sizing,
    })
    clearInterval(patience)
    working = null
    els.get(tl.t.id)?.classList.remove('working')
    if (dead) return
    if (res.kind === 'failed') {
      hold(res.why ?? 'could not get out there just now', trim(label(tl.t), 34))
      offerAction('tap to try again', 'again', () => {
        hold(null)
        void runAnswer(tl)
      })
      return
    }
    landAnswer(tl, res, false)
  }

  /** Put an answer where it belongs, and show it. */
  function landAnswer(
    tl: TL,
    res: Extract<Awaited<ReturnType<typeof answerThought>>, { kind: 'answered' }>,
    whileAway: boolean,
  ) {
    // anything the answer created arrives beside the question, not on top of it
    const gp = posOf(tl.t.id)
    if (res.added) {
      const parentId = S().relationships.find((r) => r.type === 'part_of' && r.from_id === tl.t.id)?.to_id
      const sibs = S().relationships.filter((r) => r.type === 'part_of' && r.to_id === (parentId ?? tl.t.id))
      sibs.slice(-res.added).forEach((r, i, all) => {
        const p = pos.get(r.from_id)
        if (p && p.s >= 1) return
        const q = posOf(r.from_id)
        const a = -Math.PI / 2 + (i / Math.max(1, all.length)) * Math.PI * 2
        q.x = q.rx = gp.x + Math.cos(a) * 150
        q.y = q.ry = gp.y + Math.sin(a) * 120
        q.s = 0.3
      })
    }
    rebuild()
    paintAll()
    haptics.join()
    record(`asked · ${res.line}`, trim(label(tl.t), 40))
    // Reading it is the point, so when you are here it opens itself. When you
    // are not — the phone was locked, and a notification is what told you — the
    // sky does not rearrange itself behind your back; it offers.
    if (whileAway || pageFor) {
      hold(whileAway ? `while you were away — ${res.line}` : res.line, trim(label(tl.t), 34))
      offerAction(trim(res.line, 46), 'read it', () => {
        hold(null)
        const q = posOf(tl.t.id)
        openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
      })
    } else {
      hold(null)
      const q = posOf(tl.t.id)
      openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
    }
    fitWhenSettled()
  }

  let openPool: string | null = null
  function clearAll() {
    closeMoons()
    const wasOpen = openPool
    // Closing a member you were reading is a step of its own: it should not
    // also throw you out of the group you were reading it in. Decide where we
    // end up before painting — restoring it afterwards left the paint to run
    // with the group already closed, which unmounted every member in it.
    if (peek) {
      peek = null
      peekAt = null
      paintAll()
      // back to the group you were reading out of, and to its actions
      const g = openPool ? view.byId.get(openPool) : null
      if (g) showMoons(g)
      return
    }
    if (wasOpen) {
      // out of a group is into the group that held it, not all the way back to
      // the surface — going three deep and being thrown to the top is a loss
      const up = view.parentOf.get(wasOpen)
      openPool = up && view.byId.has(up) ? up : null
    }
    paintAll()
    if (!wasOpen) return
    const back = openPool ? view.byId.get(openPool) : null
    if (back) frameOpen(back)
    else fitAll()
  }

  let fusing: string[] = []
  /**
   * The oil between things standing close together.
   *
   * Two drops in a crowd do not simply sit near one another — brought close
   * enough they pull a waist out between them and read as one mass with a
   * pinch in it. Drawn behind the bodies in their own fill, so what you see is
   * the gap between them filling in rather than a line joining them.
   *
   * It is shape aware: against a card the neck grows off the flat of an edge,
   * against a drop off the curve, because both ends are found on the real
   * surface rather than on a circle drawn round it.
   */
  const OIL_MAX = 14
  const oilPaths: { fill: SVGPathElement; rim: SVGPathElement }[] = []
  function oilPair(i: number) {
    let pair = oilPaths[i]
    if (!pair) {
      const mk = (cls: string) => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        el.setAttribute('class', cls)
        oilG.appendChild(el)
        return el
      }
      // every fill first, then every rim, so one join's body never paints over
      // the edge of the one beside it
      pair = { fill: mk('oil-fill'), rim: mk('oil-rim') }
      oilPaths.push(pair)
    }
    return pair
  }
  function paintOil() {
    let used = 0
    const g = openPool && !reduced ? view.byId.get(openPool) : null
    if (g && g.members.length > 1) {
      const fallback = memberR(g.members.length)
      const bodies = g.members.map((m) => drawnBodyOf(m.id, fallback))
      // strongest joins first, so a crowded ring spends its paths on the
      // couplings that are actually carrying the shape
      // In a crowd, "these two are close" stops being information — everything
      // is close, so a neck between every touching pair is not twenty joins,
      // it is one smear with drops in it. So the more there are, the fewer and
      // the firmer: a handful of couplings that are genuinely pressed together
      // reads as deliberate, where all of them read as mud.
      const crowd = g.members.length
      const least = crowd <= 8 ? 0.06 : 0.34
      const most = crowd <= 8 ? OIL_MAX : Math.max(4, Math.round(48 / crowd))
      const joins: { i: number; j: number; v: number }[] = []
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          // the pair being dragged together has its own join, drawn with a lit
          // rim because it is about to become one thing; two necks over the
          // same gap only ever muddied it
          if (fuse && ((fuse.a === g.members[i].id && fuse.b === g.members[j].id) || (fuse.a === g.members[j].id && fuse.b === g.members[i].id))) continue
          const v = pull(bodies[i], bodies[j])
          if (v > least) joins.push({ i, j, v })
        }
      }
      joins.sort((a, b) => b.v - a.v)
      for (const jn of joins.slice(0, most)) {
        const d = oilPath(bodies[jn.i], bodies[jn.j], jn.v)
        if (!d) continue
        const pair = oilPair(used)
        pair.fill.setAttribute('d', d.fill)
        pair.rim.setAttribute('d', d.rim)
        // faint between neighbours merely standing together, and properly
        // there where something is genuinely pressed against something else
        const o = Math.pow(jn.v, 1.1)
        pair.fill.style.opacity = o.toFixed(3)
        pair.rim.style.opacity = o.toFixed(3)
        used++
      }
    }
    for (let i = used; i < oilPaths.length; i++) {
      oilPaths[i].fill.style.opacity = '0'
      oilPaths[i].rim.style.opacity = '0'
    }
  }

  function setFusing(ids: string[]) {
    if (ids.length === fusing.length && ids.every((id, i) => id === fusing[i])) return
    for (const id of fusing) els.get(id)?.classList.remove('fusing')
    fusing = ids
    for (const id of ids) els.get(id)?.classList.add('fusing')
  }

  // Which two drops are currently reaching for each other. The neck itself is
  // drawn in the frame loop rather than here, so it is built from the same
  // eased positions and the same deformation the drops are rendered with —
  // otherwise the outline lags a frame behind the bodies it is meant to hold.
  let fuse: { a: string; b: string; ra: number; rb: number } | null = null
  function clearFuse() {
    fuse = null
    goo.classList.remove('ready')
    goo.style.opacity = '0'
    goo.setAttribute('d', '')
    setFusing([])
  }

  // ---------- pointer ----------
  let drag: {
    id: string
    tl: TL
    isMember: boolean
    memberPool?: string
    dx: number
    dy: number
    sx: number
    sy: number
    vx: number
    vy: number
    moved: boolean
    touching: boolean
    target: TL | null
    el: HTMLDivElement
  } | null = null
  let bgDown: { x: number; y: number } | null = null
  let panFrom: { x: number; y: number; cx: number; cy: number } | null = null
  let panning = false
  let lastTap = 0
  const touches = new Map<number, { x: number; y: number }>()
  let pinch: { dist: number; k: number; mx: number; my: number } | null = null
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  // How far a finger has to travel before it means something. A drop answers
  // quickly; the water needs more asking, so a near-miss on a drop does not
  // slide the whole world instead.
  /**
   * How far a press may travel and still be a tap.
   *
   * Nine pixels is a mouse number. A mouse does not move while you click; a
   * thumb on a phone always does, and past this the press becomes a drag —
   * which also closes the moons, so the tap that was meant to open a group
   * instead put its actions away. Tap, nothing, tap, nothing: the double tap
   * "does not work on mobile but does on desktop", and this is the whole of
   * why.
   */
  const TAP_SLOP = 9
  const slopFor = (e: PointerEvent) => (e.pointerType === 'mouse' ? TAP_SLOP : 20)
  const PAN_SLOP = 16
  stage.addEventListener('pointerdown', (e) => {
    // iOS only hands over the tilt sensor from inside a real gesture, so the
    // first touch of the session is when we ask. It asks at most once.
    armUpright()
    // A first finger arriving while we still think fingers are down means the
    // last gesture's release never reached us. Nothing survives that.
    if (e.isPrimary && touches.size) {
      touches.clear()
      pinch = null
      panning = false
      panFrom = null
    }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.size === 2) {
      // two fingers: the camera takes over from whatever was happening
      const [a, b] = [...touches.values()]
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        k: cam.k,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      }
      if (holdTimer) clearTimeout(holdTimer)
      if (drag) drag.el.classList.remove('dragging')
      drag = null
      bgDown = null
      panFrom = null
      endHold(false)
      return
    }
    const bubEl = (e.target as HTMLElement).closest?.('.skyb') as HTMLDivElement | null
    if (!bubEl) {
      if (!(e.target as HTMLElement).closest?.('.sky-moon')) {
        bgDown = { x: e.clientX, y: e.clientY }
        // A hand on the glass outranks a camera that is still travelling.
        // Otherwise the pan is snapshotted against a moving cam and the two
        // fight each other for the length of the animation.
        camTarget = null
        // only offer to pan when there is something off-screen to pan to
        panFrom = canPan() ? { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y } : null
        // the water keeps the finger too: without this, a drag that wanders
        // over the tab bar never sends us its release, and the next tap lands
        // in a gesture that never ended
        try {
          stage.setPointerCapture(e.pointerId)
        } catch {
          /* the pointer is already gone */
        }
        if (holdTimer) clearTimeout(holdTimer)
        holdTimer = setTimeout(() => {
          if (bgDown && !pageFor && !holding) {
            const b = bgDown
            bgDown = null
            clearAll()
            openPage('capture', undefined, b.x, b.y)
            // Your finger is still down, and the page has just appeared under
            // it. iOS then treats the rest of that press as a long-press on
            // the text — magnifier, selection handles, callout. Let the page
            // ignore this gesture; it starts listening once you have let go.
            deafenPage()
          }
        }, 420)
      }
      return
    }
    const id = bubEl.dataset.id as string
    if (id === '__invite') {
      openPage('capture', undefined, toScreenX(invitePos.x), toScreenY(invitePos.y))
      return
    }
    // Every node lives in byId now, however deep, so "is this a member?" can no
    // longer be answered by whether it is there. It is a member when the group
    // it belongs to is the group currently open — which is also exactly when it
    // is on screen in orbit.
    const ent = view.byId.get(id)
    if (!ent) return
    const parent = view.parentOf.get(id)
    const memberPool = parent && parent === openPool ? parent : undefined
    const p = posOf(id)
    drag = {
      id,
      tl: ent,
      isMember: !!memberPool,
      memberPool,
      dx: p.x - toWorldX(e.clientX),
      dy: p.y - toWorldY(e.clientY),
      sx: e.clientX,
      sy: e.clientY,
      vx: 0,
      vy: 0,
      moved: false,
      touching: false,
      target: null,
      el: bubEl,
    }
    stage.setPointerCapture(e.pointerId)
    if (holdTimer) clearTimeout(holdTimer)
    if (!memberPool) {
      holdTimer = setTimeout(() => {
        if (drag && !drag.moved) {
          const held = drag.tl
          drag.el.classList.remove('dragging')
          drag = null
          startPull(held, false)
        }
      }, 430)
    }
  })
  stage.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      camTarget = null
      zoomAt(pinch.mx, pinch.my, pinch.k * (dist / pinch.dist))
      return
    }
    if (!drag && panFrom) {
      const dx = e.clientX - panFrom.x
      const dy = e.clientY - panFrom.y
      if (!panning && Math.hypot(dx, dy) > PAN_SLOP) {
        panning = true
        bgDown = null
        if (holdTimer) clearTimeout(holdTimer)
      }
      if (panning) {
        camTarget = null
        cam.x = panFrom.cx + dx
        cam.y = panFrom.cy + dy
        applyCam()
        return
      }
    }
    if (!drag) {
      if (bgDown && Math.hypot(e.clientX - bgDown.x, e.clientY - bgDown.y) > slopFor(e)) {
        bgDown = null
        if (holdTimer) clearTimeout(holdTimer)
      }
      return
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > slopFor(e)) {
      drag.moved = true
      if (holdTimer) clearTimeout(holdTimer)
      drag.el.classList.add('dragging')
      closeMoons()
    }
    if (!drag.moved) return
    const p = posOf(drag.id)
    const nx = toWorldX(e.clientX) + drag.dx
    const ny = toWorldY(e.clientY) + drag.dy
    drag.vx = (nx - p.x) * 0.6 + drag.vx * 0.4
    drag.vy = (ny - p.y) * 0.6 + drag.vy * 0.4
    p.x = nx
    p.y = ny
    // the closer to the water, the more the sea reaches up for it
    if (drag.tl.kind === 'drop') {
      // against the water that is actually under it, which is not level with
      // the screen once the phone is tilted
      const line = seaLineAt(e.clientX, worldTilt(), W)
      const reach = 190
      const near = Math.max(0, Math.min(1, (e.clientY - (line - reach)) / reach))
      const ready = e.clientY > line - 12
      showTide(Math.round(near * 20) / 20, ready)
      drag.el.classList.toggle('sinking', ready)
    }
    drag.target = null
    // at the water you are letting go, not merging — one signal at a time
    if (seaNear > 0.55) {
      meter.classList.remove('on', 'zero')
      clearFuse()
      drag.touching = false
      return
    }
    {
      // Inside an opened group you are looking for a sibling; out on the water
      // you are looking for anything. Two siblings brought together become a
      // group of their own, nested inside the one holding them.
      const siblings = drag.isMember && drag.memberPool ? (view.byId.get(drag.memberPool)?.members ?? []) : null
      const candidates: TL[] = siblings
        ? siblings.map((m) => view.byId.get(m.id)).filter((x): x is TL => !!x)
        : view.tls
      let best: TL | null = null
      let bestD = Infinity
      for (const tl of candidates) {
        if (tl.t.id === drag.id) continue
        const tp = posOf(tl.t.id)
        const d = Math.hypot(tp.x - p.x, tp.y - p.y)
        if (d < bestD) {
          bestD = d
          best = tl
        }
      }
      const rOf = (tl: TL) => (siblings ? memberRadiusOf(tl.t.id, siblings.length) : radiusOf(tl))
      // These distances are in world units, and a full ring pulls the camera
      // out to 0.6 or less — which quietly turned a comfortable target into
      // one a finger could not hit. Held in screen pixels instead, joining
      // takes the same gesture however far out you are.
      const slop = (siblings ? 46 : 90) / cam.k
      if (best && bestD < rOf(drag.tl) + rOf(best) + slop) {
        const bp = posOf(best.t.id)
        const ra = rOf(drag.tl)
        const rb = rOf(best)
        // overlapping by a finger's worth on screen, not by a fixed fraction
        // of two bodies that may be 30px across after the camera pulls back
        const touching = bestD < (ra + rb) * 0.94 + (siblings ? 26 / cam.k : 0)
        // the two bodies are now in each other's field — the frame loop draws
        // the neck and leans them into one another
        fuse = { a: drag.id, b: best.t.id, ra, rb }
        // and what they would become, which is the only useful thing to say
        meter.textContent =
          best.kind === 'pool'
            ? label(best.t)
            : (sharedConcept([label(drag.tl.t), label(best.t)]) ?? 'a new pool')
        meter.style.left = ((p.x + bp.x) / 2) * cam.k + cam.x + 'px'
        meter.style.top = ((p.y + bp.y) / 2) * cam.k + cam.y - (Math.max(ra, rb) * cam.k + 26) + 'px'
        meter.classList.add('on')
        meter.classList.toggle('zero', touching)
        if (touching && !drag.touching) haptics.grab()
        drag.touching = touching
        if (touching) drag.target = best
      } else {
        meter.classList.remove('on', 'zero')
        clearFuse()
        drag.touching = false
      }
    }
  })
  // Release is heard at the window, not the stage: a finger that wanders over
  // the tab bar or off the edge still ends its gesture. Pointer capture already
  // routes these through the stage, so this hears each release exactly once.
  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId)
    if (pinch) {
      if (touches.size < 2) pinch = null
      return
    }
    if (panning) {
      panning = false
      panFrom = null
      return
    }
    panFrom = null
    if (holdTimer) clearTimeout(holdTimer)
    if (holding && !holding.auto) {
      endHold(true)
      return
    }
    if (!drag) {
      if (bgDown && Math.hypot(e.clientX - bgDown.x, e.clientY - bgDown.y) < slopFor(e)) {
        const now = performance.now()
        if (now - lastTap < 320) {
          // two taps on open water: frame the whole sky
          lastTap = 0
          clearAll()
          fitAll()
        } else {
          lastTap = now
          clearAll()
        }
      }
      bgDown = null
      return
    }
    const d = drag
    drag = null
    meter.classList.remove('on', 'zero')
    d.el.classList.remove('dragging', 'sinking')
    clearFuse()
    hideTide()
    if (!d.moved) {
      onTap(d.id, d.isMember)
      return
    }
    if (d.tl.kind === 'drop' && e.clientY > seaLineAt(e.clientX, worldTilt(), W) - 12) {
      completeDrop(d.tl.t)
      persistLayout()
      return
    }
    if (d.isMember && d.memberPool && !d.target) {
      const gp = posOf(d.memberPool)
      const p = posOf(d.id)
      const g = view.byId.get(d.memberPool)
      if (g && Math.hypot(gp.x - p.x, gp.y - p.y) > radiusOf(g) + 70) releaseMember(d.tl.t, d.memberPool)
    }
    if (d.target) {
      const p = posOf(d.id)
      const tp = posOf(d.target.t.id)
      // brought together inside a group, what they become belongs to that group
      poolTogether(d.target, d.tl, { x: (p.x + tp.x) / 2, y: (p.y + tp.y) / 2 }, d.memberPool)
    } else if (Math.hypot(d.vx, d.vy) > 2.5) {
      const p = posOf(d.id)
      p.vx = Math.max(-14, Math.min(14, d.vx))
      p.vy = Math.max(-14, Math.min(14, d.vy))
    }
    persistLayout()
  }
  const onCancel = (e: PointerEvent) => {
    touches.delete(e.pointerId)
    if (touches.size < 2) pinch = null
    panning = false
    panFrom = null
    bgDown = null
    hideTide()
    if (holdTimer) clearTimeout(holdTimer)
    endHold(false)
    if (drag) drag.el.classList.remove('dragging')
    drag = null
    meter.classList.remove('on', 'zero')
    clearFuse()
  }
  addEventListener('pointerup', onUp)
  addEventListener('pointercancel', onCancel)
  // iOS takes the pointer back for its own reasons. Losing it while we still
  // believe the finger is down is the case that used to strand a gesture —
  // losing it on an ordinary release is just the release, already handled.
  stage.addEventListener('lostpointercapture', (e) => {
    if (touches.has(e.pointerId)) onCancel(e)
  })
  function onTap(id: string, isMember: boolean) {
    const tl = view.byId.get(id)
    if (isMember) {
      // a group inside a group opens like any other: you go in one more level
      if (tl && tl.kind === 'pool') {
        peek = null
        peekAt = null
        openPool = tl.t.id
        closeMoons()
        frameOpen(tl)
        paintAll()
        return
      }
      // Read first, edit second. Twenty in a ring are too small to read, so the
      // first tap opens this one up and pushes the ring apart around it; the
      // second, on a thing you can now actually see, takes you in to write.
      if (peek !== id) {
        // hold the slot it is standing in now, before the paint makes it a card
        const g = openPool ? view.byId.get(openPool) : null
        const mp = pos.get(id)
        if (g && mp) {
          const gp = posOf(g.t.id)
          peekAt = {
            a: Math.atan2(mp.y - gp.y, mp.x - gp.x) - ringSpin(),
            r: Math.hypot(mp.x - gp.x, mp.y - gp.y),
          }
        } else peekAt = null
        peek = id
        peekSettle = 96
        paintAll()
        haptics.grab()
        // And its actions, which it has never had. A thing inside a group
        // could be read and it could be edited and that was the whole of it:
        // no answering it, no working it, no gathering from it, no raining it,
        // unless you first dragged it out of the group it belongs in. The
        // moons follow whatever you last touched, so the group's step aside
        // while you are looking at one of the things in it.
        if (tl) showMoons(tl)
        return
      }
      const t = S().thoughts.find((x) => x.id === id)
      if (t) {
        const p = posOf(id)
        openPage('edit', { kind: 'drop', t, members: [] }, toScreenX(p.x), toScreenY(p.y))
      }
      return
    }
    if (!tl) return
    const p = posOf(id)
    if (tl.kind === 'pool') {
      // tapping the group you are reading out of puts the card away: the thing
      // it was covering is the obvious place to press to get it back
      if (openPool === tl.t.id && peek) {
        peek = null
        peekAt = null
        paintAll()
        showMoons(tl)
        return
      }
      if (openPool === tl.t.id) {
        // The same two-tap rule a drop has always had: once for what you can
        // do to it, again for the thing itself. Until now the second tap on a
        // group did nothing, which is why a group could not be renamed,
        // emptied or thrown away from the only screen it appears on.
        if (moonsFor === tl.t.id) {
          closeMoons()
          openPage('open', tl, toScreenX(p.x), toScreenY(p.y))
        } else showMoons(tl)
      } else {
        clearAll()
        openPool = tl.t.id
        // the camera goes to the pool rather than the pool being shoved into
        // whatever part of the sky happens to be on screen
        frameOpen(tl)
        paintAll()
        showMoons(tl)
      }
      return
    }
    if (moonsFor === id) {
      closeMoons()
      openPage('edit', tl, toScreenX(p.x), toScreenY(p.y))
    } else {
      clearAll()
      showMoons(tl)
    }
  }

  // ---------- frame loop ----------
  const linePool: SVGLineElement[] = []
  let lineUsed = 0
  function drawLine(cls: string, x1: number, y1: number, x2: number, y2: number) {
    let ln = linePool[lineUsed]
    if (!ln) {
      ln = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      links.appendChild(ln)
      linePool.push(ln)
    }
    ln.setAttribute('class', cls)
    ln.setAttribute('x1', String(x1))
    ln.setAttribute('y1', String(y1))
    ln.setAttribute('x2', String(x2))
    ln.setAttribute('y2', String(y2))
    lineUsed++
  }
  function glide(p: Pos, dragged: boolean) {
    const k = reduced ? 1 : dragged ? 0.55 : 0.22
    p.rx += (p.x - p.rx) * k
    p.ry += (p.y - p.ry) * k
    p.s += ((dragged ? 1.045 : 1) - p.s) * 0.18
  }

  // ---------- the echo ----------
  // Rings that leave a live drop and travel outward, several at once, each on
  // its own clock so they never fall into step. The drop you are holding and
  // the drop whose moons are open push hard; a saturated drop only murmurs.
  // drops currently deformed toward another, so their text can be straightened
  const leaning = new Set<string>()
  const echoPool: SVGPathElement[] = []
  let echoUsed = 0
  const ECHO_LAYERS = 4
  function echoFrom(id: string, cx: number, cy: number, r: number, strength: number) {
    const h = hashN(id)
    for (let i = 0; i < ECHO_LAYERS; i++) {
      // each layer has its own period and its own head start — the stack never
      // resolves into one clean pulse
      const period = 3.1 + i * 0.83 + ((h * (i + 2)) % 1.4)
      const off = ((h * 0.37 + i * 0.29) % 1) + i * 0.17
      const phase = ((t / period + off) % 1 + 1) % 1
      const fade = Math.pow(Math.sin(phase * Math.PI), 1.35)
      const o = strength * fade * (1 - i * 0.19)
      if (o < 0.015) continue
      let el = echoPool[echoUsed]
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        echoG.appendChild(el)
        echoPool.push(el)
      }
      // the ring keeps its shape as it travels, and wobbles more the further
      // out it gets, the way a wave loses its edge
      el.setAttribute('d', echoRing(cx, cy, r * (1.02 + phase * 0.95) + 5, h + i * 2.7, 0.028 + phase * 0.05 + i * 0.012))
      // inline, not a presentation attribute: the stylesheet's opacity would win
      el.style.opacity = o.toFixed(3)
      el.style.strokeWidth = (1.15 - i * 0.16).toFixed(2)
      echoUsed++
    }
  }
  function drawEchoes() {
    echoUsed = 0
    if (reduced) {
      for (const el of echoPool) el.style.opacity = '0'
      return
    }
    const seen = new Set<string>()
    const push = (id: string | null | undefined, strength: number) => {
      if (!id || seen.has(id) || echoUsed >= 40) return
      const tl = view.byId.get(id)
      if (!tl) return
      seen.add(id)
      const p = posOf(id)
      // capped: a big pool's echo would otherwise reach across the whole sky
      echoFrom(id, p.rx, p.ry, Math.min(radiusOf(tl) * p.s, 76), strength)
    }
    // an opened pool is already saying it is live, with a ring of its contents
    // and a spoke to each one; rings on top of that is just noise
    if (openPool) {
      if (holding && holding.id !== openPool) push(holding.id, 0.4)
      for (let i = echoUsed; i < echoPool.length; i++) echoPool[i].style.opacity = '0'
      return
    }
    push(holding?.id, 0.4)
    push(moonsFor, 0.3)
    // whatever has gone ripe keeps a quiet pulse of its own — kept to a few, or
    // a full sky of ripe drops turns the echo into scratches
    let ripe = 0
    for (const tl of view.tls) {
      if (ripe >= 3) break
      if (tl.kind === 'drop' && isRipe(tl.t) && !seen.has(tl.t.id)) {
        push(tl.t.id, 0.1)
        ripe++
      }
    }
    for (let i = echoUsed; i < echoPool.length; i++) echoPool[i].style.opacity = '0'
  }
  function coast(p: Pos) {
    if (!p.vx && !p.vy) return
    p.x += p.vx
    p.y += p.vy
    p.vx *= 0.9
    p.vy *= 0.9
    if (Math.abs(p.vx) + Math.abs(p.vy) < 0.15) {
      p.vx = 0
      p.vy = 0
    }
  }
  function hashN(s: string) {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return (Math.abs(h) % 100) / 16
  }
  let t = 0
  let raf = 0
  let dead = false
  function step() {
    if (dead) return
    t += 0.016
    stepHold()
    const busy = drag || holding || pageFor
    if (!busy) {
      view.tls.forEach((tl, i) => {
        if (moonsFor === tl.t.id) return
        const p = posOf(tl.t.id)
        const ang = t * 0.09 + i * 2.1
        p.x += Math.sin(ang) * 0.06
        p.y += Math.cos(ang * 0.8) * 0.05
      })
      for (const pair of allKinPairs()) {
        if (moonsFor && (moonsFor === pair.a.t.id || moonsFor === pair.b.t.id)) continue
        const pa = posOf(pair.a.t.id)
        const pb = posOf(pair.b.t.id)
        const dx = pb.x - pa.x
        const dy = pb.y - pa.y
        const dist = Math.hypot(dx, dy) || 1
        const bonded = hasThread(pair.a.t.id, pair.b.t.id)
        const rest = radiusOf(pair.a) + radiusOf(pair.b) + (bonded ? 44 : 70)
        if (dist > rest) {
          // score runs 0…1 where the old shared-word count ran 1…4, so it is
          // scaled back up to the same range of pull
          const pull = Math.min(0.4, (dist - rest) * 0.0012 * (1 + pair.score * 6 + (bonded ? 2 : 0)))
          pa.x += (dx / dist) * pull
          pa.y += (dy / dist) * pull
          pb.x -= (dx / dist) * pull
          pb.y -= (dy / dist) * pull
        }
      }
      // nothing may overlap. Several soft passes settle a crowded sky without
      // the jitter a single hard shove produces.
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < view.tls.length; i++) {
          for (let j = i + 1; j < view.tls.length; j++) {
            const a = view.tls[i]
            const b = view.tls[j]
            const pa = posOf(a.t.id)
            const pb = posOf(b.t.id)
            let dx = pb.x - pa.x
            let dy = pb.y - pa.y
            let dist = Math.hypot(dx, dy)
            if (dist < 0.01) {
              // exactly coincident: nudge them apart deterministically
              dx = (i % 2 ? 1 : -1) * 0.5
              dy = 0.5
              dist = 0.71
            }
            const min = radiusOf(a) + radiusOf(b) + 26
            if (dist < min) {
              const push = (min - dist) * 0.22
              pa.x -= (dx / dist) * push
              pa.y -= (dy / dist) * push
              pb.x += (dx / dist) * push
              pb.y += (dy / dist) * push
            }
          }
        }
      }
      // The constellation drifts back into frame as a whole — a uniform nudge,
      // so your own arrangement is preserved, just re-centred. "Frame" means
      // what the camera is actually showing: aiming at a fixed point in the
      // world instead put this in a tug of war with fitAll, and drops ended up
      // pushed off the edge of a sky that had just framed them.
      if (view.tls.length && !openPool && !drag && !panning && !pinch && !camTarget) {
        let cx = 0
        let cy = 0
        for (const tl of view.tls) {
          const p = posOf(tl.t.id)
          cx += p.x
          cy += p.y
        }
        cx /= view.tls.length
        cy /= view.tls.length
        const dx = (toWorldX(W / 2) - cx) * 0.011
        const dy = (toWorldY((76 + waterlineY() - 18) / 2) - cy) * 0.011
        if (Math.abs(dx) > 0.008 || Math.abs(dy) > 0.008) {
          for (const tl of view.tls) {
            const p = posOf(tl.t.id)
            p.x += dx
            p.y += dy
          }
        }
      }
      for (const tl of view.tls) {
        const p = posOf(tl.t.id)
        coast(p)
        const r = radiusOf(tl)
        p.x = Math.max(r + 8, Math.min(worldW() - r - 8, p.x))
        p.y = Math.max(r + 8, Math.min(worldH() - r - 8, p.y))
      }
    }
    if (openPool) {
      const g = view.byId.get(openPool)
      if (g) {
        // A card does not snap to its size, it opens out over half a second.
        // Measuring it once when it was painted read the size it was leaving,
        // not the size it was going to — so the layout spent the whole of the
        // rest of the session placing a card that was 68 pixels wide.
        const pe = peek ? els.get(peek) : null
        if (pe) measureOne(peek as string, pe)
        const gp = posOf(g.t.id)
        const n = g.members.length
        const mr = memberR(n)
        const spin = ringSpin()
        // The one you are reading holds the place it was already standing in.
        // It used to come to the middle of the pool, which meant tapping a
        // thing sent it somewhere else to be read — you lost track of which of
        // twenty you had opened. It grows where it is instead, and the ring
        // opens up around it.
        const reader = peek && peekAt ? { id: peek, ...peekAt } : null
        let readBox: { hw: number; hh: number } | null = null
        if (reader) {
          const s = shapes.get(reader.id)
          if (s) readBox = { hw: s.hw, hh: s.hh }
        }
        // how much the card eats, across its ring and along it, at the angle
        // it is actually sitting at
        const ra = reader ? reader.a + spin : 0
        const across = readBox ? readBox.hw * Math.abs(Math.sin(ra)) + readBox.hh * Math.abs(Math.cos(ra)) : 0
        const along = readBox ? readBox.hw * Math.abs(Math.cos(ra)) + readBox.hh * Math.abs(Math.sin(ra)) : 0

        // Contents go on rings, more than one as soon as one stops being a
        // ring. Twenty round a single circle was a bad shape twice over: every
        // drop shrank to fit the circumference, and the circumference grew
        // until its far side was off the glass.
        const radii = ringRadii(g)
        const counts = ringCounts(n)
        ringR = radii.length ? radii[radii.length - 1] : 0
        let taken = 0
        const rings = counts.map((c, i) => {
          const items = g.members.slice(taken, taken + c)
          taken += c
          return { r: radii[i], items, i }
        })

        for (const ring of rings) {
          const holdsCard = !!reader && ring.items.some((m) => m.id === reader.id)
          // Each member takes as much of its ring as its own size needs, not an
          // equal slice, so a longer title gets more room than a short one.
          const slice = (m: Thought, or: number) =>
            m.id === reader?.id
              ? Math.asin(Math.min(0.98, (across + 14) / or))
              : Math.asin(Math.min(0.98, (memberRadiusOf(m.id, n) + 7) / or))
          // A card wants more of its ring than a circle has. The ring opens up
          // to find it — but only so far, because opening it all the way walks
          // the far side off the screen; past that the room comes from the
          // neighbours giving way locally, which settling below does.
          let or = ring.r
          for (let it = 0; it < 4 && holdsCard; it++) {
            const need = ring.items.reduce((sum, m) => sum + slice(m, or), 0) * 2
            if (need <= Math.PI * 2) break
            or = Math.min(ring.r * 1.25, or * (need / (Math.PI * 2)))
          }
          const widths = ring.items.map((m) => slice(m, or))
          const span = widths.reduce((sum, w) => sum + w, 0) * 2
          const scale = (Math.PI * 2) / Math.max(Math.PI * 2, span)
          // Whatever the ring does not need, it shares out between them. Seven
          // drops need about two thirds of a circle, and without this the walk
          // simply stopped when it ran out of members — leaving them huddled
          // down one side of a ring that was two thirds empty. A ring should
          // look like a ring at any number.
          const slack = Math.max(0, (Math.PI * 2 - span) / ring.items.length)

          // The walk starts at the top, offset half a slot on every other ring
          // so the rings interleave instead of lining up into spokes. While you
          // are reading, the ring holding the card starts *at* the card, so it
          // keeps its angle and every shuffle happens on the far side from it.
          const start = holdsCard ? ring.items.findIndex((m) => m.id === reader?.id) : 0
          const from = start < 0 ? 0 : start
          const stagger = ring.i % 2 ? Math.PI / Math.max(1, ring.items.length) : 0
          const base = holdsCard ? ra : -Math.PI / 2 + spin + stagger
          // the walk lands each member in the middle of its own share; shifting
          // back by the first one's puts the one we started from exactly on the
          // angle it is meant to hold
          const anchor = holdsCard ? widths[from] * scale : 0
          let walked = 0
          for (let k = 0; k < ring.items.length; k++) {
            const idx = (from + k) % ring.items.length
            const m = ring.items[idx]
            // step to the middle of this one's share, then past it
            walked += widths[idx] * scale
            const a = base + walked - anchor
            walked += widths[idx] * scale + slack
            const mp = posOf(m.id)
            if (!(drag && drag.id === m.id)) {
              const ease = peek ? 0.16 : 0.1
              // The card stays on the radius it was opened at. The only claim
              // on it is the group's own name at the centre: the card is opaque
              // and sits in front, so covering the pool's body is fine, but
              // covering what the group is called is not. So it is pushed out
              // just far enough to leave that core clear — usually a few pixels
              // and never a journey.
              const core = Math.min(52, radiusOf(g) * 0.4)
              const rad = reader && reader.id === m.id ? Math.max(reader.r, core + along) : or
              mp.x += (gp.x + Math.cos(a) * rad - mp.x) * ease
              mp.y += (gp.y + Math.sin(a) * rad - mp.y) * ease
            }
            // Members stay in the world, not in the window — clamping them to
            // the glass is what used to fold one side of a ring onto the other.
            // Held per axis and to the body's real extents: a card is wide and
            // short, and the circle drawn round it is wider than half the
            // world, which pinned the thing you had just opened to a fixed spot
            // instead of leaving it where you tapped it.
            const sh = shapes.get(m.id)
            const hx = sh ? sh.hw : memberRadiusOf(m.id, n)
            const hy = sh ? sh.hh : memberRadiusOf(m.id, n)
            if (worldW() > hx * 2) mp.x = Math.max(hx, Math.min(worldW() - hx, mp.x))
            if (worldH() > hy * 2) mp.y = Math.max(hy, Math.min(worldH() - hy, mp.y))
          }
        }
        // Now let the shapes settle against each other. A ring is only a
        // suggestion; what actually decides where a member ends up is not
        // bumping into its neighbours, measured against their true outlines
        // rather than circles drawn round them. This is what lets a drop tuck
        // into the space beside a card instead of orbiting a corner it does
        // not have.
        separate(g, gp)
        // and the glass comes to the card, once, while it is opening
        if (drag || panning || pinch) peekSettle = 0
        if (reader && readBox && peekSettle > 0) {
          peekSettle--
          bringIntoView(reader.id, readBox)
        }
        // clear the whole orbit's room — the outermost ring, not the first —
        // so the rest of the sky drifts out of the way of all of it
        const clear = ringR + mr + 34
        for (const other of view.tls) {
          if (other.t.id === g.t.id) continue
          const op = posOf(other.t.id)
          const dx = op.x - gp.x
          const dy = op.y - gp.y
          const dist = Math.hypot(dx, dy) || 1
          const need = clear + radiusOf(other)
          if (dist < need) {
            const push = (need - dist) * 0.08
            op.x += (dx / dist) * push
            op.y += (dy / dist) * push
          }
        }
      }
    }
    /*
     * A thing's actions clear their own row.
     *
     * They are opaque and lit from the front, so they are legible over
     * anything — but being legible over a bubble still means covering the
     * bubble's name, and you opened the menu *on* that thing. So while the row
     * is up, whatever it lands on drifts out from under it: the same idea as
     * an open pool pushing the sky out of its orbit, applied to a band rather
     * than a circle. Vertically only — sliding sideways would scatter the sky
     * every time you tapped something.
     */
    if (moonsFor && openPool !== moonsFor && !reduced) {
      const host = view.byId.get(moonsFor)
      const hp = host ? posOf(host.t.id) : null
      if (host && hp) {
        const rowY = Math.min(hp.y + radiusOf(host) + 52, toWorldY(waterlineY() - 118) - 27)
        const halfRow = 34 / cam.k
        for (const other of view.tls) {
          if (other.t.id === host.t.id) continue
          const op = posOf(other.t.id)
          const need = radiusOf(other) + halfRow + 10
          const gap = op.y - rowY
          if (Math.abs(gap) < need) {
            const push = (need - Math.abs(gap)) * 0.09
            op.y += gap >= 0 ? push : -push
          }
        }
      }
    }
    // render — settle every body first, then decide how each one is deformed,
    // then draw. The neck and the drops have to be built from the same numbers
    // or the outline reads as a reflection floating behind two hard circles.
    for (const id of els.keys()) {
      const p = pos.get(id)
      if (!p) continue
      glide(p, drag?.id === id && drag.moved)
      p.mt = 0
    }
    if (fuse && !reduced) {
      const pa = pos.get(fuse.a)
      const pb = pos.get(fuse.b)
      if (pa && pb) {
        const dx = pb.rx - pa.rx
        const dy = pb.ry - pa.ry
        const d = Math.hypot(dx, dy) || 1
        const ra = fuse.ra * pa.s
        const rb = fuse.rb * pb.s
        // the same easing the neck uses: nothing happens until they are in
        // each other's reach, then it comes on fast
        const reach = (ra + rb) * 1.62
        const v = Math.max(0, Math.min(1, 1 - (d - (ra + rb) * 0.42) / (reach - (ra + rb) * 0.42)))
        const k = v * 0.17
        pa.mt = k
        pa.mx = dx / d
        pa.my = dy / d
        pb.mt = k
        pb.mx = -dx / d
        pb.my = -dy / d
      }
    }
    for (const [, p] of pos) p.mk += (p.mt - p.mk) * (reduced ? 1 : 0.24)
    if (fuse) {
      const pa = pos.get(fuse.a)
      const pb = pos.get(fuse.b)
      let path: string | null = null
      let show = 0
      let joined = false
      if (pa && pb) {
        const ra = fuse.ra * pa.s * (1 + pa.mk)
        const rb = fuse.rb * pb.s * (1 + pb.mk)
        const dist = Math.hypot(pb.rx - pa.rx, pb.ry - pa.ry)
        path = metaballPath(pa.rx, pa.ry, fuse.ra * pa.s, pb.rx, pb.ry, fuse.rb * pb.s, pa.mk, pb.mk)
        // it fades in as they come into reach, and hands the shape back to the
        // bodies once they have genuinely merged — past that it would only be
        // drawing an outline over a mass it is no longer holding together
        const reach = (ra + rb) * 1.62
        const near = Math.max(0, Math.min(1, 1 - (dist - (ra + rb) * 0.42) / (reach - (ra + rb) * 0.42)))
        const over = Math.max(0, (ra + rb - dist) / (ra + rb))
        show = Math.min(1, near * 3.5) * Math.max(0, 1 - over / 0.16)
        joined = near > 0.5
      }
      goo.setAttribute('d', path ?? '')
      goo.style.opacity = path ? show.toFixed(3) : '0'
      goo.classList.toggle('ready', !!path && Math.max(pa?.mk ?? 0, pb?.mk ?? 0) > 0.12)
      // one surface, not two overlapping outlines: from the moment the neck is
      // really carrying the join, the drops give up their own rims to it — but
      // not while it is still a hairline, or they would lose their edges to
      // something too faint to have replaced them
      setFusing(path && joined ? [fuse.a, fuse.b] : [])
    }
    paintOil()
    const up = stepUpright(reduced)
    const level = Math.abs(up) > 0.2 ? ` rotate(${up.toFixed(2)}deg)` : ''
    for (const [id, el] of els) {
      const p = pos.get(id)
      if (!p) continue
      // half of each axis: the opened card is wider than it is tall, and using
      // one number for both hangs it off its own centre
      const rx = el.clientWidth / 2 || 40
      const ry = el.clientHeight / 2 || rx
      const squish = reduced ? 0 : Math.sin(t * 2 + hashN(id)) * 0.014
      // a body pulled toward another stretches along the line between them and
      // narrows across it — it does not simply grow. The words ride the surface
      // rather than being smeared by it, so they stay readable throughout.
      let lean = ''
      if (p.mk > 0.002) {
        const deg = (Math.atan2(p.my, p.mx) * 180) / Math.PI
        const sx = 1 + p.mk
        const sy = 1 - p.mk * MORPH_PERP
        lean = ` rotate(${deg.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${(-deg).toFixed(1)}deg)`
        el.style.setProperty(
          '--unlean',
          `rotate(${deg.toFixed(1)}deg) scale(${(1 / sx).toFixed(3)}, ${(1 / sy).toFixed(3)}) rotate(${(-deg).toFixed(1)}deg)`,
        )
        leaning.add(id)
      } else if (leaning.has(id)) {
        el.style.removeProperty('--unlean')
        leaning.delete(id)
      }
      // A drop hangs the way a drop hangs, however the phone is being held: its
      // highlight stays on top and its words stay the right way up. Applied
      // last, so it turns the body's own contents and leaves the lean — which
      // points at another drop on screen — in screen space where it belongs.
      el.style.transform =
        `translate3d(${p.rx - rx}px, ${p.ry - ry}px, 0) scale(${p.s + squish}, ${p.s - squish})${lean}${level}`
    }
    drawEchoes()
    if (inviteEl.style.display !== 'none') {
      invitePos.x = W / 2 + Math.sin(t * 0.4) * 5
      invitePos.y = H * 0.34 + Math.cos(t * 0.3) * 4
      inviteEl.style.transform = `translate3d(${invitePos.x - 96}px, ${invitePos.y - 96}px, 0)`
    }
    if (camTarget) {
      cam.x += (camTarget.x - cam.x) * 0.14
      cam.y += (camTarget.y - cam.y) * 0.14
      cam.k += (camTarget.k - cam.k) * 0.14
      if (Math.abs(camTarget.k - cam.k) < 0.002 && Math.abs(camTarget.x - cam.x) < 0.6) camTarget = null
      applyCam()
    }
    layoutMoons()
    lineUsed = 0
    if (!openPool) {
      for (const pair of allKinPairs()) {
        if (hasThread(pair.a.t.id, pair.b.t.id)) continue
        const pa = posOf(pair.a.t.id)
        const pb = posOf(pair.b.t.id)
        drawLine('kin', pa.rx, pa.ry, pb.rx, pb.ry)
      }
      for (const th of view.threads) {
        const pa = pos.get(th.a)
        const pb = pos.get(th.b)
        if (pa && pb) drawLine('bond', pa.rx, pa.ry, pb.rx, pb.ry)
      }
    }
    if (openPool) {
      const g = view.byId.get(openPool)
      if (g) {
        const gp = posOf(g.t.id)
        for (const m of g.members) {
          const mp = posOf(m.id)
          drawLine('orbitline', gp.rx, gp.ry, mp.rx, mp.ry)
        }
      }
    }
    for (let i = lineUsed; i < linePool.length; i++) linePool[i].setAttribute('class', 'off')
    raf = requestAnimationFrame(step)
  }

  // ---------- boot ----------
  rebuild()
  paintAll()
  setTimeout(() => fitAll(false), 60)
  setTimeout(() => fitAll(), 900)
  let lastCount = view.tls.length
  let fitSoon: ReturnType<typeof setTimeout> | null = null
  function fitWhenSettled() {
    if (fitSoon) clearTimeout(fitSoon)
    fitSoon = setTimeout(() => fitAll(), 850)
  }
  const unsub = useGraph.subscribe(() => {
    rebuild()
    paintAll()
    // a burst of new thinking should be shown to you, not hidden off-screen
    if (view.tls.length - lastCount >= 3) fitWhenSettled()
    lastCount = view.tls.length
    tidyEl.classList.toggle('show', view.tls.filter((tl) => tl.kind === 'drop').length >= 6 && !S().offline)
    measureCorner()
  })
  raf = requestAnimationFrame(step)
  const n = view.tls.length
  if (n > 0) say(view.tls.some((tl) => tl.kind === 'drop' && isRipe(tl.t)) ? 'something is saturated' : n >= 8 ? 'a storm is brewing — hold a drop to gather it' : 'welcome back')
  /**
   * A notification was tapped, and it was about one particular thing.
   *
   * Landing on the front door after being told "5 steps · 3 found" is a small
   * betrayal: you were told about something specific, so that is what should
   * open.
   *
   * Tried immediately — the brief is almost always already here, and making
   * the tap wait on a network round trip it does not need would be the slowest
   * possible way to show something we are already holding — and again after
   * collecting, for the case where the run being announced is the very one
   * that has not landed yet.
   */
  function openArrivedBrief(): boolean {
    if (dead || pageFor) return false
    const want = new URLSearchParams(location.search).get('brief')
    if (!want) return false
    const tl = view.byId.get(want)
    if (!tl || !briefOf(want)) return false
    history.replaceState(null, '', location.pathname)
    focusOn(posOf(want))
    openPage('brief', tl, W / 2, innerHeight / 2)
    return true
  }
  const wanted = openArrivedBrief()
  // and anything the agent finished while this page did not exist
  void collectOwed().then(() => {
    if (!wanted) openArrivedBrief()
  })
  // and stop it reopening on every refresh, whether or not it was ever found.
  // On its own timer rather than after collecting: collecting talks to the
  // network, and a link that sticks in the address bar because the network is
  // down would reopen on every launch from then on.
  if (!wanted && new URLSearchParams(location.search).has('brief')) {
    setTimeout(() => {
      if (!dead && new URLSearchParams(location.search).has('brief')) history.replaceState(null, '', location.pathname)
    }, 12000)
  }

  return () => {
    dead = true
    cancelAnimationFrame(raf)
    unsub()
    removeEventListener('resize', onResize)
    removeEventListener('pointerup', onUp)
    removeEventListener('pointercancel', onCancel)
    vv?.removeEventListener('resize', measureKeyboard)
    vv?.removeEventListener('scroll', measureKeyboard)
    if (deafT) clearTimeout(deafT)
    document.documentElement.style.removeProperty('--kb')
    document.body.classList.remove('sky-held')
    document.body.classList.remove('sky-resting')
    stopMic()
    if (layoutT) clearTimeout(layoutT)
    if (undoT) clearTimeout(undoT)
    if (sayT) clearTimeout(sayT)
    if (holdTimer) clearTimeout(holdTimer)
    inviteEl.remove()
  }
}

// minimal typing for the webkit speech API
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((ev: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}
