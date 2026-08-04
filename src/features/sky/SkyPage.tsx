// The Sky — the app's home. The interface IS the water world from the
// prototype: glass drops backed by real thoughts, pools backed by goals,
// threads backed by relationships, the ocean backed by done, the high
// clouds backed by snooze. No cards, no forms — hold the sky and write.
import { useEffect, useRef } from 'react'
import { useGraph } from '@/store/graph'
import { parseCapture } from '@/domain/parse-blocks'
import { runAction } from '@/ai/client'
import { isWebUrl } from '@shared/ai/url'
import type { ClassifyOutput } from '@shared/ai/actions/classify-thought'
import { nameThePool, organizeText, tidySky } from './absorbFlow'
import { seaLineAt, waterlineY } from '@/world/water'
import { evaporateAt } from '@/world/Atmosphere'
import { KIN_EVIDENCE, KIN_POOL, KIN_THREAD, type Kinship, kinship } from '@/domain/kinship'
import { humanDate, humanDue } from '@/domain/human-date'
import { nextAction } from '@/domain/next-action'
import { armUpright, stepUpright, worldTilt } from '@/world/upright'
import { applyDeepen, deepenThought } from './deepenFlow'
import { applyAnswer, answerThought } from './answerFlow'
import { applyDraft, draftThought } from './draftFlow'
import { rainThought } from './rainFlow'
import { curtainLifted, markSkyReady, whenCurtainLifts } from './ready'
import { TINT_NAMES, tintOf, tintRGB, type TintName } from './tints'
import { handOver, shareText, shareTitle } from './share'
import { drawCard } from './shareCard'
import { faceOf, isWall, lookAtWall } from './lookFlow'
import { learnFromLettingGo } from './letGoFlow'
import { closeGoal, evaporateGoal } from './finishFlow'
import { emptiedGroup, wouldCircle } from '@/domain/finished'
import { fullDepth, sizeUp, type Sizing } from './gaugeFlow'
import { workFace, type Phase, type WorkState } from './working'
import { isMakeable, isQuestion } from '@/domain/question'
import {
  addTo,
  bin,
  branchesOf,
  complete,
  groupInto,
  membersOf,
  moveInto,
  rename,
  takeOut,
  ungroup,
  type Undone,
} from './groupFlow'
import { branchOf, dropAt, type Drop, type Line } from './arrange'
import { editsPending, flushEdits, forgetEdit, keepEdit, watchForLeaving } from './autosave'
import { findLikeThis, imageSearchUrl, keepImage, type Find } from './findFlow'
import { breath } from './breath'
import { awaitRun, markApplied, pendingRuns, subjectOf } from '@/ai/pending'
import { reshapeTally, reshapeThought } from './reshapeFlow'
import { haptics } from '@/lib/haptics'
import { sendWork, sentWord } from '@/lib/send'
import { holdReload } from '@/lib/sw'
import { noteTrail } from '@/lib/trail'
import { echoRing, wabiBlob, wabiPill, wabiSeed } from '@/world/echo'
import { rippleAt, WAKE } from '@/world/ripple'
import { type Body, card, contact, disc, oilPath, pull } from '@/world/shape'
import type { Thought, ThoughtType } from '@/domain/types'
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
      <div className="sky-tide" data-sky="tide" aria-hidden="true">
        <div className="edge-line" />
      </div>
      <div className="sky-sea-word" data-sky="seaword" aria-hidden="true">
        <span className="arrow">↓</span>
        <span className="lb" />
      </div>
      {/* The other edge. Up is finished, down is let go — see riseDrop and
          sinkDrop. Each is a band, a hairline where the point of no return
          actually is, and a pill that says which it is; bare text floating in
          the middle of a dark sky told you neither how far to go nor what
          would happen when you got there. */}
      <div className="sky-updraft" data-sky="updraft" aria-hidden="true">
        <div className="edge-line" />
      </div>
      <div className="sky-sky-word" data-sky="skyword" aria-hidden="true">
        <span className="arrow">↑</span>
        <span className="lb" />
      </div>
      <div className="sky-meter" data-sky="meter" aria-hidden="true" />
      <button className="sky-rest" data-sky="rest" aria-label="Resting thoughts">
        ☁
      </button>
      {/* One bar, two zones: the thing to do next, and the pen. A nested
          button is not a thing HTML has, so the bar is a div and each zone
          presses on its own. */}
      <div className="sky-next" data-sky="next">
        <button className="go" data-sky="nextGo" aria-label="What to do next">
          <span className="lb" data-sky="nextLb" />
          <span className="why" data-sky="nextWhy" />
        </button>
        <button className="pen" data-sky="nextPen" aria-label="Write a thought">
          ✎
        </button>
      </div>
      <button className="sky-tidy" data-sky="tidy" aria-label="Gather loose thoughts into pools">
        ✦ tidy
      </button>
      {/* Where the agent speaks. See say()/hold(). */}
      <div className="sky-voice" data-sky="voice" role="status">
        <span className="who" data-sky="voiceWho" />
        <span className="lb" data-sky="voiceLb" />
        {/* …and while it is away, what it is away doing. See working.ts. */}
        <div className="work" data-sky="voiceWork" hidden>
          <div className="bar">
            <i data-sky="voiceBar" />
          </div>
          <div className="needs" data-sky="voiceNeeds" />
          <div className="note" data-sky="voiceNote" />
        </div>
      </div>
      {/* The pen alone, for when the bar above has nothing to say. After the
          voice in the DOM on purpose: the CSS that yields this slot to a
          speaking sibling can only look backwards. */}
      <button className="sky-write" data-sky="write" aria-label="Write a thought">
        ✎ write
      </button>
      {/* speaking is one tap: no page to open first, no button to find inside it */}
      <div className="sky-undo" data-sky="undo">
        <span className="lb" data-sky="undoLb" />
        <b data-sky="undoGo">bring it back</b>
      </div>
      <div className="sky-page" data-sky="page" role="dialog" aria-label="Write">
        <div className="top">
          <div className="pq" data-sky="pageQ" />
          {/* The two things you do *to* a thing rather than inside it, up
              where they can be reached. They used to live at the foot of the
              list — which on a list of seven is a scroll away, and the colour
              row scrolled off the top the moment you looked at anything. */}
          <button className="tone" data-sky="pageTone" aria-label="Colour" aria-expanded="false" hidden>
            <i />
          </button>
          <button className="hand" data-sky="pageShare" aria-label="Send it to someone" hidden>
            <Ico d="M12 15.4V4.2M8.1 8.1 12 4.2l3.9 3.9M5.4 13.2v5a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8v-5" />
          </button>
          <button className="x" data-sky="pageX" aria-label="Close">
            ×
          </button>
          {/* The palette opens *along* the bar rather than down out of it. A
              column hung two hundred and eighty points down the middle of the
              screen, over the list it was about — a curtain, not a control.
              This takes the bar it is already in: the label and the
              hand-it-over step aside for the moment it is open. */}
          <div className="tones" data-sky="pageTones" role="group" aria-label="Colours" />
        </div>
        {/* Where this writing will land, said before it lands. Tappable: one
            tap swaps "into the group you are standing in" for "loose in the
            sky", which is the transparency two playtesters went hunting for
            after the fact. */}
        <button className="whither" data-sky="pageInto" hidden />
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
            {/* The way out. See src/lib/send.ts — the funnel ran a thought all
                the way to a finished buyer note and then had nowhere to put
                it. */}
            <button className="tool" data-sky="pageSend" aria-label="Send this">
              <Ico d="M12 16.4V4.2M7.6 8.6 12 4.2l4.4 4.4M4.6 14.6v3.4a1.8 1.8 0 0 0 1.8 1.8h11.2a1.8 1.8 0 0 0 1.8-1.8v-3.4" />
            </button>
            {/* A crescent moon, not a cloud. This wore a cloud while "make
                the steps" wears a storm cloud, and a playtester rested her
                whole campaign believing she was asking for steps — a
                destructive-adjacent verb must not share a glyph family with
                a generative one. Sleep looks like sleep. */}
            <button className="tool" data-sky="pageLater" aria-label="Let it rest until tomorrow">
              <Ico d="M19.2 14.6A7.6 7.6 0 0 1 9.4 4.8a7.6 7.6 0 1 0 9.8 9.8Z" />
            </button>
            <span className="note" data-sky="pageN" />
          </div>
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
/** Somebody's own words, on their way into an attribute or a document. They are
 *  words, not markup, and this is the only thing standing between the two. */
export const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function briefHtml(
  md: string,
  sources: { title: string; url: string }[],
  /** Live rows to slot in ahead of the sources — see whatToDoNext. */
  extra = '',
): string {
  // **lead** — the rest, which is the one bit of inline markup it uses
  const inline = (t: string) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      // …and `_like this_`, which the walker did not know and so printed with
      // its underscores showing, in the middle of an otherwise finished page
      .replace(/(^|\s)_([^_]+)_(?=$|[\s.,;:!?])/g, '$1<i>$2</i>')
  /*
   * `**the point** — why it matters` is the one shape the agent writes, in
   * every bullet and every step, and it was being rendered as one run-on line
   * with a bold bit at the front. On a phone that is a wall: the thing itself
   * and the reason for it are different weights of information and they were
   * the same size, the same colour, on the same line, at 13.5px.
   *
   * Split at the dash. What it is goes on top at reading size; why it matters
   * goes underneath, quieter. `.d` has been styled for exactly this since the
   * page was written and nothing has ever produced one.
   */
  const lead = (t: string): { head: string; why: string } | null => {
    const m = /^\*\*(.+?)\*\*\s*(?:[—–-]\s*)?(.*)$/.exec(t)
    // No bold lead means it is not a point-and-reason at all — the watch-outs
    // are written as plain sentences — and setting one of those at heading
    // weight turns a caveat into a claim.
    if (!m) return null
    return { head: esc(m[1]), why: inline(m[2].trim()) }
  }
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
      const l = lead(line.slice(2))
      out.push(
        l
          ? `<div class="a"><div class="h">${l.head}</div>${l.why ? `<div class="d">${l.why}</div>` : ''}</div>`
          : `<div class="a">${inline(line.slice(2))}</div>`,
      )
    } else if (/^\d+\.\s/.test(line)) {
      n++
      const body = line.replace(/^\d+\.\s*/, '')
      const l = lead(body)
      out.push(
        `<div class="step${n === 1 ? ' first' : ''}"><div class="k">${n}</div>` +
          `<div class="v">${l ? l.head : inline(body)}</div>` +
          `${l?.why ? `<div class="d">${l.why}</div>` : ''}</div>`,
      )
    } else {
      out.push(`<div class="a">${inline(line)}</div>`)
    }
  }
  // Before the sources, after the reading: what you might actually do about
  // any of it. A brief that ends in a bibliography is a document; a brief that
  // ends in a button is the agent finishing the job it started.
  if (extra) out.push(extra)
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
      if (!isWebUrl(s.url)) continue
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
  /*
   * The breath: a few pixels of drift around where this drop belongs.
   *
   * An *offset*, and that is the whole of the point. It used to be written
   * straight into `x` and `y` — `p.x += Math.sin(ang) * 0.06` every frame —
   * and adding a sine to a position sixty times a second does not wobble it,
   * it integrates it. The excursion of an integrated sine is its amplitude
   * over its frequency: 0.06 per frame at 0.016 per tick is 3.75 a tick, over
   * 0.09, which is **forty-two pixels** in x and another forty-three in y, on
   * a seventy-second round trip.
   *
   * Measured on the built app: every drop in the sky wandered between thirty
   * and a hundred pixels away from where it was put and then slowly came back,
   * for ever. That is the drift, and it was never anybody's intention — the
   * intention was that the sky should breathe.
   *
   * Kept out of `x`/`y` so a drop's real place never moves: the arrangement
   * you made survives, and a layout saved while the sky is breathing saves
   * where things belong rather than wherever the sine happened to be.
   */
  bx: number
  by: number
  /*
   * You put this one here on purpose.
   *
   * The kin spring pulls like-minded drops toward each other for as long as
   * they are apart, and that is right for a sky nobody has arranged — it is
   * how a loose pile of thoughts finds its own shape. It is wrong the moment
   * you have expressed an opinion. Measured: drag a drop to a clear patch of
   * sky and it creeps sixty pixels away over the next half a minute and stops,
   * which reads as the app quietly disagreeing with where you put it.
   *
   * A pinned drop is out of the spring and nothing else. It still cannot
   * overlap anything, and it still travels with the whole constellation when
   * the sky re-centres, because that is a uniform move and preserves exactly
   * the arrangement it is meant to preserve.
   */
  pinned?: boolean
  /*
   * Stay where you are until this moment passes.
   *
   * `x`/`y` are where a drop belongs and `rx`/`ry` are where it is; `glide`
   * closes the gap every frame. A drop that is born somewhere other than where
   * it belongs — everything written in one capture is born at the point you
   * were writing — needs to wait its turn before it sets off, and the target
   * must stay authoritative the whole time so that a layout saved mid-flight
   * saves where things are going rather than where they set out from.
   */
  hold?: number
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
  // making the thing: a nib, and the line it has just drawn
  make: 'M20.1 4.2a2.1 2.1 0 0 0-3 0l-8.5 8.5-1.2 4.2 4.2-1.2 8.5-8.5a2.1 2.1 0 0 0 0-3ZM14.6 6.7l2.7 2.7M4 20.4h11',
  // reading a wall of references: an eye, because that is the whole act — the
  // app looking at the pictures you gathered and telling you what it sees
  look: 'M2.6 12s3.4-6 9.4-6 9.4 6 9.4 6-3.4 6-9.4 6-9.4-6-9.4-6ZM14.4 12a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Z',
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

/** How far from round the page's arriving edge is. Proportional, so the front
 *  is as amorphous when it is small as when it fills the screen. */
export const FRONT_WOBBLE = 0.055

/**
 * The edge of the page as it arrives.
 *
 * This was `circle()`, and at the size it grows to it was the loudest thing on
 * the screen: a hard, mathematically perfect arc sweeping across a world in
 * which nothing else — not a drop, not a tab, not an echo — is a true circle.
 * The rings leaving your thumb were amorphous and the front chasing them was a
 * compass circle, so the two read as coming from different apps.
 *
 * Same curve as those rings now, at page scale. `clip-path` interpolates
 * `path()` against `path()` point by point when the two have the same commands
 * in the same order, which they do here — `echoRing` always emits the same 26 —
 * so the blob grows rather than morphing or snapping.
 *
 * The wobble is proportional, so the edge is as far from round when it is small
 * as when it fills the screen, and the seed comes from where you pressed, so
 * the same place opens the same shape twice.
 */
export function frontPath(ox: number, oy: number, r: number): string {
  return `path('${echoRing(ox, oy, r, ((ox * 0.618033 + oy * 0.318309) % 1) * 9.7, FRONT_WOBBLE)}')`
}

/**
 * How far the front has to travel to have covered the page from where it
 * opened.
 *
 * Far enough to reach every corner — a fixed screen diagonal is only enough
 * when the origin is on screen, and a drop's position is in world space, so
 * after a pan it may be nowhere near it. Getting that wrong leaves the page
 * frozen as a giant arc across a corner.
 *
 * …and then far enough again that the *dents* clear the corners too. A wobbled
 * edge is pulled inward as much as it is pushed outward, and a front sized to
 * the corner alone would land with a bite of night sky still in one of them.
 * The margin on top of that is not decoration: the curve through the sampled
 * points can dip a little below the shallowest of them, so the arithmetic bound
 * by itself is not quite a guarantee.
 */
export function frontReach(ox: number, oy: number, w: number, h: number): number {
  const corner = Math.max(
    Math.hypot(ox, oy),
    Math.hypot(w - ox, oy),
    Math.hypot(ox, h - oy),
    Math.hypot(w - ox, h - oy),
  )
  return Math.ceil(corner / (1 - FRONT_WOBBLE) + 24)
}
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

/*
 * Whether the take-out drawer has breathed once this session — module-level,
 * because the sky remounts on every visit to the tab and a hint that replays
 * per visit is a tic, not a teaching.
 */
let taughtOut = false

function mountSky(root: HTMLDivElement) {
  const $ = <T extends HTMLElement>(k: string) => root.querySelector(`[data-sky="${k}"]`) as T
  const stage = $('stage')
  const field = $('field')
  const links = root.querySelector('[data-sky="links"]') as unknown as SVGGElement
  const voiceEl = $('voice')
  const voiceWho = $('voiceWho')
  const voiceLb = $('voiceLb')
  const voiceWork = $('voiceWork')
  const voiceBar = $('voiceBar')
  const voiceNeeds = $('voiceNeeds')
  const voiceNote = $('voiceNote')
  const meter = $('meter')
  const tide = $('tide')
  const updraft = $('updraft')
  const skyWord = $('skyword')
  const skyLb = skyWord.querySelector('.lb') as HTMLElement
  const goo = root.querySelector('[data-sky="goo"]') as unknown as SVGPathElement
  const oilG = root.querySelector('[data-sky="oil"]') as unknown as SVGGElement
  const echoG = root.querySelector('[data-sky="echo"]') as unknown as SVGGElement
  const seaWord = $('seaword')
  const restEl = $('rest')
  const tidyEl = $('tidy')
  const writeEl = $('write')
  const nextEl = $('next')
  const nextGo = $('nextGo')
  const nextPen = $('nextPen')
  const nextLb = $('nextLb')
  const nextWhy = $('nextWhy')
  nextEl.style.setProperty('--next-blob', wabiPill('sky-next', 15, 5))
  const undoEl = $('undo')
  const undoLb = $('undoLb')
  const undoGo = $('undoGo')
  const page = $('page')
  const pageQ = $('pageQ')
  const pageInto = $<HTMLButtonElement>('pageInto')
  const pageTone = $<HTMLButtonElement>('pageTone')
  const pageTones = $('pageTones')
  const pageShare = $<HTMLButtonElement>('pageShare')
  const pageT = $<HTMLTextAreaElement>('pageT')
  const pageA = $('pageA')
  const pageN = $('pageN')
  const pageD = $('pageD')
  const pageX = $('pageX')
  const pageMic = $('pageMic')
  const pagePic = $('pagePic')
  const pageAbsorb = $('pageAbsorb')
  const pageSend = $('pageSend')
  const pageLater = $('pageLater')
  const pageFile = root.querySelector('[data-sky="pageFile"]') as HTMLInputElement
  const lightbox = $('lightbox')
  const lightboxImg = root.querySelector('[data-sky="lightboxImg"]') as HTMLImageElement
  const lightboxX = $('lightboxX')

  /*
   * What the one field is asking for, right now.
   *
   * This page has a single textarea and it means something different in each
   * mode — a name, a storm, what you found out, a question. That was carried
   * by the placeholder alone, and a placeholder is not a label: it disappears
   * the moment you type, and a screen reader announces it only while the field
   * is empty. So the field was the one control on the page with no name at
   * all. Both come off the same string here so they cannot drift apart.
   */
  const asking = (s: string) => {
    pageT.placeholder = s
    pageT.setAttribute('aria-label', s || 'What you are writing')
  }

  /*
   * What you have written and not yet let go of.
   *
   * Everything typed into this page lived in the DOM and nowhere else until
   * you pressed Done. Switch apps, get a call, let the phone sleep long enough
   * that iOS discards the tab — or simply come back to a new deploy — and a
   * paragraph you had been working out was gone with no sign it had ever
   * existed. That is the worst thing a thinking app can do.
   *
   * Two answers, because they cover different failures. The draft is written
   * to localStorage as you type, so it survives the page dying; and a reload
   * the app *chooses* to do is asked to wait while there is unsaved text in
   * front of you, so it does not interrupt a sentence to install a new bundle.
   */
  const DRAFT_KEY = 'brainstorm-sky-draft-v1'
  let draftT: ReturnType<typeof setTimeout> | null = null
  function keepDraft() {
    const v = pageT.value
    try {
      if (pageFor?.mode === 'capture' && v.trim()) localStorage.setItem(DRAFT_KEY, v)
      else if (pageFor?.mode === 'capture') localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* private mode — the hold below is still doing its half of the job */
    }
  }
  function dropDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }
  function heldDraft(): string {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? ''
    } catch {
      return ''
    }
  }
  pageT.addEventListener('input', () => {
    if (draftT) clearTimeout(draftT)
    draftT = setTimeout(keepDraft, 400)
    // …and a name being typed over a group is not a draft of something new,
    // it is an edit of something that exists. It goes to the graph on the same
    // terms as the rows below it rather than to localStorage.
    if (nameFor) keepEdit(nameFor, pageT.value)
  })
  // A name is one line. Enter in the title field committed a newline into the
  // model — "SS27 — Linen & Letters\n" — where every other name field in the
  // world commits the name.
  pageT.addEventListener('keydown', (e) => {
    if (nameFor && e.key === 'Enter') {
      e.preventDefault()
      pageT.blur()
    }
  })
  // Anything still on a timer, written before the phone can take the app away.
  const stopWatching = watchForLeaving()
  // …and a chosen reload waits while anything is unsaved: the text in front of
  // you, and now also any edit still sitting on its own timer.
  const releaseHold = holdReload(
    () => (page.classList.contains('show') && pageT.value.trim().length > 0) || editsPending(),
  )

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  document.body.classList.add('sky-held')
  /*
   * The two edges, and what they mean.
   *
   * Up is finished. Down is let go.
   *
   * It used to be that down was finished and the top edge meant nothing at
   * all, which left the app with no gesture for *no* — the commonest verdict
   * anyone has about their own ideas, and the one that was only reachable
   * through a button behind a fold on a group page, three taps in, next to the
   * word "danger". So the app could see everything you finished and almost
   * nothing you dropped, and half of what it could have learned about you was
   * in the half it could not see.
   *
   * The cycle reads better this way round, too. Water that has done its work
   * evaporates and rises and comes back as weather — which is exactly what
   * `evaporate` already does off a completed thing, and exactly what finishing
   * something ought to feel like. What sinks and does not rise again is
   * sediment. Nothing is destroyed either way: `archived` is recoverable from
   * the aside page, and always was.
   */
  /** How far under the top of the glass the finishing edge starts. */
  const SKY_EDGE = 66
  /** How far down from it the updraft is felt, so it is not a hair trigger. */
  const SKY_REACH = 170
  const sat = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0
  /** Where a drop actually is on the glass, which is what crosses an edge. */
  const edgeAt = (id: string) => {
    const p = posOf(id)
    return { x: toScreenX(p.x), y: toScreenY(p.y) }
  }

  const seaLb = seaWord.querySelector('.lb') as HTMLElement
  /** whether the finger is past the point of no return, so it is felt once */
  let seaReady = false
  let skyReady = false

  let seaNear = 0
  function showTide(near: number, ready: boolean) {
    if (near === seaNear) return
    seaNear = near
    const line = waterlineY()
    // Above the water only.
    //
    // It used to run 140px past the waterline as well, and once the fill was
    // strong enough to see the part below the line stopped reading as water
    // reaching up and started reading as a grey slab laid over the bottom of
    // the screen. The sea below the line is already dark; it needs no help.
    tide.style.top = line - 190 + 'px'
    tide.style.height = 200 + 'px'
    // Cooler and heavier than the updraft, because this is no longer where
    // good things go. Not alarming — letting an idea go is ordinary and often
    // right — but plainly a different act from finishing one, and strong
    // enough to be seen: the old one was fifteen per cent grey on a navy sky,
    // which is to say invisible on the phone it was drawn for.
    tide.style.background =
      // The bright part sits *on* the line, not a hundred points above it. The
      // glow is what the eye reads as the edge, so putting it anywhere else
      // means the thing you are aiming at and the thing you can see are in two
      // different places.
      `linear-gradient(rgba(150, 162, 182, 0) 0%, rgba(150, 162, 182, ${(0.07 * near).toFixed(3)}) 55%,` +
      ` rgba(168, 180, 200, ${(0.16 * near).toFixed(3)}) 84%, rgba(196, 208, 226, ${(0.34 * near).toFixed(3)}) 100%)`
    tide.style.setProperty('--edge', (0.25 + 0.75 * near).toFixed(3))
    tide.classList.toggle('on', near > 0.02)
    tide.classList.toggle('ready', ready)
    // Well clear of the tab bar and of whatever the app is recommending, both
    // of which live down here — the word was being printed straight over the
    // top of them.
    seaWord.style.top = line - 104 + 'px'
    seaLb.textContent = ready ? 'let it go' : 'drag below the line to let go'
    seaWord.classList.toggle('on', near > 0.18)
    seaWord.classList.toggle('ready', ready)
    if (ready !== seaReady) {
      seaReady = ready
      if (ready) haptics.grab()
    }
  }
  function hideTide() {
    seaReady = false
    if (seaNear === 0 && !tide.classList.contains('on')) return
    seaNear = 0
    tide.classList.remove('on', 'ready')
    seaWord.classList.remove('on', 'ready')
  }

  /** How close a dragged drop is to the top of the sky, and whether it would go. */
  let skyNear = 0
  function showUpdraft(near: number, ready: boolean) {
    if (near === skyNear) return
    skyNear = near
    updraft.style.background =
      `linear-gradient(rgba(var(--accent-rgb), ${(0.4 * near).toFixed(3)}) 0%,` +
      ` rgba(var(--accent-rgb), ${(0.2 * near).toFixed(3)}) 52%, rgba(var(--accent-rgb), 0) 100%)`
    updraft.style.height = `${SKY_EDGE + sat()}px`
    updraft.style.setProperty('--edge', (0.25 + 0.75 * near).toFixed(3))
    updraft.classList.toggle('on', near > 0.02)
    updraft.classList.toggle('ready', ready)
    skyLb.textContent = ready ? 'finished' : 'drag above the line to finish'
    skyWord.classList.toggle('on', near > 0.18)
    skyWord.classList.toggle('ready', ready)
    if (ready !== skyReady) {
      skyReady = ready
      if (ready) haptics.grab()
    }
  }
  function hideUpdraft() {
    skyReady = false
    if (skyNear === 0 && !updraft.classList.contains('on')) return
    skyNear = 0
    updraft.classList.remove('on', 'ready')
    skyWord.classList.remove('on', 'ready')
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
  /**
   * The wall of neighbours this photograph already found, if it has been out.
   *
   * Kept on the thought rather than as a brief, because a brief is prose and
   * this is a set of pictures with the pages they came from. It is a minute of
   * searching either way, and a minute of work that only exists until you
   * close the page is a minute thrown away — which is the fault this app has
   * fixed twice already, for ⚡ and for the answer.
   */
  const likeOf = (t: Thought) =>
    ex(t).like as { reading: string; finds: Find[]; searches: string[]; at?: string } | undefined
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
    stir()
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
    // the re-centring target is read through the camera, so moving the camera
    // gives the layout a new question to answer
    stir()
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
    // the frame the constellation is centred in is a different frame now
    stir()
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
  const savedLayout: Record<string, { x: number; y: number; p?: 1 }> = S().layouts['sky'] ?? {}
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
        bx: 0,
        by: 0,
        // …and it survives a reload, because on an installed PWA a reload is
        // most days. An arrangement that only holds until the app is next
        // opened is not an arrangement.
        pinned: saved?.p === 1,
      }
      pos.set(id, p)
    }
    return p
  }
  let layoutT: ReturnType<typeof setTimeout> | null = null
  function persistLayout() {
    if (layoutT) clearTimeout(layoutT)
    layoutT = setTimeout(() => {
      const out: Record<string, { x: number; y: number; p?: 1 }> = {}
      for (const tl of view.tls) {
        const p = pos.get(tl.t.id)
        if (p) out[tl.t.id] = p.pinned ? { x: p.x / W, y: p.y / H, p: 1 } : { x: p.x / W, y: p.y / H }
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
  // ---------- radii ----------
  const looseCount = () => view.tls.filter((tl) => tl.kind === 'drop').length
  /**
   * How big a group is, read off how much is in it.
   *
   * The area scales with the count, not the radius — which is to say the
   * radius goes as the square root. A pool holding twice as much should look
   * twice as big, and "twice as big" for a disc is twice the area; doubling
   * the radius would make it four times the thing and one group would eat the
   * sky by six members.
   *
   * It used to be `min(126, 78 + 9n)`, which is a straight line into a wall:
   * the cap arrives at five and a half members, so a group of six, a group of
   * twelve and a group of forty were all drawn exactly the same size. Half the
   * information the sky is for — which of these is the big one — was thrown
   * away at the point it started to matter. The ceiling is still there, four
   * hundred per cent further out, where the camera can still frame the thing.
   *
   * Tuned to land on the old numbers at the small end: one member 86 against
   * 87, three 105 against 105. Nothing about a sky of small groups moves.
   */
  const POOL_R = (n: number) => Math.max(78, Math.min(190, 60 + 26 * Math.sqrt(n)))
  function radiusOf(tl: TL) {
    if (tl.kind === 'pool') return POOL_R(tl.members.length)
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
    /*
     * Not shown until it knows where it goes.
     *
     * `paintAll` makes a drop and gives it its size; the frame loop is what
     * gives it its position, and that is a frame later. For that one frame
     * every drop in the sky is drawn stacked on the field's own origin at full
     * size, and then they all snap outward at once. Measured on a cold load:
     * one frame with seven drops piled at the top left, then a 604px jump.
     * That was the jitter — not the settling animation after it, which is the
     * sky doing what it is supposed to.
     *
     * Cleared by the loop below, in the same pass that first writes a
     * transform, so nothing is ever visible in the wrong place.
     */
    el.style.visibility = 'hidden'
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
  function peekBox(picture = false) {
    const k = camTarget?.k ?? cam.k
    const per = 1 / Math.max(0.2, k)
    // A picture is not prose and the column width that suits a sentence is the
    // wrong measure for it: what you opened it for is to see it bigger. So it
    // takes most of the glass, and the padding comes right down — a photograph
    // wants an edge, not a mount.
    if (picture)
      return {
        w: Math.min(320, W - 56) * per,
        font: 13 * per,
        pad: 5 * per,
        // A ceiling for a tall portrait, in the card's own units rather than
        // in dvh. The card is inside the zoom, so a viewport-relative cap
        // tightens as you zoom out and a portrait would come up smaller than a
        // landscape of the same photograph.
        tall: Math.min(460, H - 210) * per,
      }
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
    /*
     * The ceiling moves with the notch.
     *
     * It was a flat 68, written when the sky was a web page. On an installed
     * PWA the top 59 pixels of the glass are the status bar — the clock, the
     * signal, the battery — so 68 left nine pixels of clearance and a
     * photograph opened near the top of a group came up *under the clock*,
     * with the top third of the picture off the screen and its caption jammed
     * against the edge.
     *
     * `SKY_EDGE` is the line the rest of the sky already treats as the top of
     * the world, and it is measured from below the safe area everywhere else
     * this file mentions it. Here it was not mentioned at all.
     */
    const ceil = sat() + SKY_EDGE + 12
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
  /*
   * Far enough out to mean it.
   *
   * The line was `radiusOf(g) + 70`, and `radiusOf` on a pool is the size of
   * the *collapsed* bubble — nothing to do with where its contents are sitting
   * once it is open. A six-member group has a body 124 across and lays its
   * members out on a ring at 187, so the line fell at 194 and every member in
   * the group was resting seven pixels inside it. Nudge one outward by eight
   * and it left the group. On a group big enough for a second ring, `orbitR`
   * passes the line altogether and the outer members were *always* over it:
   * pick one up, put it back down, and it was out.
   *
   * Measured from the ring they actually stand on, plus their own width, plus
   * a margin nobody crosses by accident. What it costs is that taking a thing
   * out is now a deliberate haul rather than a twitch, which is the right way
   * round for a gesture that rearranges your map.
   */
  function pastTheRing(id: string, poolId: string): boolean {
    const g = view.byId.get(poolId)
    if (!g) return false
    const gp = posOf(poolId)
    const p = posOf(id)
    const out = orbitR(g) + memberR(g.members.length) + 62
    return Math.hypot(gp.x - p.x, gp.y - p.y) > out
  }
  /**
   * The colour you gave it, if you gave it one.
   *
   * A data attribute rather than a class per colour, so the stylesheet has
   * one rule and the value is the paint. Removed rather than blanked when
   * there is none: an empty `--tint` would resolve to nothing halfway
   * through a gradient and paint the drop black.
   */
  /**
   * The colour a thing actually wears: its own, or the nearest one above it.
   *
   * Colouring a group had coloured the shell and nothing else, which is the
   * one thing a group's colour cannot mean — you mark a project so you can
   * find its work, and its work stayed grey. Inherited at paint time rather
   * than written down through the tree: a thing added tomorrow is the right
   * colour without being told, taking the colour off the group takes it off
   * everything under it, and a member you coloured deliberately keeps its own
   * — the nearest mark wins, which is the rule everybody already expects.
   */
  function effectiveTint(t: Thought): TintName | null {
    const own = tintOf(ex(t))
    if (own) return own
    // up through the groups it belongs to, however deep, guarding the cycle
    // `rebuild` is allowed to leave behind
    const seen = new Set<string>([t.id])
    let up = view.parentOf.get(t.id)
    while (up && !seen.has(up)) {
      seen.add(up)
      const g = S().thoughts.find((x) => x.id === up)
      const has = g && tintOf(ex(g))
      if (has) return has
      up = view.parentOf.get(up)
    }
    return null
  }
  function paintTint(t: Thought, el: HTMLElement) {
    const tint = effectiveTint(t)
    if (tint) {
      el.dataset.tint = tint
      el.style.setProperty('--tint', tintRGB(tint))
    } else {
      delete el.dataset.tint
      el.style.removeProperty('--tint')
    }
  }
  function paintDropEl(t: Thought, el: HTMLDivElement, r: number, asMember: boolean) {
    el.style.width = el.style.height = r * 2 + 'px'
    paintTint(t, el)
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
    /*
     * The date the words carried, worn where you can see it. "by Friday"
     * has parsed into a real due date since the first capture — and a
     * playtester could only prove that by searching for the thing in
     * Memory, because no surface he would actually look at ever said it.
     * The one operational fact a drop can have goes on its face.
     */
    const due = t.due_date
      ? `<div class="state ${t.due_date < todayISO() ? 'blue' : ''}">${humanDue(t.due_date, todayISO())}</div>`
      : ''
    const st = ex(t).answered_at
      ? `<div class="state blue">answered</div>`
      : brief
        ? `<div class="state blue">a brief${brief.sources.length ? ` · ${brief.sources.length} sources` : ''}</div>`
        : due ||
          (isRipe(t)
            ? `<div class="state blue">saturated</div>`
            : dots)
    const photo = imgOf(t) ? `<div class="photo"></div>` : ''
    // …and a mark, so a thing the agent has been out for looks different from
    // one it has not, at a glance, without reading anything. The state line
    // says it too on a drop this size — but not on a small one, and not on a
    // pool, where the count wins the line.
    const mark = brief || ex(t).answered_at ? `<div class="mark" aria-hidden="true"></div>` : ''
    el.innerHTML =
      (isRipe(t) ? `<div class="ring"></div>` : '') + photo + mark + `<div class="t"></div>${r < 50 ? '' : st}`
    const ph = el.querySelector('.photo') as HTMLDivElement | null
    if (ph && imgOf(t)) ph.style.backgroundImage = `url(${imgOf(t)})`
    const tx = el.querySelector('.t') as HTMLDivElement
    // type grows with the drop, so a big idea reads big and a small one stays quiet
    // The ceiling moves with the discs. Held at 17 while a pool could never be
    // wider than 126, a group of twenty now has room for a bigger disc and
    // would have gone on wearing the same small label in the middle of it.
    tx.style.fontSize = Math.round(Math.max(10.5, Math.min(19, 6 + r * 0.105)) * 10) / 10 + 'px'
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
        paintTint(tl.t, el)
        const open = openPool === tl.t.id
        const pb = briefOf(tl.t.id)
        // "has a path" and "the sky shifted" both described the template plan
        // in extra.plan, which no longer exists — what a cloud that has rained
        // has now is work inside it, and the count already says so.
        const todo = tl.members.filter((m) => m.type === 'action' && m.status !== 'done').length
        // Work first, then the brief, then the plain count. A cloud that has
        // rained has things to do in it, and that is the more useful of the
        // two facts — the brief is one moon away and never goes anywhere,
        // whereas "3 to do" is the whole visible answer to having just rained.
        const st = open
          ? ''
          : todo
            ? `${todo} to do · ${tl.members.length} inside`
            : pb
              ? `a brief · ${tl.members.length} inside`
              : `${tl.members.length} inside`
        const next = tl.members[0]
        const peek = !open && next ? `<div class="peek"></div>` : ''
        el.innerHTML =
          `<div class="t" style="font-weight:600"></div>` +
          (pb ? `<div class="mark" aria-hidden="true"></div>` : '') +
          peek +
          (st ? `<div class="state ${todo || pb ? 'blue' : ''}"></div>` : '')
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
          // A group inside a group is drawn here rather than by paintDropEl,
          // and it was the one shape the colour never reached: a campaign
          // turned iris with a grey "References" still sitting in its ring.
          paintTint(m, me)
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
            const box = peekBox(!!imgOf(m))
            me.classList.remove('pool', 'small')
            me.classList.add('member')
            me.classList.toggle('picture', !!imgOf(m))
            me.style.width = box.w + 'px'
            me.style.height = 'auto'
            // Generous all round, and generous above and below on purpose: air
            // there is what stops two lines of text coming out in a body four
            // times as wide as it is tall. The corners still take room off the
            // ends, so the sides keep a little more than the top and bottom.
            //
            // None at all for a picture. A rectangle inset inside a blown edge
            // leaves a crescent of glass at each corner and a strip along the
            // top, and what that reads as is not a mount — it is a gap. The
            // photograph takes the whole shape instead and the edge cuts it,
            // which is what the small drop in the ring has always done.
            me.style.padding = imgOf(m)
              ? '0px'
              : `${(box.pad * 1.5).toFixed(1)}px ${(box.pad * 1.62).toFixed(1)}px`
            // its corners are set from the box, not in pixels, so they eat
            // almost the whole of the sides: what opens is a blob that happens
            // to hold a sentence, not a rectangle with the edges taken off
            me.style.setProperty('--blob', wabiBlob(m.id))
            if (box.tall) me.style.setProperty('--picmax', box.tall.toFixed(0) + 'px')
            /*
             * A photograph opens into the photograph.
             *
             * This used to build a card holding one `<div class="t">` and
             * nothing else, which for a picture meant the picture *vanished*
             * at the moment you touched it: the bubble had been showing it,
             * and tapping to look closer replaced it with a wide pill saying
             * the word "Photo". The one thing on the drop worth enlarging was
             * the one thing thrown away to enlarge it.
             *
             * So it comes up as an `<img>` — laid out by the browser at the
             * picture's own proportions, which is why the card is not given a
             * height. A portrait opens tall and a landscape opens wide, and
             * the ring makes room for whichever it is, because
             * `memberRadiusOf` measures the element rather than assuming.
             *
             * The caption goes under it, and only if it says something. Every
             * picture arrives titled "Photo" until you rename it, and a
             * caption repeating the word "photo" beneath a photograph is a
             * line of type spent on nothing.
             */
            const pic = imgOf(m)
            const cap = label(m)
            const worthSaying = cap.trim() && cap.trim().toLowerCase() !== 'photo'
            me.innerHTML = pic
              ? `<img class="big" alt="" />` + (worthSaying ? `<div class="t"></div>` : '')
              : `<div class="t"></div>`
            if (pic) (me.querySelector('img.big') as HTMLImageElement).src = fullOf(m) ?? pic
            const tx = me.querySelector('.t') as HTMLDivElement | null
            if (tx) {
              tx.style.fontSize = box.font.toFixed(1) + 'px'
              tx.style.width = '100%'
              tx.textContent = cap
            }
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
    // Last, because it depends on which elements survived this pass. Every
    // paint rebuilds and re-mounts, so the glow has to be re-applied from
    // state each time rather than set once and hoped for.
    paintWorking()
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
    // The tidy pill stands beside it rather than across the screen from it,
    // and needs to know how much room the count is taking. Beside it whenever
    // the pill is THERE — this keyed on resting alone, so a corner showing
    // only "☁ 1 put away" had tidy printed straight across it.
    document.body.classList.toggle('sky-resting', resting + aside > 0)
    if (resting + aside > 0)
      document.documentElement.style.setProperty('--rest-w', `${Math.round(restEl.offsetWidth)}px`)
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
  const invitePos: Pos = { x: W / 2, y: H * 0.34, rx: W / 2, ry: H * 0.34, s: 1, vx: 0, vy: 0, mk: 0, mt: 0, mx: 1, my: 0, bx: 0, by: 0 }

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
    /*
     * While the agent is away, this pill *is* the progress report.
     *
     * Not a second surface. The app has one place where it speaks, at the foot
     * of the screen where your thumb already is, and a run that takes a minute
     * is the app speaking at length rather than the app needing somewhere else
     * to stand. So the same pill grows: the line it was already showing, a bar
     * under it, what the agent went out to check, and one note. It shrinks
     * back to a line the moment the work lands.
     */
    const face = work ? workFace(work) : null
    const msg = voiceT ?? (face ? face.line : held)
    const who = voiceT ? voiceWhoT : (work?.who ?? heldWho)
    voiceEl.classList.toggle('show', !!msg)
    // a transient `say` takes the pill back for its four seconds; the work
    // panel would otherwise sit under an unrelated sentence
    voiceEl.classList.toggle('busy', !!face && !voiceT)
    voiceEl.classList.toggle('over', !!face?.over)
    voiceWho.textContent = who ?? ''
    voiceWho.hidden = !who
    voiceLb.textContent = msg ?? ''
    voiceWork.hidden = !face || !!voiceT
    if (face && !voiceT) {
      voiceBar.style.setProperty('--p', face.fill.toFixed(3))
      // Rebuilt only when it changes. This paints on a one-second tick for as
      // long as a minute, and replacing four nodes sixty times for the same
      // four strings is work the phone does not need to do.
      const want = face.needs.join('\n')
      if (voiceNeeds.dataset.said !== want) {
        voiceNeeds.dataset.said = want
        voiceNeeds.innerHTML = face.needs.map(() => `<span></span>`).join('')
        ;[...voiceNeeds.children].forEach((el, i) => (el.textContent = face.needs[i]))
      }
      voiceNeeds.hidden = !face.needs.length
      voiceNote.textContent = face.note ?? ''
      voiceNote.hidden = !face.note
    }
    // the recommendation and the agent share one place; whoever is speaking wins
    paintNext()
  }
  /**
   * What the agent is doing, as state rather than as a sentence.
   *
   * `hold` could only ever be given a finished string, so everything the app
   * knew about a run — how long this size of job takes, what it went out to
   * check, whether you are free to walk away from it — had to be flattened
   * into one line or thrown away. Nearly all of it was thrown away.
   */
  let work: WorkState | null = null
  function setWork(w: WorkState | null) {
    work = w
    paintVoice()
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
   * A four-second message is right for "finished — it's gone up" and wrong for
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
   *
   * An empty `lb` is a bar with nothing but its verb on it, and it is the
   * right shape whenever the pill above is already saying what happened.
   *
   * That was most of them. Every landing said its outcome twice — once as
   * prose in the pill, and again as forty characters of the same thing in the
   * bar underneath, next to the button. Two dark panels stacked over the tab
   * bar, both about the same event, one of them a truncation of the other. The
   * division is: **the pill says what happened, the bar says what you can do
   * about it.** A bar that also narrates is a second voice arguing with the
   * first in a smaller font.
   */
  function offerAction(lb: string, go: string, fn: () => void, ms?: number) {
    undoLb.textContent = lb
    // hidden rather than empty, so the flex gap does not leave the verb
    // floating off-centre in a bar that is otherwise nothing
    undoLb.hidden = !lb
    undoGo.textContent = go
    undoFn = fn
    undoEl.classList.add('show')
    // so the app's own sentence can step up out from under it — see .sky-voice
    document.body.classList.add('sky-offering')
    if (undoT) clearTimeout(undoT)
    undoT = ms ? setTimeout(() => hideUndo(), ms) : null
  }
  function hideUndo() {
    undoEl.classList.remove('show')
    document.body.classList.remove('sky-offering')
    undoFn = null
  }
  undoGo.addEventListener('click', () => {
    if (!undoFn) return
    const f = undoFn
    hideUndo()
    hold(null)
    f()
  })

  /**
   * Up and out: it is finished.
   *
   * A thing that has done its work evaporates. It thins, it lifts, it is gone
   * from the sky — and what it becomes is the weather you think under, which
   * is the light `world/engine.ts` already draws from recently-finished work.
   * `evaporate` runs off exactly this moment when the thing that finished was
   * the last of a goal, so the seventh stage of the cycle now begins where the
   * gesture ends. Completing something should feel like release, and letting
   * go of the phone at the top of the screen is what release feels like.
   */
  function riseDrop(t: Thought) {
    const el = els.get(t.id)
    const p = posOf(t.id)
    // …and everything under it. "Finish this and the 5 inside?" was the
    // question; finishing the shell alone left five live actions belonging to
    // a thing that no longer existed, which the Current went on recommending.
    const under = household(t.id)
    const at = new Date().toISOString()
    S().updateThought(t.id, { status: 'done', completed_at: at })
    for (const id of under) S().updateThought(id, { status: 'done', completed_at: at })
    if (el) {
      els.delete(t.id)
      const r = el.clientWidth / 2 || 40
      // it stretches as it goes, the way a droplet does leaving a surface
      el.style.transition = 'transform 720ms cubic-bezier(0.3, 0, 0.4, 1), opacity 640ms ease-out 120ms'
      el.style.transform = `translate3d(${p.rx - r}px, ${toWorldY(-120) - r}px, 0) scale(0.62, 1.22)`
      el.style.opacity = '0'
      setTimeout(() => el.remove(), reduced ? 0 : 900)
    }
    if (!reduced) {
      // and it leaves vapour behind it
      const x = p.rx * cam.k + cam.x
      for (let k = 0; k < 3; k++) setTimeout(() => evaporateAt(x + (Math.random() - 0.5) * 60), k * 130)
    }
    haptics.arrive()
    say('finished — it’s gone up')
    offerAction(
      `“${trim(label(t), 26)}”${under.length ? ` and the ${under.length} inside` : ''} is finished`,
      'bring it back',
      () => {
        S().updateThought(t.id, { status: 'open', completed_at: null })
        for (const id of under) S().updateThought(id, { status: 'open', completed_at: null })
        say('back in the sky')
      },
      under.length ? 9000 : 6000,
    )
    finishedIt(t.id)
  }

  /**
   * Down and under: you are letting it go.
   *
   * Not deleted — `archived`, which the aside page has always been able to
   * bring back, and which the empty-group sweep has always used. What is new
   * is that it is a *gesture*, and therefore something you will actually do.
   * Saying no to your own ideas is the commonest verdict anybody has about
   * them and the app could barely see it happen: it lived on a button behind
   * a fold on a group page, three taps in, next to the word danger.
   *
   * Which means half of what this app could learn about you was in the half it
   * could not see. See `learnFromLettingGo`.
   */
  function sinkDrop(t: Thought) {
    const el = els.get(t.id)
    const p = posOf(t.id)
    // the shell and what it holds — the bar you answered said "and the N
    // inside", and until now only the shell went under
    const under = household(t.id)
    S().updateThought(t.id, { status: 'archived' })
    for (const id of under) S().updateThought(id, { status: 'archived' })
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
    say('let go — the deep keeps it')
    offerAction(
      `“${trim(label(t), 26)}”${under.length ? ` and the ${under.length} inside` : ''} let go`,
      'bring it back',
      () => {
        S().updateThought(t.id, { status: 'open' })
        for (const id of under) S().updateThought(id, { status: 'open' })
        say('back in the sky')
      },
      // a whole household is a bigger thing to have meant, and worth reading
      // the offer for — the same nine seconds resting gets
      under.length ? 9000 : 6000,
    )
    void learnFromLettingGo(t)
  }

  /**
   * The goal that just ran out of work, and the question that follows.
   *
   * The sky draws only what is open, so ticking the last action under a cloud
   * made its members vanish — correctly — and left the goal open with zero
   * members, which stops being a pool and is redrawn as an orphan drop. A thing
   * you had completed, sitting in the sky looking exactly like a thought nobody
   * had touched. Nothing marked it finished, nothing sank, and the app never
   * once said you had completed anything.
   *
   * It closes the goal only if you say so. That is a claim about your work.
   */
  function finishedIt(justDone: string) {
    const s = S()
    const goal = emptiedGroup(justDone, s.thoughts, s.relationships)
    if (!goal) return
    // after the undo bar for the tick itself has had its six seconds
    setTimeout(() => {
      if (dead) return
      const still = emptiedGroup(justDone, S().thoughts, S().relationships)
      if (!still) return
      offerAction(`nothing left in “${trim(label(goal), 24)}”`, 'finish it', () => {
        const done = closeGoal(goal.id)
        if (!done) return
        rebuild()
        paintAll()
        fitWhenSettled()
        haptics.sink()
        record(done.note, label(goal))
        say(done.note)
        void riseFrom(goal.id)
      })
    }, 6200)
  }

  /**
   * And what that finishing put in the air.
   *
   * Usually nothing, which is the point — see the action. It runs on the back
   * of closing a goal and nowhere else, it is one fast call, and what it
   * returns is a real thought in the sky rather than a line of prose.
   */
  async function riseFrom(goalId: string) {
    if (S().offline) return
    const res = await evaporateGoal(goalId)
    if (dead || res.kind === 'failed') return
    if (res.kind === 'settled') {
      if (res.note) say(res.note)
      return
    }
    // it comes up where the goal was, and drifts
    const from = posOf(goalId)
    const p = posOf(res.thought.id)
    p.x = p.rx = Math.max(60, Math.min(worldW() - 60, from.rx + (Math.random() - 0.5) * 120))
    p.y = p.ry = Math.max(140, from.ry - 120)
    rebuild()
    paintAll()
    // off the water, which is where the thing it came from just went
    evaporateAt(p.rx * cam.k + cam.x)
    haptics.arrive()
    record(`“${trim(label(res.thought), 30)}” rose`, label(res.thought))
    offerAction(res.note || trim(label(res.thought), 42), 'go to it', () => {
      focusOn(posOf(res.thought.id))
      const tl = view.byId.get(res.thought.id)
      if (tl) openPage('open', tl, W / 2, innerHeight / 2)
    })
  }
  function restDrop(t: Thought) {
    const until = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    /*
     * A group rests WITH what it holds. Snoozing only the goal left its
     * members parentless in the sky — "SS27 is resting" while all six of
     * its contents spilled loose across the glass, which reads as the group
     * dissolving, not sleeping. Everything open underneath goes to rest on
     * the same date and wakes together; the undo brings the whole household
     * back. Nine seconds, not six — a whole group going away is exactly the
     * act you finish reading about slowly. And the fresh name, not the one
     * some captured object remembers.
     */
    const fresh = S().thoughts.find((x) => x.id === t.id) ?? t
    const under = household(t.id)
    S().updateThought(t.id, { status: 'snoozed', snooze_until: until })
    for (const id of under) S().updateThought(id, { status: 'snoozed', snooze_until: until })
    clearAll()
    say('rising into the high clouds — back tomorrow')
    offerAction(
      `“${trim(label(fresh), 26)}”${under.length ? ` and the ${under.length} inside` : ''} — resting`,
      'bring it back',
      () => {
        S().updateThought(t.id, { status: 'open', snooze_until: null })
        for (const id of under) S().updateThought(id, { status: 'open', snooze_until: null })
      },
      9000,
    )
  }
  let tidying = false
  tidyEl.addEventListener('click', async () => {
    if (tidying) return
    tidying = true
    tidyEl.textContent = 'tidying…'
    /*
     * The one ✦ that could die without a word. tidySky rejecting — a dropped
     * connection, an expired session — skipped everything after the await:
     * no message, and `tidying` stuck true, so every later tap returned at
     * the door. A playtester pressed the one button that promises what she
     * came for, twice, and the app said nothing either time.
     */
    let res: Awaited<ReturnType<typeof tidySky>>
    try {
      res = await tidySky((goalId, i, total) => {
        const p = posOf(goalId)
        const ang = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
        p.x = p.rx = worldW() / 2 + Math.cos(ang) * 220
        p.y = p.ry = worldH() / 2 + Math.sin(ang) * 180
      })
    } catch {
      res = { kind: 'failed' } as Awaited<ReturnType<typeof tidySky>>
    } finally {
      tidying = false
      tidyEl.textContent = '✦ tidy'
    }
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
  // the pen does what holding empty sky does, with the same standing rule:
  // writing while a group is open writes into it — and the page now says so.
  // One handler, two homes: the bare pill for a quiet sky, and the pen on
  // the end of the recommendation bar when there is one.
  const startWriting = (e: Event) => {
    e.stopPropagation()
    if (pageFor) return
    const into = openPool
    if (into) closeMoons()
    else clearAll()
    openPage('capture', undefined, innerWidth / 2, innerHeight * 0.42, into)
  }
  writeEl.addEventListener('click', startWriting)
  nextPen.addEventListener('click', startWriting)
  // Sky, tapped while already in the sky: step out of whatever is focused
  // and frame all of it — the "take me back" every platform tab bar means.
  const tabAgain = (e: Event) => {
    if ((e as CustomEvent).detail !== '/' || pageFor) return
    clearAll()
    fitAll()
  }
  addEventListener('tab-again', tabAgain)
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
  /**
   * Everything living under a thing, however deep.
   *
   * A group is a shell over its contents, and every gesture that moves the
   * shell means the contents too: the confirmation for the two edges has
   * always read "…and the 5 inside", and the code archived exactly one row.
   * So you dropped a group into the sea, watched it go, and its five members
   * were still up there — orphaned, loose, and looking like things you had
   * written on purpose.
   *
   * `open` is what the gesture is about; `snoozed` is included when waking,
   * because a household that went to rest together comes back together.
   */
  function household(id: string, of: Thought['status'] = 'open'): string[] {
    const out: string[] = []
    const walk = (parent: string) => {
      for (const r of S().relationships) {
        if (r.type !== 'part_of' || r.to_id !== parent) continue
        const kid = S().thoughts.find((x) => x.id === r.from_id)
        // a cycle would be a sky that cannot be drawn; `rebuild` breaks them,
        // and this must not hang if one ever slips through
        if (!kid || kid.status !== of || out.includes(kid.id)) continue
        out.push(kid.id)
        walk(kid.id)
      }
    }
    walk(id)
    return out
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
    // Dragging a group onto something it already contains. There is no reading
    // of that which is not a loop, and a loop in `part_of` is a sky that
    // cannot be drawn — `rebuild` breaks them, but by then an edge you did not
    // ask for has been written and synced.
    if (wouldCircle(b.t.id, a.t.id, S().relationships)) {
      say(`“${trim(label(a.t), 22)}” is already inside that one`)
      return
    }
    const pa = posOf(a.t.id)
    const pb = posOf(b.t.id)
    /*
     * Remembered before anything moves, because pooling is the one drag
     * outcome a thumb produces by accident. Finishing, letting go, resting —
     * every other consequence of a drag has offered its way back, and this
     * one did not: a pan that grazed a group filed your errand inside
     * somebody's campaign, the pill announced it, and the bar underneath
     * either wasn't there or belonged to something else. A playtester spent
     * five minutes trying to reverse by other means what one tap should have.
     */
    const wasA = partOfRel(a.t.id)?.to_id ?? null
    const wasB = partOfRel(b.t.id)?.to_id ?? null
    const stood = { ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y }
    const backHome = (id: string, to: string | null, x: number, y: number) => {
      const now = partOfRel(id)
      if (now) S().deleteRelationship(now.id)
      if (to) S().addRelationship(id, to, 'part_of')
      const p = posOf(id)
      p.x = p.rx = x
      p.y = p.ry = y
    }
    coalesce(
      [
        { x: pa.x, y: pa.y, r: radiusOf(a) },
        { x: pb.x, y: pb.y, r: radiusOf(b) },
      ],
      at,
    )
    if (a.kind === 'pool' && b.kind === 'pool') {
      /*
       * A group dropped on a group goes *inside* it, still a group.
       *
       * It used to be torn open: every member re-homed into the target and the
       * group itself deleted. So the one gesture for "these belong together"
       * was also the only gesture in the app that destroyed something — the
       * name you had given it, the shape you had put it in, the fact that
       * those five things were one thing. You did not ask for any of that to
       * go, and there was no undo on it.
       *
       * Everything needed to hold it was already here: `rebuild` reads
       * `part_of` one level at a time, an open pool draws a member that has
       * members as its own bubble with "N inside" on it, and tapping that
       * opens it. Nesting was built, drawn and reachable — and this one line
       * was flattening it on the way in.
       */
      rehome(b.t.id, a.t.id)
      say(`“${trim(label(b.t), 20)}” is inside “${trim(label(a.t), 20)}”`)
      record(`“${trim(label(b.t), 26)}” inside “${trim(label(a.t), 26)}”`)
      offerUndo('', () => {
        backHome(b.t.id, wasB, stood.bx, stood.by)
        say('back out on its own')
      })
    } else if (a.kind === 'pool' || b.kind === 'pool') {
      const pool = a.kind === 'pool' ? a : b
      const drop = a.kind === 'pool' ? b : a
      const wasDrop = drop === a ? wasA : wasB
      const stoodAt = drop === a ? { x: stood.ax, y: stood.ay } : { x: stood.bx, y: stood.by }
      rehome(drop.t.id, pool.t.id)
      say(`inside “${label(pool.t)}”`)
      offerUndo('', () => {
        backHome(drop.t.id, wasDrop, stoodAt.x, stoodAt.y)
        say('back out on its own')
      })
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
      // …and only over the guess. Type a name of your own in the meantime and
      // that is the name, whatever comes back.
      nameThePool(g.id, texts, name, (better) => {
        // the pool may have been unmade while the name was in flight
        if (!S().thoughts.some((x) => x.id === g.id)) return
        rebuild()
        paintAll()
        say(`called it “${better}”`)
      })
      say(parent ? `a group inside — “${name}”` : `pooled — “${name}”`)
      record(parent ? `a group inside — “${name}”` : `pooled — “${name}”`)
      offerUndo('', () => {
        // the group existed only to hold these two; unmaking it takes its
        // edges with it — see deleteThought — and each goes back where it stood
        S().deleteThought(g.id)
        backHome(a.t.id, wasA, stood.ax, stood.ay)
        backHome(b.t.id, wasB, stood.bx, stood.by)
        say('apart again')
      })
    }
    splash(at.x)
    haptics.join()
  }
  /**
   * Dragged out past the edge of the ring.
   *
   * One level up, not all the way out — see takeOut, which is the same act on
   * the group page and now the same rule. Pulling a photograph out of the
   * references inside a collection used to leave it loose in open sky, and
   * putting it back where it obviously belonged was a second drag every time.
   *
   * The drag is its own undo, so this does not offer one; it only says where
   * the thing went, because "released from the pool" did not say and the
   * answer was not always the sky.
   */
  function releaseMember(t: Thought, poolId: string) {
    const done = takeOut(t.id)
    say(done ? done.note : 'released from the pool')
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
      // named as an outcome of the gesture, not a riddle — "nothing
      // like-minded nearby yet" with no subject left a playtester unsure
      // what she had even done
      say('held to gather — nothing like-minded near it yet')
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
    // …and it gets out of the way of a drag. It lives at the foot of the sky,
    // which is exactly where the "let it go" pill has to be, so the two were
    // printed on top of each other every time you carried something down.
    const hide =
      !!openPool || !!pageFor || !!moonsFor || voiceEl.classList.contains('show') || !!drag?.moved
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
  nextGo.addEventListener('click', () => {
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
  type PageMode = 'capture' | 'say' | 'ask' | 'brief' | 'open' | 'aside' | 'like'
  /** The brief ⚡ brought back for this thought, if it went out for one. */
  const briefOf = (id: string) => S().artifacts.find((a) => a.thought_id === id) ?? null
  /**
   * A brief as something you could paste into a message.
   *
   * The stored markdown plus its sources, which live in a column of their own
   * because the page renders them as real links — so the copy that leaves the
   * app has to put them back or it arrives as an argument with no evidence.
   *
   * Written plainly rather than as markdown. It used to add `# ` to the title
   * and `- [name](url)` to every source, on the reasoning that the recipient
   * might be somewhere that renders it. Some are. The share sheet does not say
   * which, and the one it usually is renders none of it — so what arrived was
   * a hash, a title, and five bracketed URLs. `sendWork` levels the body the
   * same way; this stops adding markup of its own for it to strip back off.
   */
  function sendable(art: { title: string; content_md: string; sources: { title: string; url: string }[] }): string {
    const body = art.content_md.trim()
    const title = art.title.trim()
    // the title, unless the body already opens with it under any dressing
    const opens = body.replace(/^#{1,6}\s+/, '').startsWith(title)
    const head = !title || opens ? '' : `${title}\n\n`
    const cited = /^#{0,6}\s*sources:?\s*$/im.test(body)
    const tail =
      !cited && art.sources.length
        ? '\n\nSources:\n' +
          art.sources
            .filter((x) => isWebUrl(x.url))
            .map((x) => {
              const name = x.title.trim()
              return name && name !== x.url ? `· ${name} — ${x.url}` : `· ${x.url}`
            })
            .join('\n')
        : ''
    return head + body + tail + '\n'
  }
  /** `into` is the group a capture belongs to — see the long press. */
  let pageFor: {
    mode: PageMode
    tl?: TL
    ox: number
    oy: number
    into?: string | null
    /** the person tapped the destination chip: land loose, not in the group */
    intoOff?: boolean
  } | null = null
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
  /**
   * A question the agent put back, waiting for the ask page to show it.
   *
   * Set immediately before the ask page is reopened, and read once by it. A
   * variable rather than another argument to `openPage`, which already carries
   * five and would make every other caller pass an empty one.
   */
  let pendingClarify: { ask: string; because: string; options: string[] } | null = null
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
    // Published as a distance from the bottom of the *screen*, not of the
    // layout viewport, because that is where the page's bottom edge now is:
    // it runs --bleed past the glass so it covers the whole screen. Measured
    // against the viewport, everything padded by --kb would sit exactly one
    // bleed too low and go back under the keyboard it exists to clear.
    const bleed = covered
      ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bleed')) || 0
      : 0
    document.documentElement.style.setProperty('--kb', `${Math.round(covered + bleed)}px`)
  }
  vv?.addEventListener('resize', measureKeyboard)
  vv?.addEventListener('scroll', measureKeyboard)
  measureKeyboard()

  /*
   * Where this writing will land, said while you can still change it.
   *
   * "Where you were standing is where it goes" is the right rule and it was
   * an invisible one: two playtesters wrote a week of thoughts while a seeded
   * group happened to be open and only found out at the toast. The chip says
   * the destination up front, and one tap swaps it for loose sky — the offer
   * after the fact stays, but the honest moment is before.
   */
  function paintInto() {
    const home =
      pageFor?.mode === 'capture' && pageFor.into
        ? S().thoughts.find((t) => t.id === pageFor!.into)
        : null
    pageInto.hidden = !home
    if (!home) return
    pageInto.textContent = pageFor!.intoOff
      ? '→ loose in the sky'
      : `→ into “${trim(label(home), 24)}”`
  }
  /*
   * The chip must never take the keyboard.
   *
   * A button takes focus on pointerdown, which on a phone dismisses the
   * keyboard mid-thought — and everything typed after that went nowhere,
   * ending in a Done on an empty page that closed without a word. A tester
   * lost a sentence to it, twice, with instrumentation running. Preventing
   * the default on pointerdown keeps focus where the writing is; the click
   * still arrives and still flips the destination.
   */
  /*
   * The colour, as one circle that unrolls.
   *
   * Six swatches in a permanent row cost a line of the page for a decision
   * you make about a thing once, and on a list of seven that line had already
   * scrolled off the top by the time you were looking at anything. So it is
   * the mark itself — the colour the thing is wearing — and the rest of the
   * palette drops out of it downward when you ask.
   *
   * Built once here rather than per open: the swatches never change, and the
   * page above the list is not re-rendered, so rebuilding them on every open
   * would only mean re-wiring six handlers for no reason.
   */
  let toneFor: TL | null = null
  pageTones.innerHTML = TINT_NAMES.map(
    (n, i) =>
      // counted from the right, because that is the end it grows out of
      `<button class="tint" data-tint="${n}" style="--tint:${tintRGB(n)};--i:${TINT_NAMES.length - 1 - i}" ` +
      `aria-label="Make it ${n}"></button>`,
  ).join('')
  function paintTone() {
    const t = toneFor?.t
    const worn = t ? tintOf(ex(t)) : null
    // the dot wears what the thing wears — including a colour it is only
    // inheriting, because that is what you see out in the sky
    const shown = t ? effectiveTint(t) : null
    pageTone.style.setProperty('--tint', shown ? tintRGB(shown) : '156, 166, 180')
    pageTone.classList.toggle('none', !shown)
    for (const b of [...pageTones.querySelectorAll('.tint')] as HTMLButtonElement[]) {
      b.classList.toggle('on', b.dataset.tint === worn)
      b.setAttribute('aria-label', b.dataset.tint === worn ? `Take the ${b.dataset.tint} off` : `Make it ${b.dataset.tint}`)
    }
  }
  const topBar = page.querySelector('.top') as HTMLDivElement
  function shutTones() {
    topBar.classList.remove('picking')
    pageTone.setAttribute('aria-expanded', 'false')
  }
  pageTone.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = !topBar.classList.contains('picking')
    topBar.classList.toggle('picking', open)
    pageTone.setAttribute('aria-expanded', String(open))
  })
  // …and anywhere else on the page puts it away, the way every open thing in
  // this app closes: by you looking at something else.
  page.addEventListener('pointerdown', (e) => {
    if (!topBar.classList.contains('picking')) return
    const on = e.target as HTMLElement
    if (on.closest('.tones') || on.closest('.tone')) return
    shutTones()
  })
  for (const b of [...pageTones.querySelectorAll('.tint')] as HTMLButtonElement[]) {
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      const tl = toneFor
      if (!tl) return
      const want = b.dataset.tint as TintName
      // the one it is already wearing takes it off, so the palette needs no
      // seventh swatch for "none"
      patchExtra(tl.t, { tint: tintOf(ex(tl.t)) === want ? null : want })
      rebuild()
      paintAll()
      paintTone()
      shutTones()
      redrawGroupPage()
    })
  }
  /**
   * Hand this thing to somebody.
   *
   * Works out what is inside for itself rather than being handed it, because
   * it is wired once at the top of the page and the list below is rebuilt on
   * every open.
   */
  function shareThing(tl: TL) {
    const live = view.byId.get(tl.t.id) ?? tl
    /*
     * What is left first, and what is finished after it — in the words and in
     * the picture alike, so the two cannot disagree. The card had this right
     * on its own (it draws a finished row struck through and its dot filled)
     * and at the size a message thumbnail gives it, a strike is two pixels.
     * Order carries it where styling cannot.
     */
    const inside = branchesOf(live.t.id, true)
      .map((b) => b.t)
      .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
    const art = briefOf(live.t.id)
    const text = shareText({
      title: label(live.t),
      body: live.t.raw_content,
      // A picture cannot travel in plain text, and the word "Photo" — which
      // is what one is called until you name it — tells the person reading
      // nothing at all. Said as what it is instead.
      inside: inside.map((m) => ({
        title: imgOf(m) && label(m) === 'Photo' ? '(a photograph)' : label(m),
        done: m.status === 'done',
      })),
      answers: answersOf(live.t),
      brief: art?.content_md ?? null,
      sources: art?.sources ?? [],
    })
    /*
     * …and the picture, which is the part that reads. A group is a shape — a
     * thing with other things around it — and a bulleted list of its members
     * says none of that. The card draws both of the ways this app shows you a
     * group, so there is no chooser and no wrong answer.
     */
    void drawCard({
      title: label(live.t),
      tint: effectiveTint(live.t),
      inside: inside.map((m) => ({
        title: imgOf(m) && label(m) === 'Photo' ? 'a photograph' : label(m),
        inside: view.kidsOf.get(m.id)?.length ?? 0,
        tint: effectiveTint(m),
        done: m.status === 'done',
      })),
    })
      .then((png) =>
        handOver(
          text,
          shareTitle(label(live.t)),
          png ? new File([png], `${shareTitle(label(live.t)) || 'thought'}.png`, { type: 'image/png' }) : null,
        ),
      )
      .then((how) => {
        if (how === 'shared') say('sent')
        else if (how === 'copied') say('copied — paste it wherever you like')
        else if (how === 'failed') say('could not hand that over just now')
      })
  }
  pageShare.addEventListener('click', (e) => {
    e.stopPropagation()
    if (toneFor) shareThing(toneFor)
  })
  pageInto.addEventListener('pointerdown', (e) => e.preventDefault())
  pageInto.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!pageFor?.into) return
    pageFor.intoOff = !pageFor.intoOff
    paintInto()
    pageT.focus()
  })

  function openPage(mode: PageMode, tl: TL | undefined, ox: number, oy: number, into?: string | null) {
    /*
     * The page is of the thing as it is NOW. Row handlers close over the TL
     * they were wired with, and re-opening the page after a take-out handed
     * that stale object back in — so the name field refilled with the title
     * from before your rename, and the close committed the old name over
     * the new one, announcing the revert as if you had asked for it. A
     * playtester renamed her campaign twice before it stuck.
     */
    if (tl) tl = view.byId.get(tl.t.id) ?? tl
    // The group page re-renders itself in place whenever its list changes, and
    // a half-typed name in the box above that list must survive the row you
    // just took out. Anything the outgoing render still owed goes in first —
    // safely, because every one of these is a no-op when nothing changed.
    const owed = pending
    pending = []
    for (const write of owed) write()
    // Whatever you write while a group is open belongs to that group. The
    // long press is the same gesture wherever you do it, and doing it inside a
    // group and getting a loose drop somewhere else in the sky is the app
    // ignoring where you were standing.
    // Whatever the last close still had coming, it is not coming for this one.
    if (closeT) clearTimeout(closeT)
    closeT = null
    pageFor = { mode, tl, ox, oy, into: mode === 'capture' ? (into ?? openPool) : null }
    paintInto()
    nameFor = null
    pageA.style.display = 'none'
    pageA.innerHTML = ''
    const reading = mode === 'brief' || mode === 'aside' || mode === 'like'
    pageT.style.display = reading ? 'none' : ''
    page.classList.toggle('path', reading)
    page.classList.toggle('brief', mode === 'brief')
    page.classList.toggle('group', mode === 'open' || mode === 'aside')
    // A group's field holds a name and a drop's holds the thought itself, so
    // the two want very different amounts of room. Capping both at a name's
    // worth is what made the drop's own page a separate mode for so long.
    page.classList.toggle('solo', mode === 'open' && tl?.kind !== 'pool')
    // …and the ask page, when it is the agent's turn. Set in the branch below,
    // cleared here so it cannot survive into a page that is not one.
    page.classList.remove('asked')
    pageD.textContent =
      mode === 'like'
        ? 'Done looking'
        : mode === 'brief'
        ? 'Done reading'
        : mode === 'aside'
          ? 'Done'
          : mode === 'say'
            ? 'Keep it'
            : mode === 'ask'
              ? 'Ask'
              : 'Done'
    if (mode === 'like' && tl) {
      /*
       * The wall.
       *
       * What "find me more inspiration like this" has always meant, and what
       * the app kept answering with an essay. Every card is a real work with
       * the page that shows it, and the picture on it is the picture that page
       * declares as its own — so this is the things themselves, not a list of
       * links to them.
       *
       * A card whose page had no Open Graph image on it still appears, as
       * words. Sorting the pictures to the front is enough; dropping the rest
       * would quietly lose real works for a reason that is about markup.
       */
      // Read from the store, not from the TL that was handed in. `runFindLike`
      // writes the wall and then opens this page, and the TL it is holding was
      // captured before the write — so the page it opened was empty, every
      // time, on the one path that matters. A page whose content lives on a
      // thought looks that thought up.
      const live = S().thoughts.find((x) => x.id === tl.t.id) ?? tl.t
      const like = likeOf(live)
      pageQ.textContent = like?.reading || 'More like this'
      pageN.textContent = like?.at ? `found ${humanDate(like.at.slice(0, 10), todayISO())}` : ''
      pageA.style.display = 'block'
      const finds = like?.finds ?? []
      const searches = like?.searches ?? []
      pageA.innerHTML =
        (finds.length ? `<div class="lab">what it found</div><div class="wall"><div class="col"></div><div class="col"></div></div>` : '') +
        (searches.length
          ? `<div class="lab">and worth searching yourself</div>` +
            searches.map(() => `<button class="ctl pick" type="button"></button>`).join('')
          : '')
      const cols = [...pageA.querySelectorAll('.wall .col')] as HTMLDivElement[]
      if (cols.length === 2) {
        finds.forEach((f, i) => {
          /*
           * The picture is the card.
           *
           * The first version put a picture, a title, a line of who and where,
           * a line of why, and two pill buttons on every card — which on a
           * phone is two photographs and then a page of prose, and it read as
           * a bibliography with pictures in it. What this is for is looking at
           * things.
           *
           * So: the image is the whole card and tapping it opens the work.
           * Underneath, two lines at most — what it is, and who made it. Keep
           * is a small mark in the corner of the picture rather than a pill
           * with a word in it, because on a wall of twenty the words are the
           * noise. Why it belongs beside yours is still worth having and is
           * still one tap away: it is what the caption becomes when you touch
           * it.
           */
          const card = document.createElement('div')
          card.className = 'find' + (f.image ? '' : ' bare')
          card.innerHTML =
            (f.image
              ? `<button class="shot" type="button"><img alt="" loading="lazy" />` +
                `<span class="save" role="button" tabindex="0" aria-label="Keep this on the map">+</span></button>`
              : '') +
            `<button class="cap" type="button"><span class="h"></span><span class="d"></span></button>` +
            `<div class="w" hidden></div>`
          // textContent for every one of these: they are a model's words about
          // pages it read on the open web, and this is a page on our origin
          ;(card.querySelector('.h') as HTMLElement).textContent = f.title
          ;(card.querySelector('.d') as HTMLElement).textContent = [f.who, f.where].filter(Boolean).join(' · ')
          const why = card.querySelector('.w') as HTMLElement
          why.textContent = f.why
          const im = card.querySelector('img') as HTMLImageElement | null
          if (im && f.image) {
            im.src = f.image
            // A hole in a wall of pictures reads as the app being broken. A
            // page that has moved its image since we read it simply becomes
            // one of the word-only cards, which say more to make up for it.
            im.onerror = () => card.classList.add('bare', 'lost')
          }
          const go = () => window.open(f.url, '_blank', 'noopener,noreferrer')
          card.querySelector('.shot')?.addEventListener('click', (e) => {
            e.stopPropagation()
            go()
          })
          card.querySelector('.cap')?.addEventListener('click', (e) => {
            e.stopPropagation()
            // On a card with a picture the caption is the way in to why it is
            // here; on one without, the words are already all there is, so it
            // opens the page like everything else.
            why.hidden = !why.hidden
            card.classList.toggle('open', !why.hidden)
          })
          const save = card.querySelector('.save') as HTMLElement | null
          save?.addEventListener('click', (e) => {
            e.stopPropagation()
            void keepFind(tl, f, save)
          })
          // Dealt left, right, left. Which column a picture lands in is not
          // information, and any cleverer rule needs the image's proportions —
          // which nobody has until it has loaded, by which time moving it is a
          // wall that rearranges itself while you are looking at it.
          cols[i % 2].appendChild(card)
        })
      }
      pageA.querySelectorAll('.pick').forEach((b, i) => {
        b.textContent = searches[i]
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          window.open(imageSearchUrl(searches[i]), '_blank', 'noopener,noreferrer')
        })
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
      /*
       * …and what to do about it.
       *
       * ⚡ goes away for the best part of a minute, comes back with a good
       * reading and a set of real steps — and the brief was where the trail
       * went cold. It said what to do and gave you no way to do any of it:
       * close the page, find the drop it belongs to in a sky that has moved,
       * open its moons, and only then does the agent offer to help. Four moves
       * between a recommendation and acting on it, and the agent had just
       * spent a minute earning the right to be believed.
       *
       * Each row carries the one act the app would take on that step, decided
       * by the same `getOnWithIt` the moons use — `answer it` on a question,
       * `do it` on something makeable, `work it` on anything that has to be
       * worked out first. It is the funnel, one tap from where you read it.
       */
      const next = S()
        .relationships.filter((r) => r.type === 'part_of' && r.to_id === tl.t.id)
        .map((r) => view.byId.get(r.from_id))
        .filter((n): n is TL => !!n && n.t.status === 'open')
        // Not the pictures. A reference wall's brief listed its own four
        // photographs with "work it" beside each one, which is the app
        // offering to go away and research a photograph. What follows from a
        // wall is what rain makes of it, and those arrive here as real steps.
        .filter((n) => !faceOf(n.t))
        .slice(0, 8)
      const rows = next.map((n) => ({ tl: n, act: getOnWithIt(n) }))
      const todo = rows.length
        ? `<div class="lab">what to do about it</div>` +
          rows
            .map(
              (_r, i) =>
                `<div class="todo" data-i="${i}"><div class="v"></div>` +
                `<button class="ctl go" data-i="${i}"></button></div>`,
            )
            .join('')
        : ''
      pageA.innerHTML = briefHtml(art?.content_md ?? '', art?.sources ?? [], todo)
      // textContent, always: these are the user's own words and the model's,
      // and neither belongs in innerHTML
      ;[...pageA.querySelectorAll('.todo')].forEach((row, i) => {
        const r = rows[i]
        ;(row.querySelector('.v') as HTMLElement).textContent = label(r.tl.t)
        const go = row.querySelector('.go') as HTMLButtonElement
        go.textContent = r.act.lb
        go.disabled = r.act.dim
        go.addEventListener('click', (e) => {
          e.stopPropagation()
          // the brief is a reading surface; acting on it means leaving it, and
          // the act itself says what it is doing from the sky
          closePage(false)
          focusOn(posOf(r.tl.t.id))
          setTimeout(() => getOnWithIt(r.tl).run(), reduced ? 0 : 160)
        })
      })
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
      asking('Name it')
      nameFor = tl.t.id
      pending.push(() => landUndo(rename(tl.t.id, pageT.value)))
      // Keeping what was just ticked, so the row strikes through under your
      // finger instead of vanishing out from under it — and settling to the
      // bottom, because four finished things stranded among nine unfinished
      // ones is a list you have to read twice to find your place in.
      // Everything under it, not only what it directly holds — because a row
      // you have just nested has to still be on the page. See branchesOf.
      const branches = branchesOf(tl.t.id, true)
      const inside = branches.map((b) => b.t)
      // …but the tally counts what the group itself holds, so the words under
      // the name agree with the number on the bubble out in the sky
      const held = () => membersOf(tl.t.id, true).length
      const done = () => inside.filter((m) => S().thoughts.find((t) => t.id === m.id)?.status === 'done').length
      const tally = () => {
        const d = done()
        const n = held()
        pageN.textContent = !n ? 'nothing inside it yet' : d ? `${n} inside · ${d} done` : `${n} inside`
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
      /*
       * What the app decided this is, and one tap to disagree.
       *
       * The type is the single most consequential fact about a thought and it
       * was invisible: the Current and the sky's own suggestion only ever
       * consider `action` and `task`, so a thing classified `note` is exiled
       * from everything that answers "what do I do next" — silently, for
       * ever. A playtester captured six dated tasks, watched every one get
       * called a note, and never saw his own work recommended once. He could
       * not have known why, because nothing anywhere said so.
       *
       * So the drop's own page says which it is, in the consequence rather
       * than the vocabulary — "in the current" is a thing you can check, and
       * "note" is a word only this app uses.
       */
      const isDoing = tl.t.type === 'action' || tl.t.type === 'task'
      const kindLine =
        tl.kind === 'drop'
          ? `<button class="kindline" aria-label="${isDoing ? 'Make it a note' : 'Make it something to do'}">` +
            `<span>${isDoing ? 'something to do · it flows in the Current' : 'a note · it stays out of the Current'}</span>` +
            `<b>${isDoing ? 'make it a note' : 'make it a to-do'}</b>` +
            `</button>`
          : ''
      pageA.style.display = 'block'
      pageA.innerHTML =
        (shot ? `<button class="shot" aria-label="See the photo full screen"><img alt="" /></button>` : '') +
        kindLine +
        (inside.length
          ? `<div class="lab head"><span>what is inside</span>` +
            `<button class="ctl sel">Select</button></div>` +
            branches
              .map(
                (b, i) =>
                  // how far in it sits, as data for the drag and as a variable
                  // for the indent — one number, so the two can never disagree
                  `<div class="row" data-i="${i}" data-id="${b.t.id}" data-depth="${b.depth}" style="--d:${b.depth}">` +
                  // Everything you read is on a layer that slides. Taking a
                  // thing out of a group is the rarest act on this page and it
                  // used to be the loudest: an uppercase pill on every row,
                  // nine of them down the right-hand side, shouting over the
                  // list they were meant to serve. It waits under the row now
                  // and a swipe uncovers it — see `wireArrange`.
                  `<div class="slide">` +
                  `<button class="tick" role="checkbox" aria-checked="false" aria-label="Done"></button>` +
                  // The picture itself, where the word "Photo" used to be. A
                  // wall of references read as a list of five identical rows
                  // all saying the same useless word — the one kind of content
                  // that cannot be described by its title, listed by title.
                  (imgOf(b.t)
                    ? `<button class="pic" aria-label="See “${esc(label(b.t))}” full screen"><img alt="" /></button>`
                    : '') +
                  // A textarea, because these are sentences now. ⚡ writes real
                  // steps — "Work backward from your SS27 production schedule
                  // to a funding date" — and an input shows the first thirty
                  // characters of that and hides the rest behind a button. A
                  // list of your work you cannot read is not a list.
                  //
                  // Read-only until you tap it. `user-select: none` does not
                  // stop iOS putting its magnifier and selection handles on a
                  // long press, because a *field* is special-cased: it is
                  // editable, so text interaction wins whatever the stylesheet
                  // says. The only way to hold a row down without the loupe
                  // appearing over the words is for those words not to be in an
                  // editable thing yet. See `tapToEdit`.
                  `<textarea class="t" rows="1" readonly aria-label="What this is called" enterkeyhint="done"></textarea>` +
                  // a group inside a group is still a group, and the list has
                  // to say so — a row that looks like any other item is the
                  // page contradicting what the sky just showed you
                  `<span class="held"></span>` +
                  `</div>` +
                  // Still in the tab order, and focusing it uncovers it: a
                  // control you can only reach by swiping is one a keyboard
                  // cannot reach at all.
                  `<button class="ctl out" aria-label="Take it out of this group">take out</button>` +
                  // The verdict a list of twenty-five steps needs most: no.
                  // The row had take-out and the tick, and a step you simply
                  // did not want could only be exiled to the sky or lied
                  // about as done. Put away, not deleted — the aside page
                  // and the search both bring it back.
                  `<button class="ctl away" aria-label="Put it away">put away</button>` +
                  `</div>`,
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
      pageA.querySelector('.kindline')?.addEventListener('click', (e) => {
        e.stopPropagation()
        // Yours, not the model's. The old type is kept so that turning a
        // to-do back into a note returns it to whatever it actually was —
        // an idea, a question, a reference — rather than flattening every
        // thought in the app to two kinds.
        const was = ex(tl.t).wasType as ThoughtType | undefined
        if (isDoing) {
          S().updateThought(tl.t.id, { type: was ?? 'note' })
          say('a note — out of the Current')
        } else {
          patchExtra(tl.t, { wasType: tl.t.type })
          S().updateThought(tl.t.id, { type: 'action' })
          say('something to do — it flows in the Current now')
        }
        openPage('open', tl, ox, oy)
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

      // The drawer breathes once — see .row.peek in sky.css. First row, first
      // group page of the session; a finger arriving takes over immediately.
      if (!taughtOut && inside.length) {
        taughtOut = true
        const first = pageA.querySelector('.row:not(.add)') as HTMLDivElement | null
        if (first) {
          first.classList.add('peek')
          const done = () => first.classList.remove('peek')
          first.addEventListener('animationend', done, { once: true })
          first.addEventListener('pointerdown', done, { once: true })
        }
      }

      // .value, never innerHTML: these are the user's own words and they are
      // not markup
      ;[...pageA.querySelectorAll('.row:not(.add)')].forEach((row, i) => {
        const m = inside[i]
        const field = row.querySelector('.t') as HTMLTextAreaElement
        const thumb = imgOf(m)
        // "Photo" is what the camera called it, not what you would call it. Now
        // that the picture is on the row, the word is noise — so it steps aside
        // and leaves an invitation. Nothing is written until you accept it: the
        // graph still holds the old name, and an empty field saves nothing.
        const unnamed = !!thumb && label(m) === 'Photo'
        field.value = unnamed ? '' : label(m)
        if (unnamed) field.placeholder = 'Say what this is'
        const pic = row.querySelector('.pic') as HTMLButtonElement | null
        if (pic && thumb) {
          ;(pic.querySelector('img') as HTMLImageElement).src = thumb
          pic.addEventListener('click', (e) => {
            e.stopPropagation()
            const full = fullOf(m)
            if (full) openPhoto(full, label(m))
          })
        }
        // as tall as what it holds, measured rather than guessed
        const fit = () => {
          field.style.height = 'auto'
          field.style.height = field.scrollHeight + 'px'
        }
        field.addEventListener('input', fit)
        requestAnimationFrame(fit)
        const held = view.kidsOf.get(m.id)?.length ?? 0
        const heldEl = row.querySelector('.held') as HTMLElement
        if (held) heldEl.textContent = `${held} inside`
        else heldEl.remove()
        row.classList.toggle('ticked', S().thoughts.find((t) => t.id === m.id)?.status === 'done')
        // No edit mode, no pencil, no second screen: the row is the field, so
        // fixing a name is typing over it. Re-rendering the list here would
        // steal the caret, so it does not.
        //
        // Saved as you type rather than when you leave. Blur used to be the
        // only thing that committed this, which is fine right up until the
        // phone takes the app away mid-sentence — see autosave. What blur does
        // now is offer the undo, for the whole edit rather than for whatever
        // the last debounce happened to catch.
        let began = field.value
        const commit = () => {
          forgetEdit(m.id)
          const u = rename(m.id, field.value)
          if (u) return landUndo(u)
          // already saved on its own; the undo is still owed
          const was = began
          if (field.value.trim() === was.trim()) return
          began = field.value
          landUndo({
            note: `renamed to “${field.value.trim()}”`,
            undo: () => S().updateThought(m.id, { title: was, raw_content: was }),
          })
        }
        pending.push(commit)
        tapToEdit(field)
        field.addEventListener('focus', () => (began = field.value))
        field.addEventListener('input', () => keepEdit(m.id, field.value))
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
          // ticking the last one in here empties the group too — the same
          // offer as ticking it out in the sky, from the other place it happens
          if (nowDone) finishedIt(m.id)
        })
        row.querySelector('.out')?.addEventListener('click', (e) => {
          e.stopPropagation()
          // whatever they typed and did not commit goes in before the row does
          commit()
          landUndo(takeOut(m.id))
          // the page is showing a list that just changed
          openPage('open', tl, ox, oy)
        })
        row.querySelector('.away')?.addEventListener('click', (e) => {
          e.stopPropagation()
          commit()
          landUndo(bin(m.id))
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
        const guess = conceptName(chosen.map(label))
        const res = groupInto(tl.t.id, chosen.map((m) => m.id), guess)
        if (!res) return
        landUndo(res.undone)
        // the local guess lands instantly; a real name replaces it a moment
        // later — and only if the guess is still what it is called
        nameThePool(res.groupId, res.texts, guess, (better) => {
          rebuild()
          paintAll()
          say(`called it “${better}”`)
        })
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
        // With a lifetime, like every other undo. Without one, a select-mode
        // take-out parked this bar over the tab bar for the rest of the
        // session — a playtester reported it covering rows an hour later.
        offerAction(
          note,
          'put them back',
          () => {
            for (const u of [...undos].reverse()) u.undo()
            rebuild()
            paintAll()
            redrawGroupPage()
            say('back the way it was')
          },
          9000,
        )
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
              // its own class, NOT "out": that word belongs to the swipe
              // pills, whose styling is opacity-0-until-swiped and
              // untouchable — worn here it made the one recovery button on
              // this page invisible to a finger. A playtester with a
              // snoozed campaign tapped it, swiped it, tapped the row, and
              // called it a fire-your-agency moment. Fair.
              `<button class="ctl back" data-back="${i}" aria-label="Bring it back">bring back</button></div>`,
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
        // …and its household, in whichever way it went away. A group goes to
        // rest, or under, with everything inside it; bringing back the shell
        // alone would restore an empty group.
        const under = [...household(t.id, 'snoozed'), ...household(t.id, 'archived')]
        S().updateThought(t.id, { status: 'open', snooze_until: null })
        for (const id of under) S().updateThought(id, { status: 'open', snooze_until: null })
      }
      for (const [sel, list] of [
        ['.grp.rest .row', rest],
        ['.grp.away .row', away],
      ] as [string, Thought[]][]) {
        ;[...pageA.querySelectorAll(sel)].forEach((row, i) => {
          // textContent: the user's own words, not markup
          ;(row.querySelector('.t') as HTMLElement).textContent = trim(label(list[i]), 46)
          row.querySelector('.back')?.addEventListener('click', (e) => {
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
      // Whatever you were writing last time this page went away without being
      // finished. It comes back here rather than reopening itself, because a
      // draft that reopens the page is an app talking over you; a draft that
      // is simply still there when you next go to write is an app that did not
      // lose anything.
      const kept = heldDraft()
      pageT.value = kept
      asking('Let it storm.')
      // The destination used to be said here too — truncated, in the footer,
      // beside Done, which is exactly where two playtesters failed to see it.
      // It is the tappable chip under the question now (see paintInto), and
      // one voice saying it clearly beats two saying it small.
      pageN.textContent = kept ? 'still here from before' : '✦ organizes · or a line, a drop'
    } else if (mode === 'say' && tl) {
      /*
       * Your words, into the thing. One page, one way out.
       *
       * It had two buttons for a while — keep it, or hand it to the agent —
       * and choosing between them is a decision you can only make after you
       * have written the thing, so the page asked you at the end rather than
       * the start. That was better than two moons and still wrong: a page with
       * a fork in it is a page you have to read. The words are kept, full
       * stop, and the other thing you might have wanted is offered afterwards,
       * where offers already live.
       */
      pendingImage = null
      pageQ.textContent = QUESTIONS[answersOf(tl.t).length] || 'What else wants to be said?'
      pageT.value = ''
      asking('What you know, what changed, what you found out…')
      pageN.textContent = trim(label(tl.t), 46)
    } else if (mode === 'ask' && tl) {
      /*
       * Anything you want to know, with this as the context.
       *
       * The thing you are looking at is most of the question. "What is mem
       * 2.0" asked in front of a memory architecture is a narrower question
       * than the same five words on their own, and until now there was nowhere
       * to ask it: the agent could only be pointed at a thing that already
       * read as a question. Every group, every note, every photograph could be
       * worked on and never asked about.
       */
      pendingImage = null
      /*
       * …and the same page, when it is the agent's turn to ask.
       *
       * A question that came back instead of an answer arrives here rather
       * than in a bar at the foot of the sky, because the reply to it is
       * typing — and this is the page for typing a question about this thing.
       * You are looking at exactly what you were looking at, with the
       * agent's question where the prompt was and its readings of your ask
       * as rows you can tap.
       *
       * Nothing about it is a dead end. The box is still yours: the options
       * are a shortcut to a phrasing, not a menu you have to choose from, and
       * closing the page leaves the thought precisely as it was — a question
       * back writes nothing, which is the whole point of it.
       */
      const cl = pendingClarify
      pendingClarify = null
      pageQ.textContent = cl ? cl.ask : 'Ask about this'
      pageT.value = ''
      asking(cl ? 'Say which, or put it another way…' : 'Anything you want to know…')
      // The subject, either way. The reason it is asking goes in the panel with
      // the readings and not here: this is a footnote beside the mic, it holds
      // about thirty characters before it clips, and a sentence explaining that
      // the app cannot hand you pictures is not a footnote.
      pageN.textContent = trim(label(tl.t), 46)
      if (cl) {
        // The writing box gives up the room it was not using. Asking normally,
        // the box is the page — you are composing. Being asked, what you are
        // mostly doing is reading three lines and touching one, and a full
        // screen of empty field between the question and the answer to it is
        // six hundred pixels of nothing.
        page.classList.add('asked')
        pageA.style.display = 'block'
        pageA.innerHTML =
          (cl.because ? `<div class="why"></div>` : '') +
          (cl.options.length
            ? `<div class="lab">did you mean</div>` +
              cl.options.map(() => `<button class="ctl pick" type="button"></button>`).join('')
            : '')
        // textContent throughout, never interpolation: these words came back
        // from a model that had web pages in front of it, and this is a page on
        // our own origin.
        const why = pageA.querySelector('.why')
        if (why) why.textContent = cl.because
        pageA.querySelectorAll('.pick').forEach((b, i) => {
          b.textContent = cl.options[i]
          b.addEventListener('click', (e) => {
            e.stopPropagation()
            const chosen = cl.options[i]
            closePage(false)
            void runAnswer(tl, chosen)
          })
        })
      }
    } else if (tl) {
      pageQ.textContent = 'Inside this drop'
      pageT.value = tl.t.raw_content
      asking('')
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
    // asking out loud is the most natural way to ask
    // the two things you do *to* a thing live in the top bar, and only a
    // thing's own page has a thing for them to be done to
    pageTone.hidden = mode !== 'open' || !tl
    pageShare.hidden = mode !== 'open' || !tl
    toneFor = mode === 'open' && tl ? tl : null
    shutTones()
    paintTone()
    pageMic.classList.toggle('show', speechOK && (mode === 'capture' || mode === 'say' || mode === 'ask'))
    pageMic.classList.remove('live')
    pagePic.classList.toggle('show', mode === 'capture' || mode === 'say')
    pageAbsorb.classList.toggle('show', mode === 'capture' && !S().offline)
    // Only where there is finished work to send. A group page and a capture
    // page have nothing yet; a brief is the whole point of this button.
    pageSend.classList.toggle('show', mode === 'brief' && !!tl && !!briefOf(tl.t.id))
    pageLater.classList.toggle('show', mode === 'open')
    page.classList.add('show')
    // the strip of screen below the glass turns to paper with the page — see
    // .world-hem, which is document content and so is not covered by anything
    // fixed, however full-screen it looks
    document.body.classList.add('on-paper')
    page.style.clipPath = frontPath(ox, oy, 0)
    // The page's own height, not the viewport's. The page runs --bleed past the
    // bottom of the glass so it covers the whole screen on an installed phone;
    // sizing the front to innerHeight would leave that last strip clipped — an
    // arc of night sky across the bottom of the paper.
    const reach = frontReach(ox, oy, W, page.offsetHeight || innerHeight)
    // Rings, out ahead of it.
    //
    // Every button in this app answers a touch the way water does — a body
    // that dips, and a ring leaving the point that was pushed. Holding the sky
    // to write is the same act and was the one place that did not: the page
    // simply appeared out of nowhere in particular. These leave first and run
    // in front of the paper, so what you see is the surface being disturbed
    // where your thumb is and the page coming up behind it.
    if (!reduced) wake(ox, oy)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        page.style.clipPath = frontPath(ox, oy, reach)
        page.classList.add('on')
      }),
    )
    // …and after the front has passed, not while it is still travelling. The
    // keyboard used to come up over a page that was a third open.
    if (!reading) setTimeout(() => pageT.focus(), reduced ? 0 : 560)
  }
  /**
   * The surface, disturbed where you touched it.
   *
   * Four rings rather than the two a button makes, spread over four hundred
   * milliseconds and growing as they go — a press-and-hold is a longer, softer
   * act than a tap and the answer should be too. They live under the page
   * (z-index 3 against its 120), which is what puts them out in the dark sky
   * the paper has not reached yet.
   */
  function wake(x: number, y: number) {
    rippleAt(x, y, WAKE)
  }



  /*
   * What kind of thing this is — settled quietly, without rewording it.
   *
   * Two corrections here, both found by watching somebody actually use it.
   *
   * **The date now lands.** classify has always pulled "by Friday" out of the
   * words and into `suggestedDue` — and nothing anywhere read it. Grepped: not
   * one consumer. So a person typing "Renew car insurance by Friday" got a
   * drop with no date, the Current could never rank it against anything, and
   * the one seeded thing wearing "due Wednesday" made it look deliberate.
   *
   * **The title is yours.** This used to write `title: output.title` — the
   * model's rewording of your words, applied silently, every capture. It is
   * the same act as the group rename that was banned two days ago, done to
   * every single thing you write. The model's opinion of what you meant goes
   * in `summary`, where opinions live; the bubble keeps saying what you said.
   */
  function classifyQuiet(t: Thought) {
    if (S().offline) return
    void runAction<ClassifyOutput>('classify_thought', { raw_content: t.raw_content })
      .then(({ output }) =>
        S().updateThought(t.id, {
          type: output.type === 'goal' ? 'idea' : output.type,
          summary: output.summary || null,
          confidence: output.confidence,
          ...(output.suggestedDue ? { due_date: output.suggestedDue } : {}),
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
    // …and the hem goes black with it, the same way it goes to paper under a
    // page. Whatever the strip below the viewport turns out to be able to
    // paint, it is never the night sky while a photograph is full screen.
    document.body.classList.add('on-photo')
    // one frame, so the transition has a state to come from
    requestAnimationFrame(() => lightbox.classList.add('on'))
  }
  function closePhoto() {
    if (!lightbox.classList.contains('show')) return
    lightbox.classList.remove('on')
    document.body.classList.remove('on-photo')
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

  /** The tidy-up armed by the last close — see closePage. */
  let closeT: ReturnType<typeof setTimeout> | null = null

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
    // The draft, written now rather than on the debounce that is still 400ms
    // out — leaving without committing is precisely when the last sentence you
    // typed matters most.
    if (draftT) clearTimeout(draftT)
    if (pageFor.mode === 'capture' && !commit) keepDraft()
    const pf = pageFor
    pageFor = null
    pageT.blur() // fires change, which is what commits a group's name
    nameFor = null
    page.classList.remove('on')
    // the same shape it arrived as, back down to nothing — a `circle()` here
    // would have nothing in common with the `path()` it is leaving and the
    // page would vanish rather than close
    page.style.clipPath = frontPath(pf.ox, pf.oy, 0)
    document.body.classList.remove('on-paper')
    // Held, so opening another page can cancel it.
    //
    // This is what made "Read what it brought back" flicker and die. That
    // button closes the group page and opens the brief 120ms later — and this
    // timer, armed by the close, was still coming: at 580ms it stripped
    // `show`, `path` and `reading` off the brief that had opened in the
    // meantime, so the page you had just asked for turned itself off halfway
    // through arriving. It was never about the brief; any page opened inside
    // 580ms of closing another one lost its classes.
    if (closeT) clearTimeout(closeT)
    closeT = setTimeout(() => page.classList.remove('show', 'path', 'reading'), reduced ? 0 : 580)
    if (!commit) return
    const v = pageT.value
    if (pf.mode === 'capture') {
      // it is in the graph now (or it was whitespace) — the copy is spent
      dropDraft()
      const blocks = parseCapture(v.trim())
      if (!blocks.length) return
      let drops = 0
      let pools = 0
      // The group that was open when you started writing, if there was one.
      // Checked against the store rather than trusted: a group can be put away
      // while its page is up, and hanging a new thought off something that is
      // no longer there loses it.
      const into =
        pf.into && !pf.intoOff && S().thoughts.some((t) => t.id === pf.into && t.status === 'open')
          ? pf.into
          : null
      /*
       * The storm, made visible.
       *
       * A capture has always been able to be several things at once — blank
       * lines split it into independent blocks, and a heading over bullets
       * becomes a goal with its steps under it. That has been true since the
       * first version of this page and *nothing showed it happening*: the
       * drops were written straight to their final places, so they simply
       * existed, already scattered, the instant the page closed. Nobody would
       * ever have guessed the app could do it, and the one moment that would
       * have taught them was the moment being skipped.
       *
       * So everything is born where you were writing, and leaves from there —
       * one after another, a beat apart, out to where it belongs. Same
       * positions, same graph, same everything: only the departure is new. The
       * target stays authoritative throughout (see `Pos.hold`), so the physics
       * and any layout saved mid-flight are of where things are going.
       */
      const leaving: { p: Pos; at: number }[] = []
      // what got filed into the group you were standing in — see the offer
      // after the storm settles
      const filed: string[] = []
      const born = (id: string, x: number, y: number) => {
        const p = posOf(id)
        p.x = x
        p.y = y
        p.rx = pf.ox
        p.ry = pf.oy
        // out of nothing, at the point of the splash
        p.s = 0.08
        leaving.push({ p, at: 0 })
        return p
      }
      for (const b of blocks) {
        if (b.children.length) {
          pools++
          const g = S().addThought({ raw_content: b.title, title: b.title, type: 'goal', due_date: b.due })
          if (into) {
            S().addRelationship(g.id, into, 'part_of')
            filed.push(g.id)
          }
          const gp = born(
            g.id,
            pf.ox + (Math.random() - 0.5) * 60,
            Math.max(140, pf.oy - 60),
          )
          // …and its steps ring the goal rather than landing wherever the
          // default placement felt like putting them. They were unplaced
          // entirely before this, which is why a pool arrived looking shaken
          // rather than formed.
          b.children.forEach((c, i, all) => {
            const child = S().addThought({ raw_content: c, title: c, type: 'action' })
            S().addRelationship(child.id, g.id, 'part_of')
            const a = -Math.PI / 2 + (i / Math.max(1, all.length)) * Math.PI * 2
            born(
              child.id,
              Math.max(60, Math.min(W - 60, gp.x + Math.cos(a) * 122)),
              Math.max(140, Math.min(H - 160, gp.y + Math.sin(a) * 104)),
            )
          })
        } else {
          for (const line of b.body.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
            drops++
            const t = S().addThought({ raw_content: line, due_date: b.due, source: micUsed ? 'voice' : 'text' })
            if (into) {
              S().addRelationship(t.id, into, 'part_of')
              filed.push(t.id)
            }
            const a = Math.random() * Math.PI * 2
            const rad = drops === 1 && pools === 0 ? 0 : 100 + (drops % 3) * 46
            const p = born(
              t.id,
              Math.max(60, Math.min(W - 60, pf.ox + Math.cos(a) * rad)),
              Math.max(140, Math.min(H - 160, pf.oy + Math.sin(a) * rad * 0.8)),
            )
            // a lone drop has nowhere to go, so it should not appear to travel
            if (rad === 0) p.rx = p.x
            classifyQuiet(t)
          }
        }
      }
      /*
       * One at a time, and the whole burst over in about a third of a second
       * however many there are. A fixed gap is right for three and absurd for
       * twenty — the point is a ripple of departures, not a queue.
       */
      if (!reduced && leaving.length > 1) {
        const now = performance.now()
        const step = Math.max(28, Math.min(105, 380 / leaving.length))
        leaving.forEach((l, i) => (l.p.hold = now + i * step))
      }
      micUsed = false
      splash(pf.ox)
      persistLayout()
      /*
       * A storm is the one landing that could leave the sky unframed.
       *
       * Every ⚡ landing ends in fitWhenSettled(); this one did not, and it is
       * the only gesture that can add thirty things at once. Measured with a
       * thirty-line capture: drops clipped off both edges of the glass and a
       * pool half-buried under the tab bar, with the camera still framing the
       * seven bubbles that existed before the storm. One or two new drops land
       * where you wrote them and the frame is fine; a real storm re-frames.
       */
      if (drops + pools >= 3) fitWhenSettled()
      const home = into ? S().thoughts.find((t) => t.id === into) : null
      say(
        home
          ? `${drops + pools === 1 ? 'it is' : `${drops + pools} are`} in “${trim(label(home), 26)}”`
          : pools
            ? `${pools === 1 ? 'a pool formed' : pools + ' pools formed'}${drops ? ` · ${drops} loose drop${drops > 1 ? 's' : ''}` : ''}`
            : drops > 1
              ? `the storm settles — ${drops} drops in the sky`
              : 'it’s yours — drag it, grow it, pool it',
      )
      /*
       * "Where you were standing is where it goes" is right most of the time
       * and infuriating the rest: two playtesters wrote their whole week while
       * a seeded group happened to be open, watched it all get filed inside
       * somebody else's campaign, and found no way back — one spent five
       * minutes hunting for one. The filing stands, but the one tap out of it
       * has to be there, and for longer than the six seconds an accident gets:
       * you notice this one only after the page has closed and the pill has
       * said where things went.
       */
      /*
       * The gesture, taught once, right after the one moment it is learnable.
       *
       * A new sky shows "What's on your mind?" — but that bubble leaves the
       * moment the first thought lands, and nothing ever says how to write
       * the second one. A playtester spent the better part of ten minutes
       * finding the hold. One line, once per device, after the first capture
       * has settled and its own announcement has had its beat.
       */
      try {
        if (!localStorage.getItem('bs-taught-hold')) {
          localStorage.setItem('bs-taught-hold', '1')
          setTimeout(() => say('hold any empty sky when the next one comes'), 3600)
        }
      } catch {
        /* private mode — they will find it the way everybody used to */
      }
      if (home && filed.length) {
        offerAction(
          '',
          filed.length === 1 ? 'keep it loose' : 'keep them loose',
          () => {
            for (const id of filed) {
              const r = partOfRel(id)
              if (r && r.to_id === into) S().deleteRelationship(r.id)
            }
            say('loose in the sky instead')
          },
          9000,
        )
      }
    } else if (pf.mode === 'say' && pf.tl) {
      const txt = v.trim()
      const img = pendingImage
      pendingImage = null
      if (!txt) return
      const tl = pf.tl
      const t = tl.t
      patchExtra(t, { answers: [...answersOf(t), txt], plan: null, planSig: null })
      absorbAnim(t.id)
      say(answersOf(t).length === 0 ? 'saturated — it’s ready to rain' : 'absorbed — the path grows richer')
      // The other thing you might have meant, offered once it has landed
      // rather than asked before you had written it. Telling the map that
      // something turned out otherwise is a real act and it is rare; this is
      // where the app already puts the follow-up to what just happened.
      if (!S().offline) {
        const spoken = micUsed
        offerAction('kept — it can move the map too', 'work it in', () => {
          hideUndo()
          void runReshape(tl, txt, img, spoken)
        })
      }
      micUsed = false
    } else if (pf.mode === 'ask' && pf.tl) {
      const q = v.trim()
      micUsed = false
      pendingImage = null
      if (!q) return
      void runAnswer(pf.tl, q)
    } else if (pf.mode === 'open' && pf.tl) {
      landUndo(rename(pf.tl.t.id, v))
    } else if (pf.tl && pf.mode !== 'brief' && pf.mode !== 'like' && pf.mode !== 'aside') {
      /*
       * Never for the reading pages. Their field is hidden but it is not
       * empty — it still holds whatever the previous page left in it — and
       * this branch used to catch "Done looking" on the wall and write that
       * stale text straight into the thing being read. A playtester's photo
       * came off the wall wearing her campaign's name; verified in her data,
       * not her screenshots. Reading must never write.
       */
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
    // With a lifetime. It had none — `offerAction` keeps the bar up for ever
    // when it is not given one — so every rename, every take-out, every tick
    // on the group page left a black bar parked across the page's own buttons
    // until something else replaced it. Three of them were unreachable behind
    // the last thing you happened to do. An offer to reverse something is
    // worth having for as long as you might still mean it, and no longer.
    offerAction(
      u.note,
      'put it back',
      () => {
        u.undo()
        rebuild()
        paintAll()
        redrawGroupPage()
        say('back the way it was')
      },
      9000,
    )
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
    // Sinking to the foot of the list is only the right answer for a row that
    // stands on its own. A nested one belongs to a branch — sending it to the
    // bottom would carry it out from under its own parent and leave any
    // children of its own stranded behind it, at an indent that now means
    // nothing. It strikes through where it is instead, and `branchesOf` puts it
    // at the end of its own siblings the next time the page is drawn.
    const depth = Number(row.dataset.depth)
    const next = all[all.indexOf(row) + 1]
    const holdsSomething = !!next && Number(next.dataset.depth) > depth
    if (depth > 0 || holdsSomething) return
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
   * A row's words: readable always, editable once you ask.
   *
   * The row is still the field — no pencil, no edit mode, no second screen —
   * but it does not *hold* an editable field until you tap it. That is the only
   * arrangement in which press-and-hold can belong to the row: iOS gives a long
   * press inside an editable element to its own selection UI, magnifier and
   * all, and no amount of `user-select` changes that, because a form control is
   * special-cased. A read-only one is ordinary text and obeys the stylesheet.
   *
   * Tapping hands it straight back. Removing `readonly` and focusing inside the
   * click keeps it within the user gesture, which is what iOS wants before it
   * will raise a keyboard, and the caret goes to the end — the one thing lost
   * against a genuinely live field, and worth it against the loupe.
   */
  function tapToEdit(field: HTMLTextAreaElement) {
    field.addEventListener('blur', () => {
      field.readOnly = true
    })
    /*
     * …and a way in that is not a finger.
     *
     * `readonly` is decided by a pointer gesture, which left anybody arriving
     * by keyboard able to Tab onto a row, type, and watch nothing happen — a
     * silent failure, the worst kind. Typing into it is an unambiguous request
     * to edit it, so the first keystroke lets itself in: cleared during
     * `keydown`, before the default action that inserts the character, so the
     * character it was typed with is the first one in the field rather than
     * being swallowed.
     */
    field.addEventListener('keydown', (e) => {
      const k = e as KeyboardEvent
      if (!field.readOnly) return
      // Tab must still move on, and a modifier is somebody using a shortcut
      if (k.key === 'Tab' || k.metaKey || k.ctrlKey || k.altKey) return
      if (k.key.length === 1 || k.key === 'Enter' || k.key === 'Backspace') {
        field.readOnly = false
        if (k.key === 'Enter') k.preventDefault()
      }
    })
  }

  /** Hand a row's words over to the caret. Called by whatever decides a press
   *  was a tap and not a hold — see `letGo`, which is the only such thing. */
  function openField(row: HTMLElement) {
    const f = row.querySelector('.t') as HTMLTextAreaElement | null
    if (!f || !f.readOnly) return
    f.readOnly = false
    f.focus()
    const end = f.value.length
    f.setSelectionRange(end, end)
  }

  /** One level of nesting, in pixels. Kept with the CSS that draws it. */
  const INDENT = 18
  /** Far enough that a thumb wandering while it drags down is not a nest. */
  const NEST_SLOP = 10
  /**
   * How long the row has to be held before it comes up.
   *
   * The same wait as holding empty sky to write on it, and as holding a drop to
   * gather with it — this is meant to be one gesture you learn once, and a list
   * that answered a third of a second sooner than the sky would be a different
   * gesture wearing the same name. It is also the far side of any plausible
   * scroll: a flick is gone in a fraction of this.
   */
  const HOLD_MS = 420
  /** …and how still. Move further than this and it was a scroll. */
  const HOLD_SLOP = 9

  /**
   * Rearranging the list by hand.
   *
   * The group page could already do everything to a group except say what
   * order it is in or what belongs under what — the two things a list is for.
   * ⚡ writes eight steps in whatever order it thought of them, and the only
   * way to say "that one first, and those three are really part of this one"
   * was to close the page and drag bubbles around the sky one pair at a time.
   *
   * Press and hold a row and it comes up — the same wait as holding empty sky
   * to write on it, so this is one gesture learned once rather than a handle to
   * be found. Down the list reorders; across it nests. The same drag does both,
   * because they are the same thought: this goes there. Where "there" is comes
   * out of `dropAt`, which knows the rules and has no idea a finger exists.
   *
   * Telling that hold apart from a scroll is most of the work in here, and none
   * of it can be done with `pointermove` alone — see `feel`, the `timeStamp`
   * check in `move`, and `letGo` for what the browser will and will not tell
   * you in time.
   *
   * Nesting here is not a list-only idea. Nothing in the graph marks a thought
   * as a group — being the far end of a `part_of` is what makes one — so the
   * row you tuck under another is a pool in the sky before you have let go of
   * it, with its own ring and its own page.
   *
   * Wired once, on an element that outlives every redraw of its own contents.
   * Everything else on this page hangs its listeners on rows, which `innerHTML`
   * throws away and rebuilds; these hang on the list itself, so wiring them per
   * render adds a second set each time — and a drag handled twice performs the
   * move, then performs it again against the graph it just changed.
   */
  function wireArrange(host: HTMLElement) {
    const rows = () => [...host.querySelectorAll('.row[data-id]')] as HTMLDivElement[]
    /** The group whose list this is, asked for per drag rather than bound once. */
    const groupOf = () => (pageFor?.mode === 'open' ? (pageFor.tl?.t.id ?? null) : null)
    let drag: {
      id: string
      row: HTMLDivElement
      /** the row and everything under it, which travels with it */
      branch: HTMLDivElement[]
      x0: number
      y0: number
      lines: Line[]
      at: Drop | null
      /** has the hold fired and the row actually left the page? */
      up: boolean
      pointer: number
      /** when the finger landed, by the clock the input events themselves use */
      t0: number
      /** the finger went sideways: this is uncovering the take-out, not a drag */
      swipe: boolean
      /** how far open the row already was when the finger landed, 0 to 1 */
      sw0: number
    } | null = null

    /*
     * Sideways.
     *
     * How far the row travels to uncover what is under it. Mirrors `--reveal`
     * in the stylesheet, which is the only other place the number appears.
     */
    const REVEAL = 176
    /** Enough sideways to mean it, and more than a thumb wanders during a hold. */
    const SWIPE_START = 14
    /** Past this on release it opens the rest of the way; short of it, it shuts. */
    const SWIPE_TAKE = 0.42

    const setSw = (row: HTMLElement, k: number) => {
      row.style.setProperty('--sw', String(k))
      row.classList.toggle('out-open', k > 0.99)
    }
    const swOf = (row: HTMLElement) => Number(row.style.getPropertyValue('--sw')) || 0
    /** Shut every row but one — only ever one thing uncovered at a time. */
    const shut = (except?: HTMLElement) => {
      let any = false
      for (const r of rows()) {
        if (r === except || swOf(r) === 0) continue
        r.classList.remove('tracking')
        setSw(r, 0)
        any = true
      }
      return any
    }

    // where the row would land, drawn as a line across the list at the depth it
    // would land at — the one thing that makes "across nests" discoverable
    const mark = document.createElement('div')
    mark.className = 'dropmark'
    mark.hidden = true

    const paint = () => {
      if (!drag?.at) return
      const rest = rows().filter((r) => !drag?.branch.includes(r))
      const to = rest[drag.at.gap]
      mark.style.setProperty('--d', String(drag.at.depth))
      if (to) to.before(mark)
      else (rest[rest.length - 1] ?? drag.row).after(mark)
      mark.hidden = false
    }

    /** Cancels the wait, wherever it got to. */
    let holdT: ReturnType<typeof setTimeout> | null = null
    const dropHold = () => {
      if (holdT) clearTimeout(holdT)
      holdT = null
    }
    /** Give up on a hold that has not fired yet. */
    const giveUp = () => {
      dropHold()
      if (drag && !drag.up) drag = null
    }
    /** A backstop: by the time the list has actually scrolled under a finger,
     *  the hold may already have fired. `feel` below is the real signal. */
    host.addEventListener('scroll', giveUp, { passive: true })

    /**
     * The finger moved — heard from the one source that says so in time.
     *
     * `pointermove` cannot do this job. The browser withholds it while it works
     * out whether a touch is going to scroll, and releases it only once it has
     * decided. Measured on this page: pointerdown at 0ms and then *nothing*
     * until pointermove at 505ms, followed immediately by pointercancel — while
     * the raw touchmoves had been arriving since 60ms. A hold that fires at
     * 420ms therefore fires into silence, and a swipe meant to scroll the list
     * picks a row up instead. About one swipe in four, before this.
     *
     * `touchmove` is not subject to that delay, so it is what the wait listens
     * to. Passive, because this one only ever cancels: the drag's own
     * `preventDefault` is a separate listener, added at the lift.
     */
    /**
     * The one place that decides what a finger which has not lifted a row is
     * doing: scrolling the list, waiting out a hold, or pulling the row
     * sideways to uncover its take-out.
     *
     * One place because there are two sources and they disagreed. `touchmove`
     * arrives while the finger is still moving; `pointermove` is withheld
     * through the browser's scroll disambiguation and then delivered in a
     * clump. When the swipe lived only in the touch handler, the pointer
     * handler — still running its old "any movement cancels the hold" rule —
     * threw the gesture away before the swipe threshold was ever crossed, and
     * the row never moved at all. Both call this now, from whichever arrives
     * first, and it is idempotent: every decision is taken from where the
     * finger started, never from where it was last seen.
     */
    const steer = (x: number, y: number) => {
      if (!drag || drag.up) return
      const dx = x - drag.x0
      const dy = y - drag.y0
      const to = (v: number) => Math.min(1, Math.max(0, v))
      if (drag.swipe) {
        setSw(drag.row, to(drag.sw0 - dx / REVEAL))
        return
      }
      // Mostly down the page is the list being scrolled, or a thumb on its way
      // somewhere. Mostly across it is this.
      if (Math.abs(dx) > Math.abs(dy)) {
        // Only leftward from shut. Rightward on a shut row is the edge-swipe
        // people use to go back, and taking it over would be theft.
        if (dx > 0 && drag.sw0 === 0) return giveUp()
        // Sideways but not yet far enough to mean it: the hold comes off and
        // that is all, because the slop that cancels a hold is smaller than the
        // distance that starts a swipe and something has to survive the gap. A
        // press that ends here is still a tap, and still opens the row.
        dropHold()
        if (Math.abs(dx) <= SWIPE_START) return
        drag.swipe = true
        drag.row.classList.add('tracking')
        shut(drag.row)
        setSw(drag.row, to(drag.sw0 - dx / REVEAL))
        return
      }
      if (Math.abs(dx) + Math.abs(dy) > HOLD_SLOP) giveUp()
    }

    const feel = (e: TouchEvent) => {
      // The first touch, rather than a hunt for the right one: a second finger
      // arriving mid-wait can only make this cancel a hold, never start one,
      // and declining to pick a row up is the harmless way to be wrong.
      const t = e.touches[0]
      if (t) steer(t.clientX, t.clientY)
    }
    // Passive: `touch-action: pan-y` on the row already told the browser that
    // sideways belongs to us, so there is no pan here to argue with. The drag's
    // own `preventDefault` is a separate listener, added at the lift.
    document.addEventListener('touchmove', feel, { passive: true })

    /**
     * Once the row is up, the finger belongs to us.
     *
     * The list has to keep scrolling normally until the hold fires, so the rows
     * cannot simply refuse touch — they allow `pan-y` and this takes it back at
     * the moment of the lift. It works because a hold that has fired is one the
     * finger held still through, so the browser has not begun a pan to argue
     * with. A passive listener could not do this; hence the explicit `false`.
     */
    const eat = (e: TouchEvent) => e.cancelable && e.preventDefault()

    const lift = () => {
      if (!drag) return
      holdT = null
      drag.up = true
      // Nothing travels with its take-out showing. A row you are carrying is
      // one you are placing, not one you are removing.
      shut()
      // A row picked up while *another* row's field holds focus would be dragged
      // around underneath a keyboard covering half the list it is travelling
      // through. Putting that field away also commits it, on the usual terms.
      //
      // Another row's, not this one's. Blurring the field belonging to the row
      // being lifted is a fight with the tap that opened it: on a page busy
      // enough to deliver a pointerup late, the hold matures during an ordinary
      // tap, and the blur it fired put the row straight back to read-only
      // behind the click that was about to make it editable. The row needed
      // tapping twice to type in, and only sometimes, which is the worst way
      // for a thing to be broken.
      const typing = document.activeElement as HTMLElement | null
      if (typing?.closest('.pans') && !drag.row.contains(typing)) typing.blur()
      try {
        drag.row.setPointerCapture(drag.pointer)
      } catch {
        /* the finger has already gone; pointerup is on its way */
      }
      host.classList.add('arranging')
      for (const r of drag.branch) r.classList.add('lifted')
      host.appendChild(mark)
      document.addEventListener('touchmove', eat, { passive: false })
      haptics.grab()
    }

    const down = (e: PointerEvent) => {
      const row = (e.target as HTMLElement).closest('.row[data-id]') as HTMLDivElement | null
      if (!row || e.button > 0 || !groupOf()) return
      // The controls are taps, not places to pick the row up from — and a field
      // you are already typing in is somewhere a long press means *select this
      // word*, which is the one thing on this page it must go on meaning.
      const on = e.target as HTMLElement
      if (on.closest('.tick, .out, .ctl, .pic')) return
      if (on.closest('.t') && document.activeElement === on.closest('.t')) return

      // A row is already open somewhere else: this touch spends itself closing
      // it. Anything more would be the second meaning of one press, and the
      // press that shuts a revealed delete is not also a press on what was
      // underneath it.
      if (shut(row)) return

      const id = row.dataset.id as string
      const all = rows()
      const lines: Line[] = all.map((r) => {
        const b = r.getBoundingClientRect()
        return { id: r.dataset.id as string, depth: Number(r.dataset.depth), mid: b.top + b.height / 2 }
      })
      const branch = branchOf(lines, id).map((l) => all.find((r) => r.dataset.id === l.id) as HTMLDivElement)
      // Note the pointer, but do not take it. Until the hold fires this gesture
      // is still the browser's to interpret, and capturing it here is enough to
      // stop the list scrolling under a finger that was only ever scrolling.
      // The capture happens at the lift instead, which is the moment it is
      // actually ours.
      drag = {
        id,
        row,
        branch,
        x0: e.clientX,
        y0: e.clientY,
        t0: e.timeStamp,
        lines,
        at: null,
        up: false,
        pointer: e.pointerId,
        swipe: false,
        sw0: swOf(row),
      }
      dropHold()
      holdT = setTimeout(lift, HOLD_MS)
    }

    const move = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x0
      const dy = e.clientY - drag.y0
      /*
       * When it happened, not when we heard about it.
       *
       * A move's `timeStamp` is the moment the finger actually moved; the
       * moment it is *delivered* can be much later, because the browser sits on
       * these while it decides whether the touch is a scroll — and, on a busy
       * page, because the main thread was not free to run anything at all. Both
       * produce the same trap: the hold matures on a timer that keeps perfect
       * time, into a page that has not yet been told the finger left.
       *
       * So a move that says it happened before the hold was due unlifts the
       * row. The row was never held; we were only late to find out.
       */
      if (drag.up && e.timeStamp - drag.t0 < HOLD_MS) {
        letGo(false)
        return
      }
      // Before the lift there is nothing here to decide; `steer` decides it,
      // and a mouse — which produces no touch events at all — is why this
      // handler calls it rather than leaving it to the touch one.
      if (!drag.up) return steer(e.clientX, e.clientY)
      // the branch travels as one, so what you are holding stays together
      for (const r of drag.branch) r.style.transform = `translateY(${dy}px)`
      const was = drag.at
      const groupId = groupOf()
      drag.at = groupId ? dropAt(drag.lines, drag.id, e.clientY, Math.abs(dx) > NEST_SLOP ? dx : 0, INDENT, groupId) : null
      if (drag.at && (!was || was.gap !== drag.at.gap || was.depth !== drag.at.depth)) haptics.grab()
      paint()
      // the list is taller than the screen more often than not
      const box = host.getBoundingClientRect()
      const edge = 44
      if (e.clientY < box.top + edge) host.scrollTop -= 8
      else if (e.clientY > box.bottom - edge) host.scrollTop += 8
    }

    /**
     * Let go.
     *
     * `keep` is false when the browser took the gesture away from us rather
     * than the finger leaving the glass — a `pointercancel`, which means it has
     * decided this touch was a scroll after all. That verdict can arrive *after*
     * the row has already come up, because the browser sits on its pointer
     * events while it makes up its mind: measured here, pointerdown at 0ms,
     * silence through the 420ms lift, then pointermove at 505ms and cancel at
     * 517ms. Treating that cancel as an ordinary release is what made a swipe
     * rearrange the list about once in every four or five tries. It is not a
     * release; it is the browser saying none of that happened.
     */
    const letGo = (keep: boolean, e?: PointerEvent) => {
      dropHold()
      if (!drag) return
      const { at, id, row, branch, up: was, t0 } = drag
      /*
       * A swipe ends where it means to end, not where the finger stopped.
       *
       * Nothing else in `letGo` applies to one: it did not hold anything, so
       * there is nothing to place, and it was not a tap, so the field stays
       * shut. Halfway is the line — under it the row closes, over it the row
       * finishes opening — and the same easing carries it either way.
       */
      if (drag.swipe) {
        const from = drag.sw0
        drag = null
        row.classList.remove('tracking')
        const open = swOf(row) >= SWIPE_TAKE
        setSw(row, open ? 1 : 0)
        // only on the way open, and only from shut: a buzz for arriving
        // somewhere you already were is noise
        if (open && from < 1) haptics.grab()
        document.removeEventListener('touchmove', eat)
        return
      }
      /*
       * …and the same for letting go as for moving.
       *
       * A release whose own clock says the finger was already gone before the
       * hold came due did not hold anything; we were simply late to hear about
       * it. Without this, a page busy enough to delay a pointerup past 420ms
       * turns every tap into a lift — which does not move anything, because
       * nothing was dragged, but does arm the guard below, and that swallows
       * the tap. The symptom is a row that needs tapping twice to type in.
       */
      const early = !!e && e.timeStamp - t0 < HOLD_MS
      const lifted = was && keep && !early
      drag = null
      document.removeEventListener('touchmove', eat)
      for (const r of branch) {
        r.style.transform = ''
        r.classList.remove('lifted')
      }
      host.classList.remove('arranging')
      mark.hidden = true
      mark.remove()
      /*
       * A press that was never a hold is a tap, and a tap on a row opens it for
       * typing. Decided here rather than by a `click` listener on the field,
       * because those two were racing and the race was not winnable: the hold
       * matures on a timer, the click arrives whenever the browser gets round
       * to it, and on a busy page they interleave differently every time. The
       * row needed tapping twice, and only sometimes.
       *
       * One authority. This function already knows whether the press became a
       * hold; nothing else needs to guess.
       */
      if (!was || early) openField(row)
      // let go without ever picking it up: a tap, which belongs to the field
      if (!lifted || !at) return
      const u = moveInto(id, at.parent, at.after)
      // a move that changes nothing is not worth an undo bar
      if (!u) return
      landUndo(u)
      rebuild()
      paintAll()
      redrawGroupPage()
    }

    // Down on the list; everything after it on the document. A finger that
    // leaves the list is the ordinary case — you drag a row to the top by going
    // past the top — and a listener on the list alone stops hearing about it at
    // the boundary.
    host.addEventListener('pointerdown', down)
    document.addEventListener('pointermove', move)
    const up = (e: PointerEvent) => letGo(true, e)
    const cancel = (e: PointerEvent) => letGo(false, e)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', cancel)
    return () => {
      host.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancel)
      document.removeEventListener('touchmove', eat)
      document.removeEventListener('touchmove', feel)
      host.removeEventListener('scroll', giveUp)
    }
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

  // Once, for every group list this page will ever show — see wireArrange.
  const stopArranging = wireArrange(pageA)

  // Leaving the name box is committing it, wherever you are going next.
  pageT.addEventListener('change', () => {
    if (!nameFor) return
    // it may already have gone in on its own — see the input handler above
    forgetEdit(nameFor)
    landUndo(rename(nameFor, pageT.value))
  })
  pageD.addEventListener('click', () => {
    if (pageFor?.mode === 'capture' && micUsed && pageT.value.trim().length > 80) {
      void runOrganize(true)
      return
    }
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
  /**
   * Out of the app and into the world.
   *
   * Straight from the tap, with no await in front of it: iOS only opens the
   * share sheet from inside a real gesture, and one `await` before the call is
   * enough for it to refuse silently.
   */
  pageSend.addEventListener('click', () => {
    const tl = pageFor?.tl
    const art = tl ? briefOf(tl.t.id) : null
    if (!art) return
    const md = sendable(art)
    void sendWork(art.title || label(tl!.t), md).then((how) => {
      const word = sentWord(how)
      if (word) say(word)
    })
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
      /*
       * Where you were standing is where it goes — the words have obeyed
       * this from the start and the photo never did: taken from a capture
       * page opened inside a group, it was born loose in open sky, and the
       * person who took it inside "VENIA Design" found it floating outside.
       * Same rule as the text commit, same chip, same choice: the
       * destination the page is showing is the destination, and tapping the
       * chip to "loose in the sky" is honoured here too.
       */
      const home =
        pf?.mode === 'capture' &&
        pf.into &&
        !pf.intoOff &&
        S().thoughts.some((x) => x.id === pf.into && x.status === 'open')
          ? pf.into
          : null
      if (home) S().addRelationship(t.id, home, 'part_of')
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
      /*
       * The picture now knows what it shows.
       *
       * Only while it is still called "Photo", which is what it is born as.
       * `runOrganize` is also the path a picture takes when it is attached to
       * words you typed, and it is asked to name the picture in the same
       * breath as reading them — so a picture you had already named, or one
       * whose name came out of your own sentence rather than out of the image,
       * would have had that overwritten. The placeholder is the only thing
       * this is allowed to replace.
       */
      const shot = photoId ? S().thoughts.find((t) => t.id === photoId) : null
      const unnamed = !!shot && (shot.title || shot.raw_content || '').trim().toLowerCase() === 'photo'
      if (photoId && res.source && unnamed) S().updateThought(photoId, { title: res.source, raw_content: res.source })
      pageT.value = ''
      dropDraft() // the words are drops now
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
    if (!pageFor || pageFor.mode !== 'open' || !pageFor.tl) return
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
  /**
   * "Get on with it", read off the thing rather than asked of you.
   *
   * A question wants an answer. A step somebody could sit down and produce
   * wants producing. Something already worked out wants to become work.
   * Anything else has to be worked out first.
   *
   * This used to live inline in the moon that offered it, which was fine while
   * the moon was the only place you could act. The brief now lists the steps ⚡
   * came back with and offers the same act on each one, and two copies of a
   * decision this load-bearing would be two different apps within a week.
   */
  function getOnWithIt(tl: TL): { icon: string; lb: string; dim: boolean; run: () => void } {
    const asking = tl.kind === 'drop' && isQuestion(label(tl.t))
    const ready = isKept(tl.t) || isRipe(tl.t) || !!briefOf(tl.t.id)
    const canRain = tl.kind === 'drop' || tl.members.length >= 1
    /*
     * A wall of references is not a pile of ideas, and asking it what to *do*
     * gets you nothing: rain reads titles, and a moodboard's titles are twelve
     * lines that say "Photo". What a wall wants first is to be read — what
     * runs through it, and what is conspicuously not on it — and only then is
     * there anything to rain.
     *
     * Two or more pictures under one thing is a wall. Once it has been read it
     * behaves like anything else with a brief on it, which is how a moodboard
     * gets to be rained into the work that follows from what it turned out to
     * be about.
     */
    const wall = tl.kind === 'pool' && !ex(tl.t).looked_at && isWall(tl.t.id)
    /*
     * A step somebody could sit down and produce, that the funnel put here.
     *
     * Three things at once, and it needs all three. Makeable, so the agent is
     * not offering to write an aeroplane ticket. A leaf, because a thing with
     * work under it is a goal and goals get planned, not drafted. And under
     * something — a leaf at the top of the sky is a loose idea, and the answer
     * to an idea is to grow it, not to write it up.
     */
    const doable =
      tl.kind === 'drop' &&
      !tl.members.length &&
      isMakeable(label(tl.t)) &&
      !!S().relationships.find((r) => r.type === 'part_of' && r.from_id === tl.t.id)
    // …and once it has been made, the thing to do with it is read it. Keyed on
    // the stamp the draft leaves rather than on there being a brief at all: a
    // question you asked *about* this step also leaves one, and that is not the
    // same as the step being written.
    const made = doable && !!ex(tl.t).drafted_at && !!briefOf(tl.t.id)
    if (wall) {
      return {
        icon: 'look',
        lb: 'look at them',
        dim: S().offline,
        run: () => void runLook(tl),
      }
    }
    /*
     * A single photograph, and the thing you actually want from one.
     *
     * The answer to a reference is more references. Standing in front of one
     * photograph, the whole of what a person wants is to see the neighbours —
     * and this app had no gesture for it at all, so the request went through
     * `ask`, which answers questions with sentences, and came back with four
     * paragraphs about the artist. Correct, sourced, and not pictures.
     *
     * Above `asking`, deliberately. A photograph named with a question — which
     * is what happens when you type the request into the field under it — would
     * otherwise still offer to answer it in words, which is the exact failure
     * this exists to end.
     */
    if (tl.kind === 'drop' && !!imgOf(tl.t)) {
      const already = !!likeOf(tl.t)
      return {
        icon: 'look',
        lb: already ? 'what it found' : 'find like it',
        dim: !already && S().offline,
        run: () => {
          const q = posOf(tl.t.id)
          if (already) openPage('like', tl, toScreenX(q.x), toScreenY(q.y))
          else void runFindLike(tl)
        },
      }
    }
    return {
      icon: made ? 'brief' : asking ? 'ask' : doable ? 'make' : ready && canRain ? 'rain' : 'work',
      // Always 'rain', never 'path'. A cloud that has rained once and been
      // added to since has more to give; the old second label opened a page of
      // five template rows that had already been produced, which is the one
      // thing a second press should never do.
      /*
       * `make the steps`, not `rain`.
       *
       * Rain is the best metaphor in this app and it was the worst button in
       * it. Every other moon is a verb and what it does — say, ask, do it,
       * read it, work it, find like it — and then one of them was a noun from
       * a weather system, on the one gesture that does the most: it reads
       * everything you have gathered under a name and writes the actual work
       * out from under it, which then flows to the Current. There is no way to
       * guess that from the word, and a button you have to be taught is a
       * button that is not doing its job.
       *
       * The metaphor is not gone, it has just moved to where it belongs: the
       * drops still fall out of the cloud when you press it, and the app still
       * says the cloud let go afterwards. What the *button* says is what will
       * happen.
       */
      lb: made ? 'read it' : asking ? 'answer it' : doable ? 'do it' : ready && canRain ? 'make the steps' : 'work it',
      // reading what is already written is the only one of these that needs
      // nothing from the network — rain goes out to condense now
      dim: !made && S().offline,
      run: () => {
        if (made) {
          const q = posOf(tl.t.id)
          openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
        } else if (asking) void runAnswer(tl)
        // before rain, deliberately: a step that has been drafted has a brief,
        // which would otherwise make it "ready" and offer to rain a single
        // action into the current, which is not a thing that means anything
        else if (doable) void runDraft(tl)
        else if (ready && canRain) void rain(tl)
        else void runDeepen(tl)
      },
    }
  }

  /*
   * Aiming with the finger that opened them.
   *
   * `sliding` is true from the moment a hold turns into a menu until the
   * finger comes up. While it is, whatever moon is under the finger — or
   * nearest it, within a forgiving reach, because a thumb is wider than an
   * icon and lands short at least as often as on — is the one that will run.
   */
  let sliding = false
  let aimed: HTMLDivElement | null = null
  /** How far past a moon still counts as meaning it. */
  const AIM_SLOP = 26
  /**
   * Where the row stood when the slide began.
   *
   * The moons hang off whatever they belong to, and in this sky that thing is
   * never still: a drop breathes, a member of an open group is going round,
   * and the constellation re-centres itself for a second after anything
   * changes. Measured with a finger down on a member, the row walked 170
   * points down the glass in under a second — out from under the thumb that
   * had just opened it.
   *
   * So the row stops where it was when you started choosing. Followed until
   * then, still afterwards, which is exactly as long as it matters.
   */
  let slideRow: { x: number; y: number } | null = null
  function aimAt(x: number, y: number) {
    let best: HTMLDivElement | null = null
    let bestD = Infinity
    for (const m of moonEls) {
      const r = m.getBoundingClientRect()
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      const d = Math.hypot(x - cx, y - cy)
      if (d < r.width / 2 + AIM_SLOP && d < bestD) {
        bestD = d
        best = m as HTMLDivElement
      }
    }
    if (best === aimed) return
    aimed?.classList.remove('aimed')
    aimed = best
    if (aimed) {
      aimed.classList.add('aimed')
      // one tick per moon crossed, so they can be found without looking
      haptics.grab()
    }
  }
  /** Let go: the one under the finger runs. */
  function fireAimed(): boolean {
    if (!aimed) return false
    const m = aimed
    aimed = null
    m.classList.remove('aimed')
    sliding = false
    slideRow = null
    // its own click handler already holds the action, the dim case and the
    // closing — this is the same press, arrived at differently
    m.click()
    return true
  }
  function closeMoons() {
    // whatever was being aimed at is gone with them
    sliding = false
    aimed = null
    slideRow = null
    moonEls.forEach((m) => m.remove())
    moonEls.length = 0
    moonsFor = null
    // the recommendation comes back out when the actions go away
    paintNext()
  }
  /**
   * @param atOnce they arrive already in place, with no entrance.
   *
   * The row pops in over about 380ms, staggered a moon at a time, and each
   * disc scales about its own centre — so for that third of a second the
   * things you would aim at are still moving. Fine when you tapped and are
   * about to look; wrong when your finger is already down and travelling,
   * which is the whole of the hold gesture. Under a finger they are simply
   * there.
   */
  function showMoons(tl: TL, atOnce = false) {
    closeMoons()
    moonsFor = tl.t.id
    // The recommendation steps out of the way of the actions. It knew to — it
    // is hidden whenever a menu is up — but nothing repainted when a menu was
    // opened by tapping a bubble, so the two sat on top of each other and
    // neither could be read.
    paintNext()
    /*
     * Where it stands is layoutMoons's problem, not this one.
     *
     * There was a line here that shoved the drop down to `radiusOf(tl) + 170`
     * so the actions would have room under it. Two things wrong with it, and
     * the second is what put a photograph half off the top of the screen.
     *
     * `radiusOf` on a drop tops out at 112, and a photograph you have opened
     * is not a disc — it is a card as tall as the picture, up to 54% of the
     * glass. So the room reserved was less than half what the thing needed and
     * its top went under the status bar.
     *
     * And it ran once, on the tap. The card *grows* into its size over about
     * half a second, so even the measured height is not knowable yet at the
     * moment this fires. The rule belongs in the frame loop, where the true
     * size is already known and can be corrected as it changes.
     */
    const p = posOf(tl.t.id)
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

    // 1. Words into it. Yours, kept, no round trip.
    acts.push({
      icon: 'tell',
      lb: 'say',
      run: () => {
        closeMoons()
        openPage('say', tl, toScreenX(p.x), toScreenY(p.y))
      },
    })

    // 2. Words *to* it. Anything you want to know, with this as the context —
    //    which is most of what makes the question worth asking.
    acts.push({
      icon: 'ask',
      lb: 'ask',
      dim: S().offline,
      run: () => {
        closeMoons()
        openPage('ask', tl, toScreenX(p.x), toScreenY(p.y))
      },
    })

    // 3. Get on with it — see getOnWithIt, which is the only place that
    //    decision is made now, because the brief makes it too.
    const third = getOnWithIt(tl)
    acts.push({ ...third, run: () => { closeMoons(); getOnWithIt(tl).run() } })

    /*
     * 4. …and what it already brought back, when there is any.
     *
     * Three was the right number while every thing had the same three things
     * you could intend. But a thing ⚡ has already been out for is not in that
     * state any more: there is a minute of research sitting on it, and the
     * only way to reach it was the group page, four taps away, behind a fold,
     * under a heading about deleting things. The pool's own label even said
     * "the brief is one moon away and never goes anywhere" — it was not, and
     * this is the moon that makes that true.
     *
     * It appears only when there is something to read, so nothing on a plain
     * drop has changed, and never twice: `get on with it` already says
     * `read it` on a step that has been written.
     */
    if (briefOf(tl.t.id) && third.lb !== 'read it') {
      acts.push({
        icon: 'brief',
        lb: 'read it',
        run: () => {
          closeMoons()
          const q = posOf(tl.t.id)
          openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
        },
      })
    }
    acts.forEach((a, i) => {
      const m = document.createElement('div')
      m.className = 'sky-moon' + (a.dim ? ' dim' : '') + (atOnce ? ' now' : '')
      m.innerHTML = `<div class="ic">${moonSvg(a.icon)}</div><div class="lb">${a.lb}</div>`
      if (!reduced && !atOnce) m.style.animationDelay = i * 45 + 'ms'
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

    /*
     * …unless a finger is choosing from it, in which case it stands still.
     *
     * Taken on the first frame of the slide rather than when the hold fired:
     * a freshly made moon has no transform yet and is briefly at the world
     * origin, so anchoring any earlier would nail the row to the top of the
     * sky. See `slideRow`.
     */
    if (sliding && !slideRow) slideRow = { x: p.x, y: p.y + below }
    const rowX = slideRow ? slideRow.x : p.x
    const rowY = slideRow ? slideRow.y : p.y + below

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
      const cx = lo > hi ? (toWorldX(0) + toWorldX(W)) / 2 : Math.max(lo, Math.min(hi, rowX))
      const x = cx + (slot - (n - 1) / 2) * gap - MOON_R
      // and never under the tab bar, however low the thing itself is — the
      // label hangs below the disc now, so this clears more than the disc
      const floor = toWorldY(waterlineY() - 132) - MOON_R
      const y = Math.min(rowY, floor)
      // the moons live in the world but are things you tap: they keep their
      // real size however far out the camera has pulled
      // …and the one being aimed at stands up out of the row. Folded into the
      // inline transform because this line runs every frame and would
      // otherwise overwrite anything the stylesheet had to say about it.
      const grow = m.classList.contains('aimed') ? 1.18 : 1
      m.style.transform = `translate(${x}px, ${y}px) scale(${((grow / cam.k)).toFixed(3)})`
    })
  }


  /**
   * The cloud lets go, and what falls is work.
   *
   * The rain itself is unchanged and it is the point: seven drops off the
   * underside, into the water, a splash. What is behind it is new. It used to
   * open a page of five template rows — the group's own name, its first three
   * members with `Rough out "…"` in front of them, and one closing sentence,
   * the same five for any group of any content — and "keep this path" set a
   * flag and wrote them into a blob nothing else in the app could read. So
   * nothing ever actually rained into the Current.
   *
   * Now it reads the whole cloud and what falls becomes real actions under it,
   * which is where the rest of the app is waiting: they land in the Current,
   * they can be ticked, and each one is a leaf under a goal, so the third moon
   * reads it and offers `answer it`, `do it` or `work it` on its own terms.
   *
   * It stays instant on purpose. No search — this is their own thinking, and
   * the web has never heard of it — so what is left is one ordinary call that
   * lands about as the splash finishes. Going away for a minute is `work it`,
   * one moon over.
   */
  /**
   * Read the wall.
   *
   * The one act in this app that no competitor in its market can perform:
   * every moodboard tool there is will hold your references beautifully and
   * none of them has an opinion about them. What comes back lands as a brief,
   * so it can be read again from the moon that reads briefs — and so `rain`
   * picks it up as `found` and can turn a reading into the work that follows.
   */
  /**
   * Go and find the neighbours of one photograph.
   *
   * The whole of the ask "find me more inspiration like this", which the app
   * used to route through `answer` — and `answer` writes sentences, so a
   * request for pictures came back as four paragraphs about the artist. Right
   * about the artist, and not the thing that was wanted.
   *
   * What lands is kept on the drop, not held in a variable: it is a minute of
   * searching, and a minute of work that only exists until you close the page
   * is a minute thrown away.
   */
  async function runFindLike(tl: TL) {
    if (working || S().offline) return
    closeMoons()
    const pic = fullOf(tl.t) ?? imgOf(tl.t)
    if (!pic || !pic.includes(',')) {
      say('there is no picture on this one')
      return
    }
    setWorking(tl.t.id)
    /*
     * No gauge on this one.
     *
     * Every other long action asks `gauge` first, because how much looking-up
     * a thing needs is a real question with a cheap answer. Here it is not a
     * question: finding works that resemble a photograph means going out and
     * looking, every time, and a run to decide that would be a run spent
     * deciding something already known. So it goes straight out, and the
     * panel says so from the first frame instead of saying "sizing it up"
     * about a size that was never in doubt.
     */
    const sizing: Sizing = { ...fullDepth(3), why: 'looking for the neighbours' }
    const watch = watchWork(tl, () => sizing)
    watch.at('out')
    const parentId = S().relationships.find((r) => r.type === 'part_of' && r.from_id === tl.t.id)?.to_id
    const parent = parentId ? S().thoughts.find((t) => t.id === parentId) : null
    const siblings = parentId
      ? S()
          .relationships.filter((r) => r.type === 'part_of' && r.to_id === parentId && r.from_id !== tl.t.id)
          .map((r) => S().thoughts.find((t) => t.id === r.from_id))
          .filter((t): t is Thought => !!t)
          .map((t) => label(t))
          .slice(0, 20)
      : []
    const res = await findLikeThis(
      { id: tl.t.id, title: label(tl.t), summary: tl.t.summary },
      { mediaType: 'image/jpeg', dataB64: pic.split(',')[1] },
      { context: siblings, under: parent ? label(parent) : undefined, sizing },
    )
    watch.at('landing')
    watch.stop()
    setWorking(null)
    if (dead) return
    if (res.kind === 'failed') {
      hold(res.why ?? 'could not get out there just now', trim(label(tl.t), 34))
      offerAction('', 'again', () => {
        hold(null)
        void runFindLike(tl)
      })
      return
    }
    if (res.kind === 'nothing') {
      // It looked and found nothing it could stand behind. The searches are
      // still worth having — often they are the most useful part — so they are
      // kept and the wall opens with them on it rather than with an apology.
      patchExtra(tl.t, {
        like: { reading: res.reading, finds: [], searches: res.searches, at: new Date().toISOString() },
      })
      rebuild()
      hold(res.reading, trim(label(tl.t), 34))
      offerAction('', 'the searches', () => {
        hold(null)
        const q = posOf(tl.t.id)
        openPage('like', tl, toScreenX(q.x), toScreenY(q.y))
      })
      return
    }
    patchExtra(tl.t, {
      like: { reading: res.reading, finds: res.finds, searches: res.searches, at: new Date().toISOString() },
    })
    rebuild()
    paintAll()
    haptics.arrive()
    const shown = res.finds.filter((f) => f.image).length
    record(`looked for more like it · ${shown || res.finds.length} found`, trim(label(tl.t), 40))
    hold(null)
    const q = posOf(tl.t.id)
    openPage('like', tl, toScreenX(q.x), toScreenY(q.y))
  }

  /**
   * Keep one of them.
   *
   * It comes down through the server as bytes rather than staying a link,
   * because a reference that lives at somebody else's URL stops being a
   * reference the day they reorganise their site — and because a cross-origin
   * image taints a canvas, so the browser could not do it alone even if we
   * wanted it to.
   *
   * It lands in the same group the photograph it came from is in, which is the
   * group the wall was searched on behalf of.
   */
  async function keepFind(tl: TL, f: Find, btn: HTMLElement) {
    if (!f.image || btn.dataset.busy) return
    btn.dataset.busy = '1'
    btn.classList.add('busy')
    const dataUrl = await keepImage(f.image)
    if (!dataUrl) {
      delete btn.dataset.busy
      btn.classList.remove('busy')
      // on the button as well as in the note — the note sits a screen away
      // from the finger, and a playtester read this failure as pure silence
      btn.textContent = '✕'
      setTimeout(() => (btn.textContent = '+'), 1600)
      pageN.textContent = 'that one would not come down'
      return
    }
    const name = [f.title, f.who].filter(Boolean).join(' — ').slice(0, 200) || 'Reference'
    const made = S().addThought({
      raw_content: name,
      title: name,
      summary: f.why || null,
      extra: { img: dataUrl, full: dataUrl, from: f.url },
    })
    const parentId = S().relationships.find((r) => r.type === 'part_of' && r.from_id === tl.t.id)?.to_id
    if (parentId) S().addRelationship(made.id, parentId, 'part_of')
    // beside the one it is like, so it arrives where you were looking
    const home = posOf(tl.t.id)
    const p = posOf(made.id)
    const a = Math.random() * Math.PI * 2
    p.x = p.rx = Math.max(60, Math.min(worldW() - 60, home.x + Math.cos(a) * 150))
    p.y = p.ry = Math.max(140, Math.min(waterlineY() - 90, home.y + Math.sin(a) * 120))
    p.s = 0.2
    btn.classList.remove('busy')
    btn.classList.add('kept')
    btn.textContent = '✓'
    rebuild()
    paintAll()
    haptics.join()
    record(`kept · ${trim(name, 46)}`, trim(label(tl.t), 40))
    persistLayout()
  }

  async function runLook(tl: TL) {
    if (working || S().offline) return
    closeMoons()
    setWorking(tl.t.id)
    hold('reading them across…', trim(label(tl.t), 34))
    const res = await lookAtWall(tl.t.id)
    setWorking(null)
    if (dead) return
    if (res.kind === 'thin') {
      hold('two pictures or more, and there is something to read across', trim(label(tl.t), 34))
      return
    }
    if (res.kind === 'failed') {
      hold(res.why ?? 'could not read them just now', trim(label(tl.t), 34))
      offerAction('', 'again', () => {
        hold(null)
        void runLook(tl)
      })
      return
    }
    rebuild()
    paintAll()
    haptics.arrive()
    hold(res.note || res.output.read, trim(label(tl.t), 34))
    record(`looked · ${trim(res.output.read, 46)}`, trim(label(tl.t), 40))
    offerAction('', 'read it', () => {
      hold(null)
      const q = posOf(tl.t.id)
      const now = view.byId.get(tl.t.id)
      if (now) openPage('brief', now, toScreenX(q.x), toScreenY(q.y))
    })
  }

  async function rain(tl: TL) {
    if (working || S().offline) return
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

    setWorking(tl.t.id)
    hold('what falls out of this…', trim(label(tl.t), 34))
    const res = await rainThought(tl.t.id)
    setWorking(null)
    if (dead) return

    if (res.kind === 'failed') {
      hold(res.why ?? 'nothing fell just now', trim(label(tl.t), 34))
      offerAction('', 'again', () => {
        hold(null)
        void rain(tl)
      })
      return
    }
    if (res.kind === 'thin') {
      // A cloud of half-formed ideas sometimes genuinely has no next action in
      // it yet, and the one question that would unlock it is worth more than
      // five invented chores. Saying so is the honest answer, and the old
      // template could never give it.
      hold(res.missing[0] ?? 'nothing follows from this yet', trim(label(tl.t), 34))
      record('rained · nothing follows yet', trim(label(tl.t), 40))
      return
    }
    landRain(tl, res)
  }

  /** Put what fell where it belongs, and show it falling. */
  function landRain(tl: TL, res: Extract<Awaited<ReturnType<typeof rainThought>>, { kind: 'rained' }>) {
    // the new work arrives around the cloud it came out of, rather than
    // wherever an unplaced drop would have been dropped
    const gp = posOf(tl.t.id)
    const before = new Set(view.byId.keys())
    rebuild()
    for (const id of view.byId.keys()) {
      if (before.has(id)) continue
      const q = posOf(id)
      const a = -Math.PI / 2 + Math.random() * Math.PI * 2
      q.x = q.rx = gp.x + Math.cos(a) * 150
      q.y = q.ry = gp.y + Math.sin(a) * 120
      q.s = 0.3
    }
    paintAll()
    haptics.join()
    hold(res.note || `${res.added} thing${res.added === 1 ? '' : 's'} fell out of it`, trim(label(tl.t), 34))
    record(`rained · ${res.added} to do`, trim(label(tl.t), 40))
    // …and the way to say no to it. See declineAdded.
    declineAdded([...view.byId.keys()].filter((id) => !before.has(id)))
    fitWhenSettled()
  }
  /**
   * What the agent added, and your right to refuse it.
   *
   * Rain and ⚡ both write real thoughts into your map — five steps under a
   * cloud, two under a drop — and neither had any way back but deleting them
   * one at a time. A playtester watched two steps about somebody else's
   * subject appear inside her own pile and called it exactly what it is:
   * being surprised by your own notes.
   *
   * The work still lands, because it ran for a minute and you may well have
   * put the phone down — losing it to an unanswered question would be worse.
   * What lands with it is the refusal: one tap, all of them put away
   * together, recoverable from the cloud like anything else. Twelve seconds,
   * because this is a verdict on work you did not watch arrive.
   */
  function declineAdded(ids: string[]) {
    if (!ids.length) return
    const n = ids.length
    offerAction(
      `${n} ${n === 1 ? 'thing' : 'things'} added`,
      n === 1 ? 'not this one' : 'not these',
      () => {
        const undos = ids.map(bin).filter((u): u is Undone => !!u)
        rebuild()
        paintAll()
        redrawGroupPage()
        if (!undos.length) return
        record(`${n} put away — not asked for`)
        offerAction(`${n} put away`, 'put them back', () => {
          for (const u of [...undos].reverse()) u.undo()
          rebuild()
          paintAll()
          redrawGroupPage()
          say('back the way it was')
        }, 9000)
      },
      12000,
    )
  }
  // ⚡ — the agent goes away and does the legwork on one drop, and what it
  // finds arrives as real work hanging under it rather than as a wall of prose.
  /**
   * What the agent is out working on, if anything.
   *
   * State, not a class poked onto an element — which is what it was, and is
   * why the glow vanished the moment you left the group it was inside. The
   * drop was unmounted along with everything else in that ring, taking its
   * `.working` class with it, and nothing upstream ever knew. You would come
   * out of a group to a perfectly still sky with a minute of research still
   * running in it, and the only way to find out was to go back in.
   *
   * `paintWorking` puts the glow on whatever is actually on screen: the thing
   * itself when you can see it, and otherwise the nearest ancestor you can —
   * so the group you just stepped out of keeps pulsing until the work lands.
   */
  let working: string | null = null
  function setWorking(id: string | null) {
    working = id
    paintWorking()
  }
  function paintWorking() {
    for (const [, el] of els) el.classList.remove('working')
    if (!working) return
    // up through the part_of chain until something is drawn. `seen` because a
    // bad edge can make a loop and a loop here would hang the frame.
    const seen = new Set<string>()
    let id: string | undefined = working
    while (id && !seen.has(id)) {
      seen.add(id)
      const el = els.get(id)
      if (el) {
        el.classList.add('working')
        return
      }
      id = view.parentOf.get(id)
    }
  }
  /**
   * The one ticker every action that goes away shares.
   *
   * All three of them had grown their own copy of the same six lines — a
   * `began`, a `tick` guarded on `working`, a one-second interval, and a
   * `clearInterval` at each of the several ways out. Three copies of a thing
   * that says how the app is doing is three chances for one of them to say it
   * differently, or to stop saying it at all on the path nobody tested.
   *
   * The sizing is read through a getter rather than passed in, because it is
   * not known yet when the watch starts: the cheap read that produces it is
   * itself part of what the wait is showing.
   */
  function watchWork(tl: TL, sizingNow: () => Sizing, since?: number) {
    // `since` for a run this page did not start: what a person wants to know
    // about work they left running is how long it has been going, not how long
    // this tab has been watching it.
    const began = since ?? Date.now()
    let phase: Phase = 'sizing'
    const tick = () => {
      // it moved on to something else, or finished; either way this is stale
      if (working !== tl.t.id) return
      const sz = sizingNow()
      setWork({
        who: trim(label(tl.t), 34),
        what: sz.why,
        phase,
        needs: sz.needs,
        expect: sz.seconds,
        elapsed: (Date.now() - began) / 1000,
        // a run with nothing to look up is answered inside the request and
        // dies with the page; only the other kind survives being walked away
        // from, and only the other kind may say so
        background: !sz.quick,
      })
    }
    tick()
    const patience = setInterval(tick, 1000)
    return {
      /** where the page has got to — the three states it can actually tell apart */
      at(p: Phase) {
        phase = p
        tick()
      },
      stop() {
        clearInterval(patience)
        setWork(null)
      },
    }
  }
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
    setWorking(id)
    hold('working it in…', trim(label(tl.t), 34))
    const res = await reshapeThought(id, news || 'See the attached picture.', {
      image: img ? { mediaType: img.mediaType, dataB64: img.dataB64 } : undefined,
      spoken: spoken || undefined,
    })
    setWorking(null)
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
      // the three that go away for a minute: one comes back with a way through,
      // one with an answer, one with the work itself — and all three have to
      // survive a locked phone
      if (run.action !== 'deepen' && run.action !== 'answer' && run.action !== 'draft') continue
      const id = subjectOf(run)
      const tl = id ? view.byId.get(id) : null
      if (!id || !tl) {
        // the thought it was about is gone; nothing to land it on
        void markApplied(run.id)
        continue
      }
      if (run.status === 'running') {
        // still out there. Take over the watch, and show it as out.
        setWorking(id)
        /*
         * The longest, least legible wait in the app, and it had one static
         * line for the whole of it. This is a run that has been going since
         * before the page existed — possibly for minutes, through a locked
         * phone — and it now counts from when the run actually started rather
         * than from when this tab noticed it, which is the number a person
         * means when they ask how long it has been.
         *
         * The gauge that sized it lived in the page that started the run and
         * is gone, so there is nothing honest to say about what it went out to
         * check. It says how long instead, and no more.
         */
        const carried: Sizing = { ...fullDepth(0), why: 'picked up where it left off' }
        const watch = watchWork(tl, () => carried, run.createdAt)
        watch.at('out')
        const res = await awaitRun(run.id, { startedAt: run.createdAt })
        if (dead) {
          watch.stop()
          return
        }
        watch.at('landing')
        watch.stop()
        setWorking(null)
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
  /** Whichever of the three it was, folded in and said out loud. */
  function landRun(action: string, tl: TL, runId: string, output: unknown) {
    if (action === 'answer') {
      const res = applyAnswer(tl.t.id, output as Parameters<typeof applyAnswer>[1], runId)
      void markApplied(runId)
      if (res.kind === 'answered') landAnswer(tl, res, true)
      // A question that came back while you were away. It gets an offer rather
      // than a page: the sky does not rearrange itself behind your back, and
      // opening a writing box over a screen you have only just come back to is
      // exactly that.
      else if (res.kind === 'clarify') {
        hold(res.ask, trim(label(tl.t), 34))
        // the reason waits on the page you are one tap from, rather than
        // being a second panel of prose under the first
        offerAction('', 'answer that', () => {
          hold(null)
          pendingClarify = { ask: res.ask, because: res.because, options: res.options }
          const q = posOf(tl.t.id)
          openPage('ask', tl, toScreenX(q.x), toScreenY(q.y))
        })
      }
      return
    }
    if (action === 'draft') {
      const res = applyDraft(tl.t.id, output as Parameters<typeof applyDraft>[1], runId)
      void markApplied(runId)
      if (res.kind === 'drafted') landDraft(tl, res, true)
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
      offerAction('', 'read it', () => {
        hold(null)
        const q = posOf(tl.t.id)
        openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
      })
    }
  }

  async function runDeepen(tl: TL) {
    if (working || S().offline) return
    setWorking(tl.t.id)
    // what hung off it before it went away, so that what it brings back can
    // be told apart from what was already yours — see declineAdded
    const hadKids = new Set(
      S().relationships.filter((r) => r.type === 'part_of' && r.to_id === tl.t.id).map((r) => r.from_id),
    )
    // It really is gone for a minute: the research runs as a background job
    // because it does not fit inside a request. So the notice stands for the
    // whole of that, and counts, rather than blinking once and leaving a
    // glowing drop and silence — which reads as nothing happening.
    // How long this takes is a property of the ask, not of the button, so the
    // notice stops promising a minute for everything. A cheap read decides
    // first, and what it says stands as the wait.
    let sizing: Sizing = { ...fullDepth(4), why: 'sizing it up' }
    const watch = watchWork(tl, () => sizing)
    sizing = await sizeUp(tl.t.id, 'plan', 4)
    if (dead) {
      watch.stop()
      return
    }
    // sized; now it is genuinely away
    watch.at('out')
    // if the drop is a picture, the picture is the thing being asked about
    const img = ex(tl.t).img as string | undefined
    const b64 = img?.includes(',') ? img.split(',')[1] : undefined
    const res = await deepenThought(tl.t.id, {
      image: b64 ? { mediaType: 'image/jpeg', dataB64: b64 } : undefined,
      sizing,
    })
    // back, and what it wrote is going in. A minute of waiting that ends on a
    // bar still at four-fifths reads as a failure; this is the one moment the
    // bar is allowed to close, because it is the one moment it is true.
    watch.at('landing')
    watch.stop()
    setWorking(null)
    if (res.kind === 'failed') {
      // a minute of waiting deserves better than four seconds of apology, and
      // an offer to try again rather than hunting for the button
      hold(res.why ?? 'could not get out there just now', trim(label(tl.t), 34))
      offerAction('', 'again', () => {
        hold(null)
        void runDeepen(tl)
      })
      return
    }
    // the new steps arrive around the thing they belong to
    const gp = posOf(tl.t.id)
    const kids = S().relationships.filter((r) => r.type === 'part_of' && r.to_id === tl.t.id)
    // `slice(-0)` is `slice(0)` — the whole list — so a run that added nothing
    // new would pick every child up and fling it into a fresh ring around the
    // goal, undoing wherever you had put them.
    ;(res.added ? kids.slice(-res.added) : []).forEach((r, i, all) => {
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
    /*
     * Refusing what it added outranks reading what it wrote. Both want the
     * one bar, and only one of them expires: the brief stays on the drop for
     * ever and is one moon away, whereas "these are not mine" is a verdict
     * you make in the moment you first see them. Reading is offered when
     * nothing was added, which is exactly when there is nothing to refuse.
     */
    const fresh = S()
      .relationships.filter((r) => r.type === 'part_of' && r.to_id === tl.t.id && !hadKids.has(r.from_id))
      .map((r) => r.from_id)
    if (fresh.length) declineAdded(fresh)
    else if (briefOf(tl.t.id)) {
      offerAction('', 'read it', () => {
        hold(null)
        const q = posOf(tl.t.id)
        openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
      })
    }
    fitWhenSettled()
  }

  /**
   * Have the thing done.
   *
   * The end of the funnel. Everything else the agent does here is *about* your
   * work — planning it, researching it, moving it around the map — and this is
   * the one that produces some. What comes back is kept as a brief on the step
   * itself, which is where everything the agent makes already lives, so it can
   * be reopened weeks later from the step's own page.
   */
  async function runDraft(tl: TL, intent?: string) {
    if (working || S().offline) return
    setWorking(tl.t.id)
    let sizing: Sizing = { ...fullDepth(2), why: 'reading the task' }
    const watch = watchWork(tl, () => sizing)
    sizing = await sizeUp(tl.t.id, 'draft', 2)
    if (dead) {
      watch.stop()
      return
    }
    // sized; now it is genuinely away
    watch.at('out')
    const res = await draftThought(tl.t.id, { intent, sizing })
    // back, and what it wrote is going in. A minute of waiting that ends on a
    // bar still at four-fifths reads as a failure; this is the one moment the
    // bar is allowed to close, because it is the one moment it is true.
    watch.at('landing')
    watch.stop()
    setWorking(null)
    if (dead) return
    if (res.kind === 'failed') {
      hold(res.why ?? 'could not do that just now', trim(label(tl.t), 34))
      offerAction('', 'again', () => {
        hold(null)
        void runDraft(tl, intent)
      })
      return
    }
    landDraft(tl, res, false)
  }

  function landDraft(
    tl: TL,
    res: Extract<Awaited<ReturnType<typeof draftThought>>, { kind: 'drafted' }>,
    whileAway: boolean,
  ) {
    rebuild()
    paintAll()
    haptics.join()
    record(`made · ${res.title}`, trim(label(tl.t), 40))
    hold(null)
    const q = posOf(tl.t.id)
    // Reading it is the whole point, so it opens. Unless you are somewhere
    // else, in which case the sky does not rearrange itself behind your back.
    if (whileAway || pageFor) {
      hold(whileAway ? `while you were away — ${res.title}` : res.title, trim(label(tl.t), 34))
      offerAction('', 'read it', () => {
        hold(null)
        openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
      })
    } else {
      openPage('brief', tl, toScreenX(q.x), toScreenY(q.y))
      // It said the step is finished. Offered under the open draft, never
      // taken: the agent does not get to tick your list, and it does not get to
      // do it before you have read what it made. Only offered on the branch
      // that opened the draft — otherwise it would replace 'read it' with a
      // tick for something you have not seen.
      if (res.done) {
        offerAction('it says this is done', 'tick it off', () => {
          hideUndo()
          landUndo(complete(tl.t.id))
        })
      }
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
  async function runAnswer(tl: TL, question?: string) {
    if (working || S().offline) return
    setWorking(tl.t.id)
    let sizing: Sizing = { ...fullDepth(3), why: 'sizing it up' }
    const watch = watchWork(tl, () => sizing)
    sizing = await sizeUp(tl.t.id, 'answer', 3)
    if (dead) {
      watch.stop()
      return
    }
    // sized; now it is genuinely away
    watch.at('out')
    const img = ex(tl.t).img as string | undefined
    const b64 = img?.includes(',') ? img.split(',')[1] : undefined
    const res = await answerThought(tl.t.id, {
      question,
      image: b64 ? { mediaType: 'image/jpeg', dataB64: b64 } : undefined,
      sizing,
    })
    // back, and what it wrote is going in. A minute of waiting that ends on a
    // bar still at four-fifths reads as a failure; this is the one moment the
    // bar is allowed to close, because it is the one moment it is true.
    watch.at('landing')
    watch.stop()
    setWorking(null)
    if (dead) return
    if (res.kind === 'failed') {
      hold(res.why ?? 'could not get out there just now', trim(label(tl.t), 34))
      offerAction('', 'again', () => {
        hold(null)
        void runAnswer(tl, question)
      })
      return
    }
    /*
     * It asked instead of answering.
     *
     * The graph is untouched — see applyAnswer — so there is nothing to land
     * and nothing to undo. What there is, is a question with your name on it,
     * and it goes where questions are typed. Straight there rather than into a
     * bar you have to tap: you were waiting on this, you are still holding the
     * phone, and an extra tap between a question and answering it is a tap
     * spent on nothing.
     */
    if (res.kind === 'clarify') {
      hold(null)
      pendingClarify = { ask: res.ask, because: res.because, options: res.options }
      const q = posOf(tl.t.id)
      openPage('ask', tl, toScreenX(q.x), toScreenY(q.y))
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
      offerAction('', 'read it', () => {
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
      // …and nothing comes back up with it. This used to restore the group's
      // actions, which made sense while a tap put them there; now that they
      // only ever come from a hold, resurrecting them here would be the app
      // opening a menu nobody asked for.
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
      /*
       * One neck per drop, and never a chain.
       *
       * The cap on how many joins to draw was not the thing that made a
       * crowded ring look like a smear — chaining was. Four joins that happen
       * to run A–B, B–C, C–D, D–E are not four couplings, they are one long
       * ribbon dragged across five drops, and it reads as a wing or a spill
       * rather than as anything about the drops. Taking the strongest first
       * and skipping any whose ends are already spoken for turns the same
       * budget into discrete pairs, which is what a coupling looks like.
       */
      const spoken = new Set<number>()
      const matched: typeof joins = []
      for (const jn of joins) {
        if (matched.length >= most) break
        if (spoken.has(jn.i) || spoken.has(jn.j)) continue
        spoken.add(jn.i)
        spoken.add(jn.j)
        matched.push(jn)
      }
      for (const jn of matched) {
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
    /** where it stood in the world before you picked it up */
    wx: number
    wy: number
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
  /**
   * The last time a real finger touched the glass.
   *
   * iOS delivers one press twice: the touch, and then the mouse events Safari
   * synthesises after it for pages written before touch existed. Both arrive
   * as pointer events, so the app sees two presses where there was one — which
   * is the "sometimes it acts like a double tap" in this bug, and cannot be
   * fixed by any timing guess, because how long Safari waits before sending
   * the second one varies.
   *
   * So the duplicate is refused at the door: once a touch has been seen, mouse
   * events are ignored for as long as any compatibility event could still be
   * coming. A real mouse on a real desktop is untouched — it never sets this.
   */
  let lastTouchAt = 0
  const GHOST_MS = 900
  const ghost = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      lastTouchAt = performance.now()
      return false
    }
    return e.pointerType === 'mouse' && performance.now() - lastTouchAt < GHOST_MS
  }
  stage.addEventListener('pointerdown', (e) => {
    if (ghost(e)) return
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
    document.body.classList.remove('sky-dragging')
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
            // Where you were standing is where it goes. clearAll() steps out of
            // the open group, and it runs before the page does — so the group
            // has to be read first and handed over, or a note written inside a
            // group lands loose in the sky next to it. Only the actions are
            // cleared when there is a group open: closing the thing you are
            // writing into, to write into it, is the app forgetting mid-gesture.
            const into = openPool
            if (into) closeMoons()
            else clearAll()
            openPage('capture', undefined, b.x, b.y, into)
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
      /** where it stood before you picked it up, for a move that is refused */
      wx: p.x,
      wy: p.y,
      vx: 0,
      vy: 0,
      moved: false,
      touching: false,
      target: null,
      el: bubEl,
    }
    stage.setPointerCapture(e.pointerId)
    if (holdTimer) clearTimeout(holdTimer)
    holdTimer = setTimeout(() => {
      if (drag && !drag.moved) {
        /*
         * Hold, slide, release.
         *
         * Holding a bubble used to try to gather what was like it, which on
         * most things answers "nothing like-minded near it yet" — a gesture
         * whose commonest outcome is being told it did nothing. Gather
         * belongs with the other organising verbs on the group page anyway,
         * which is where the moons' own note says it went.
         *
         * So the hold opens the thing's actions and *keeps your finger*: the
         * one under it lights up, and letting go there does it. No second
         * tap, no aiming twice, and nothing left on the screen afterwards
         * unless you released without choosing.
         */
        const held = drag.tl
        drag.el.classList.remove('dragging')
        drag = null
        showMoons(held, true)
        // the thing itself answering, out of its own rim, and staying with it
        // however it moves for the second that takes — see rouse()
        rouse(held.t.id)
        haptics.grab()
        sliding = true
        aimAt(e.clientX, e.clientY)
      }
    }, 430)
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
    // the finger that opened the menu is still choosing from it
    if (sliding) {
      aimAt(e.clientX, e.clientY)
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
      // While you are carrying something, the app's navigation is noise — and
      // worse than noise, it was drawn on top of the thing in your hand and
      // across the line you were aiming for. See the tab bar's own rule.
      document.body.classList.add('sky-dragging')
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
    // The closer to the water, the more the sea reaches up for it.
    //
    // A group answers to the two edges as well now. It was the only thing in
    // the sky that did not, which made the one gesture that means "this is
    // finished" refuse the very things most likely to be finished — and left
    // the only way to be rid of a whole group behind a fold on its own page.
    // What differs is the landing, not the reach: a drop crosses and it is
    // done, a group crosses and is asked. See the release.
    //
    // The drop, not the finger. You pick a drop up by whatever part of it was
    // under your thumb, so the two are as much as a radius apart — and it is
    // the drop you are watching cross the line, not your hand. Reading the
    // pointer meant the band lit at one moment and the release fired at
    // another, and a gesture whose feedback and whose verdict disagree is a
    // gesture you cannot learn.
    {
      const at = edgeAt(drag.id)
      const line = seaLineAt(at.x, worldTilt(), W)
      const reach = 190
      const near = Math.max(0, Math.min(1, (at.y - (line - reach)) / reach))
      const ready = at.y > line - 12
      showTide(Math.round(near * 20) / 20, ready)
      drag.el.classList.toggle('sinking', ready)
      // …and the other way. The top of the glass, under the clock, is where a
      // thing you have finished goes up. `--sat` because on an installed app
      // that strip is the status bar and nothing can be let go into it.
      const top = SKY_EDGE + sat()
      const up = Math.max(0, Math.min(1, (top + SKY_REACH - at.y) / SKY_REACH))
      const rising = at.y < top
      showUpdraft(Math.round(up * 20) / 20, rising)
      drag.el.classList.toggle('rising', rising)
      // …and the third thing a drag can mean: out of the group it is in. The
      // other two say so while your finger is still down and this one did not,
      // so the first you knew of it was the bar afterwards telling you where
      // the thing had gone.
      drag.el.classList.toggle(
        'leaving',
        drag.isMember && !!drag.memberPool && pastTheRing(drag.id, drag.memberPool),
      )
    }
    drag.target = null
    // at either edge you are letting go, not merging — one signal at a time
    if (skyNear > 0.55) {
      meter.classList.remove('on', 'zero')
      clearFuse()
      drag.touching = false
      return
    }
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
      /*
       * The one already fusing keeps the job while it still qualifies.
       *
       * Nearest-wins re-decided every frame, and the sky moves under a drag —
       * a neighbour shoved half a radius closer at the last moment stole the
       * merge from the bubble you had been hovering over the whole time. That
       * is the mis-merge a playtester described exactly: aimed at one, pooled
       * with another. What you were shown fusing is what you get, until you
       * genuinely carry it out of reach.
       */
      if (fuse && fuse.a === drag.id && best && best.t.id !== fuse.b) {
        const held = candidates.find((tl) => tl.t.id === fuse!.b)
        if (held) {
          const hp = posOf(held.t.id)
          const hd = Math.hypot(hp.x - p.x, hp.y - p.y)
          if (hd < rOf(drag.tl) + rOf(held) + slop) {
            best = held
            bestD = hd
          }
        }
      }
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
        // …and cleared the moment they part. This held its last value: brush
        // past something on the way to open water, and the release still
        // merged you with the thing you had visibly left behind.
        drag.target = touching ? best : null
      } else {
        meter.classList.remove('on', 'zero')
        clearFuse()
        drag.touching = false
        drag.target = null
      }
    }
  })
  // Release is heard at the window, not the stage: a finger that wanders over
  // the tab bar or off the edge still ends its gesture. Pointer capture already
  // routes these through the stage, so this hears each release exactly once.
  const onUp = (e: PointerEvent) => {
    if (ghost(e)) return
    // Whatever that gesture was — a drag, a pan, a tap that opened a group —
    // the arrangement may now be a different one. Cheap: the sky simply
    // re-settles, which takes well under a second and then stops again.
    stir()
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
    /*
     * Released out of a hold. Landing on one of them does it; landing on
     * nothing leaves them up, because a hold that opens a menu and then takes
     * it away when your thumb was a few points short is a gesture that
     * punishes you for using it. From there it is the row it has always been.
     */
    if (sliding) {
      sliding = false
      if (fireAimed()) return
      aimed = null
      return
    }
    if (holding && !holding.auto) {
      endHold(true)
      return
    }
    if (!drag) {
      if (bgDown && Math.hypot(e.clientX - bgDown.x, e.clientY - bgDown.y) < slopFor(e)) {
        // The second half of a double tap can land on open sky, because the
        // first half moved the thing: tapping a group flies the camera to it.
        // The finger did not move, so this is still that gesture.
        const again = doubleHit(e.clientX, e.clientY)
        if (again) {
          bgDown = null
          openThing(again)
          return
        }
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
    d.el.classList.remove('dragging', 'sinking', 'rising', 'leaving')
    document.body.classList.remove('sky-dragging')
    clearFuse()
    hideTide()
    hideUpdraft()
    if (!d.moved) {
      const again = doubleHit(e.clientX, e.clientY)
      if (again) openThing(again)
      else onTap(d.id, d.isMember, { x: e.clientX, y: e.clientY })
      return
    }
    if (d.moved) {
      // the same reading the bands were drawn from, so what you were shown and
      // what happens are the same thing
      const at = edgeAt(d.id)
      const up = at.y < SKY_EDGE + sat()
      const down = at.y > seaLineAt(at.x, worldTilt(), W) - 12
      if (up || down) {
        /*
         * A drop crosses and it is done. A group crosses and is asked.
         *
         * The gesture is the same size either way; what it does is not. One is
         * a thing; the other is that thing and everything under it. Both are
         * undoable — nothing in this app deletes — but an undo you have to
         * notice within a few seconds is a poor guard against a thumb that
         * slipped while moving a cloud out of the way, and a group is the thing
         * you would least like to lose by accident.
         *
         * So it goes back where it stood and the question waits. Nothing has
         * happened yet, and ignoring the bar is a way of answering it.
         */
        if (d.tl.kind === 'pool') {
          const t = d.tl.t
          // Everything that is actually going, not just what the ring shows.
          // The ring counts what a group directly holds; the gesture takes
          // the whole household, so a group of five whose References hold
          // four more asked about five and took nine. The question and the
          // deed have to be the same number.
          const n = household(t.id).length
          const held = n === 1 ? 'and the one inside' : `and the ${n} inside`
          const what = `“${trim(label(t), 18)}” ${held}`
          const p = posOf(d.id)
          p.x = d.wx
          p.y = d.wy
          p.vx = 0
          p.vy = 0
          if (up) offerAction(`Finish ${what}?`, 'finish it', () => riseDrop(t), 9000)
          else offerAction(`Let ${what} go?`, 'let it go', () => sinkDrop(t), 9000)
          return
        }
        if (up) riseDrop(d.tl.t)
        else sinkDrop(d.tl.t)
        persistLayout()
        return
      }
    }
    if (d.isMember && d.memberPool && !d.target && pastTheRing(d.id, d.memberPool)) {
      releaseMember(d.tl.t, d.memberPool)
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
    /*
     * Wherever it ended up, that is where you meant it.
     *
     * Only when it actually went somewhere. `moved` alone is not enough — it
     * turns true on a few pixels of thumb roll, and a tap that happens to
     * wobble is not an opinion about where a drop belongs. Forty pixels is
     * about the smallest move nobody makes by accident.
     *
     * Not for a member being rearranged inside an open pool — that one lives
     * on a ring, and a ring is a layout rather than a place — and not for one
     * that has just been pooled with something else, which is a different act
     * with its own idea of where things go.
     */
    if (!d.isMember && !d.target && d.moved) {
      const p = posOf(d.id)
      if (Math.hypot(p.x - d.wx, p.y - d.wy) > 40) p.pinned = true
    }
    persistLayout()
  }
  const onCancel = (e: PointerEvent) => {
    stir()
    touches.delete(e.pointerId)
    if (touches.size < 2) pinch = null
    panning = false
    panFrom = null
    bgDown = null
    hideTide()
    hideUpdraft()
    if (holdTimer) clearTimeout(holdTimer)
    endHold(false)
    if (drag) drag.el.classList.remove('dragging')
    document.body.classList.remove('sky-dragging')
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
  /**
   * A double tap is two taps in the same *place*, quickly.
   *
   * Not two taps on the same element, which is what this used to be, and the
   * reason it had to be given a window of over a second: the first tap on a
   * group flies the camera to it, so the thing has moved out from under your
   * finger before the second tap lands. Matching on the element meant waiting
   * long enough for you to find it again — and a window that long makes a
   * slow, deliberate second tap, the one that means "show me the actions",
   * indistinguishable from a double tap.
   *
   * A finger does not move. So the *point* is remembered along with what was
   * under it, and a second tap near that point within 400ms is a double tap on
   * whatever the first one hit, wherever that thing has since gone — even if
   * it has gone far enough that the second tap lands on open sky.
   */
  const DOUBLE_MS = 400
  /** …and this close together are one *press*, delivered twice.
   *  The real duplicate — Safari's synthesised mouse event — is refused at the
   *  door by ghost(); this is only the backstop for a doubled touch, so it can
   *  sit just under the fastest a human double tap actually goes. */
  const DUPE_MS = 70
  /** how far a thumb wanders between the two halves of a double tap */
  const DOUBLE_SLOP = 46
  let tapId: string | null = null
  let tapAt = 0
  let tapPt: { x: number; y: number } | null = null
  /**
   * The thing itself — a group's page, a drop's page, a member's page. What
   * the second of two quick taps gets you, from wherever the first one landed.
   */
  function openThing(id: string) {
    closeMoons()
    const tl = view.byId.get(id)
    const p = posOf(id)
    if (tl) {
      openPage('open', tl, toScreenX(p.x), toScreenY(p.y))
      return
    }
    // a member is not in the view index unless its group is open; it is still
    // a thought and it still has a page
    const t = S().thoughts.find((x) => x.id === id)
    if (t) openPage('open', { kind: 'drop', t, members: [] }, toScreenX(p.x), toScreenY(p.y))
  }

  /**
   * Was that the second half of a double tap? If so, what was under the first.
   *
   * Consumed by asking: a third tap in the same place is a new first tap, not
   * a second double.
   */
  function doubleHit(x: number, y: number): string | null {
    if (!tapId || !tapPt) return null
    const dt = performance.now() - tapAt
    if (dt < DUPE_MS || dt >= DOUBLE_MS) return null
    if (Math.hypot(x - tapPt.x, y - tapPt.y) > DOUBLE_SLOP) return null
    const id = tapId
    tapId = null
    tapPt = null
    return id
  }
  /*
   * Said once, the first time a tap lands on something and gets nothing back.
   *
   * Tapping used to put three buttons under everything you touched, which is
   * how anybody ever found out those buttons existed. Now that they belong to
   * the hold, the tap is the moment somebody is asking "what can I do with
   * this?" and the moment to answer it — once per device, then never again.
   */
  function teachMenu() {
    try {
      if (localStorage.getItem('bs-taught-menu')) return
      localStorage.setItem('bs-taught-menu', '1')
      setTimeout(() => say('press and hold anything for what you can do with it'), 900)
    } catch {
      /* private mode — the hold is still there to be found */
    }
  }

  function onTap(id: string, isMember: boolean, at: { x: number; y: number }) {
    /*
     * One tap opens what is inside. A press and hold is what you can do to it.
     *
     * A tap used to be the actions, and so three glass discs appeared under
     * everything you touched — on a screen whose whole argument is that
     * thinking needs room, the commonest gesture in the app spent that room on
     * a menu nobody had asked for. They have moved to the hold, where your
     * finger is already down and can slide straight onto one.
     *
     * What is left to a tap is what a tap is actually for: going in. Open a
     * group, open one of the things in it, put the thing you were reading
     * away. A lone tap on a plain drop now does nothing but clear whatever was
     * up, and that is the point.
     *
     * Whether this was the second of a pair is decided before we get here, by
     * doubleHit(), on the point rather than the element — see it for why.
     */
    tapId = id
    tapAt = performance.now()
    tapPt = at
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
        // anything that was up belonged to whatever you were looking at before
        closeMoons()
        paintAll()
        haptics.grab()
        return
      }
      // open already, and this tap asked for something a tap no longer gives
      teachMenu()
      return
    }
    if (!tl) return
    if (tl.kind === 'pool') {
      // tapping the group you are reading out of puts the card away: the thing
      // it was covering is the obvious place to press to get it back
      if (openPool === tl.t.id && peek) {
        peek = null
        peekAt = null
        closeMoons()
        paintAll()
        return
      }
      if (openPool !== tl.t.id) {
        clearAll()
        openPool = tl.t.id
        // the camera goes to the pool rather than the pool being shoved into
        // whatever part of the sky happens to be on screen
        frameOpen(tl)
        paintAll()
      } else teachMenu()
      return
    }
    clearAll()
    // Nothing visible happened, and that is the one moment worth explaining.
    // Said here rather than on every tap: a tap that opened a group answered
    // itself, and a line telling you about a different gesture on top of that
    // is the app talking over its own reply.
    teachMenu()
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
    // waiting its turn to leave — see Pos.hold and the capture below. A finger
    // on it outranks the queue: catching one mid-burst should move it, not
    // leave it pinned to the point it was born at until its turn comes round.
    if (p.hold) {
      if (!dragged && performance.now() < p.hold) return
      p.hold = undefined
    }
    const k = reduced ? 1 : dragged ? 0.55 : 0.22
    // …toward where it belongs *plus* its breath. The breath is an offset
    // rather than a push — see Pos.bx — so it shows without ever moving the
    // place the drop is actually standing in.
    // Never under a finger: three pixels between the touch and the thing being
    // touched is three pixels of the app not doing what your hand is doing.
    const bx = dragged ? 0 : p.bx
    const by = dragged ? 0 : p.by
    p.rx += (p.x + bx - p.rx) * k
    p.ry += (p.y + by - p.ry) * k
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
  function echoPath(): SVGPathElement {
    let el = echoPool[echoUsed]
    if (!el) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      echoG.appendChild(el)
      echoPool.push(el)
    }
    return el
  }
  const ECHO_LAYERS = 4

  /*
   * One burst, thrown out by the thing you have just taken hold of.
   *
   * This used to be an overlay: an SVG hung on the body at the point the
   * gesture happened, in viewport coordinates, sized once. Measured in a still
   * sky it landed on the bubble to the pixel — and on a real one it did not,
   * because a bubble is never where you left it. It breathes, the constellation
   * re-centres for a second after anything changes, a member of an open group
   * is going round, and the camera flies. Over the second the rings take to
   * travel the thing that sent them walks out from under them, and what you see
   * is rings sitting in open sky next to the bubble you pressed.
   *
   * So it belongs where everything else that belongs to a bubble belongs: in
   * the world, redrawn every frame from the thing's live position. It cannot
   * come from anywhere else now, because there is nowhere else for it to be.
   */
  let burst: { id: string; at: number } | null = null
  /** how far past the rim each ring gets */
  const BURST_REACH = [17, 41, 72, 110]
  /** …and how long after the press it sets off, in seconds */
  const BURST_WAIT = [0, 0.1, 0.21, 0.33]
  const BURST_LIFE = 1.15
  function rouse(id: string) {
    if (reduced) return
    burst = { id, at: t }
  }
  function drawBurst() {
    if (!burst) return
    const tl = view.byId.get(burst.id)
    const age = t - burst.at
    if (!tl || age > BURST_LIFE + BURST_WAIT[BURST_WAIT.length - 1]) {
      burst = null
      return
    }
    const p = posOf(burst.id)
    // off the rim of what you are actually looking at: an opened group is its
    // whole orbit, and rings leaving the little disc in the middle of one
    // cross its members on the way out and read as unrelated
    const open = openPool === burst.id
    const r0 = open
      ? Math.max(orbitR(tl), ringR) + memberR(tl.members.length)
      : radiusOf(tl) * p.s
    const h = hashN(burst.id)
    for (let i = 0; i < BURST_REACH.length; i++) {
      const u = (age - BURST_WAIT[i]) / BURST_LIFE
      if (u <= 0 || u >= 1) continue
      // out fast, then easing off, the way a wave loses its push
      const travel = 1 - Math.pow(1 - u, 2.4)
      const el = echoPath()
      el.setAttribute('d', echoRing(p.rx, p.ry, r0 + BURST_REACH[i] * travel, h + i * 2.7, 0.05 + i * 0.014))
      el.style.opacity = (0.62 * (1 - u) * (1 - i * 0.12)).toFixed(3)
      el.style.strokeWidth = (1.3 - i * 0.12).toFixed(2)
      echoUsed++
    }
  }
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
      const el = echoPath()
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
    const rest = () => {
      for (let i = echoUsed; i < echoPool.length; i++) echoPool[i].style.opacity = '0'
    }
    // first, because it is the one ring in this sky that is answering
    // something you just did
    drawBurst()
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
      rest()
      return
    }
    push(holding?.id, 0.4)
    /*
     * The thing with its actions open used to pulse here too, at 0.3.
     *
     * That ring is ambient: it is capped at 76 world units and grows to more
     * than twice that, so on a group it is most of the glass — you never see
     * the ring, only two arcs entering and leaving the screen, and nothing in
     * their curvature says where they came from. Harmless as weather behind a
     * sky that was doing nothing else.
     *
     * It stopped being harmless when the hold started answering with a ripple
     * off the thing's own rim. Two answers to one event, one of them tight and
     * legible and the other a pair of screen-crossing arcs from the same
     * place — and the arcs are what you read, because they are bigger. So the
     * ripple is the answer now, and this is not a second one.
     */
    /*
     * …and nothing else, while you have hold of one.
     *
     * Whatever has gone ripe keeps a quiet pulse of its own — kept to a few,
     * or a full sky of ripe drops turns the echo into scratches. Ambient, and
     * fine as ambience. But the moment a finger is held on something, that
     * thing sends a ripple out of its own rim, and unrelated drops ringing
     * elsewhere at the same instant are rings arriving from somewhere other
     * than the one you pressed. The sky goes quiet while you are holding
     * something, and comes back the moment you let go.
     */
    if (!moonsFor && !holding) {
      let ripe = 0
      for (const tl of view.tls) {
        if (ripe >= 3) break
        if (tl.kind === 'drop' && isRipe(tl.t) && !seen.has(tl.t.id)) {
          push(tl.t.id, 0.1)
          ripe++
        }
      }
    }
    rest()
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
  /** how many drops have condensed in so far — their stagger, see .arrive */
  let arriving = 0
  /*
   * A sky that finishes settling, and then stops.
   *
   * The layout is three forces — kin drawn together, bodies held apart, the
   * constellation nudged back into frame — and none of them had a state
   * called "done". Every frame, for ever, each pair was re-adjudicated, so a
   * sky nobody had touched for twelve seconds churned: measured, forty pixels
   * of wander on the worst drop and twenty-eight on the median, with the
   * centroid moving nine and the spread oscillating by three. The drops were
   * mostly moving *around* each other, which is what a force-directed layout
   * does when no equilibrium exists — and it makes aiming at one a
   * moving-target game, which is exactly how it was reported.
   *
   * So: how much the layout actually moved things this frame, how many frames
   * running it has been negligible, and whether it has therefore gone quiet.
   * `stir` wakes it — anything that changes what the layout is a layout *of*.
   * The breath is untouched: it is an offset, never a position, so a settled
   * sky still breathes.
   */
  let quiet = 0
  let settled = false
  /** …something changed; work out the arrangement again. */
  function stir() {
    quiet = 0
    settled = false
  }
  /** Below this much total movement in a frame, the sky is not really moving. */
  const STILL = 0.55
  /** …and it has to stay that way for this long before we believe it. */
  const STILL_FRAMES = 36
  /** How far past its rest length a pair may sit before the spring cares. */
  const KIN_SLACK = 22
  function step() {
    if (dead) return
    t += 0.016
    stepHold()
    const busy = drag || holding || pageFor
    if (!busy) {
      /*
       * The sky breathes — three pixels, not a hundred.
       *
       * Written as the offset it always meant to be. The old line added a sine
       * to the position every frame, which integrates rather than wobbles: it
       * carried every drop forty-odd pixels out in each axis and slowly back,
       * over about seventy seconds, for as long as the app was open. Measured
       * on the built app at up to 101 pixels of travel from a standing start,
       * which is the drift.
       *
       * The frequency is up and the amplitude is down: a breath you can see
       * has to be quick enough to read as breathing. Eleven seconds a cycle at
       * three pixels reads as alive; seventy seconds at a hundred reads as
       * things wandering off.
       */
      view.tls.forEach((tl, i) => {
        if (moonsFor === tl.t.id) {
          const p = posOf(tl.t.id)
          // the one you have opened stands still, the way it always did
          p.bx = p.by = 0
          return
        }
        const p = posOf(tl.t.id)
        const b = breath(t, i)
        p.bx = b.x
        p.by = b.y
      })
      /*
       * Everything below arranges the sky, and it only runs while the sky
       * still needs arranging. `moved` is what it actually did this frame.
       */
      let moved = 0
      for (const pair of settled ? [] : allKinPairs()) {
        if (moonsFor && (moonsFor === pair.a.t.id || moonsFor === pair.b.t.id)) continue
        const pa = posOf(pair.a.t.id)
        const pb = posOf(pair.b.t.id)
        // Both ends have to be unarranged for the spring to mean anything.
        // Pulling a pinned drop toward a loose one is the app moving the thing
        // you placed rather than the thing you did not — see Pos.pinned.
        if (pa.pinned && pb.pinned) continue
        const dx = pb.x - pa.x
        const dy = pb.y - pa.y
        const dist = Math.hypot(dx, dy) || 1
        const bonded = hasThread(pair.a.t.id, pair.b.t.id)
        const rest = radiusOf(pair.a) + radiusOf(pair.b) + (bonded ? 44 : 70)
        /*
         * "Near enough" is a real answer, and it did not have one.
         *
         * The spring pulled at any distance over `rest`, so a pair three
         * pixels too far apart was corrected for ever — and a drop belongs to
         * several pairs at once with rest lengths that cannot all be true, so
         * the corrections fought and the sky churned. A band of slack means a
         * pair that is close enough is simply left alone, which is what lets
         * the whole arrangement come to rest.
         */
        if (dist > rest + KIN_SLACK) {
          // score runs 0…1 where the old shared-word count ran 1…4, so it is
          // scaled back up to the same range of pull
          const pull = Math.min(0.4, (dist - rest) * 0.0012 * (1 + pair.score * 6 + (bonded ? 2 : 0)))
          // The pinned end does not move; the other end closes at its own
          // ordinary rate. Doubling it to keep the closing speed the same was
          // the wrong trade — what it looked like was every loose drop
          // sprinting at the one you had just put down.
          const ka = pa.pinned ? 0 : 1
          const kb = pb.pinned ? 0 : 1
          pa.x += (dx / dist) * pull * ka
          pa.y += (dy / dist) * pull * ka
          pb.x -= (dx / dist) * pull * kb
          pb.y -= (dy / dist) * pull * kb
          moved += pull * (ka + kb)
        }
      }
      // nothing may overlap. Several soft passes settle a crowded sky without
      // the jitter a single hard shove produces.
      for (let pass = 0; pass < (settled ? 0 : 3); pass++) {
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
              moved += push * 2
            }
          }
        }
      }
      // The constellation drifts back into frame as a whole — a uniform nudge,
      // so your own arrangement is preserved, just re-centred. "Frame" means
      // what the camera is actually showing: aiming at a fixed point in the
      // world instead put this in a tug of war with fitAll, and drops ended up
      // pushed off the edge of a sky that had just framed them.
      if (!settled && view.tls.length && !openPool && !drag && !panning && !pinch && !camTarget) {
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
        // A quarter of a pixel is not a re-framing, it is a creep: measured,
        // this alone walked the whole constellation nine pixels across twelve
        // seconds of nobody touching anything, and being asymptotic it never
        // arrived. Below this it has done its job.
        if (Math.abs(dx) > 0.06 || Math.abs(dy) > 0.06) {
          for (const tl of view.tls) {
            const p = posOf(tl.t.id)
            p.x += dx
            p.y += dy
          }
          moved += (Math.abs(dx) + Math.abs(dy)) * view.tls.length
        }
      }
      // …and if that was all next to nothing, for long enough, the sky is
      // arranged. It stops until something changes it — see stir.
      if (!settled) {
        if (moved < STILL) {
          if (++quiet >= STILL_FRAMES) settled = true
        } else quiet = 0
      }
      for (const tl of view.tls) {
        const p = posOf(tl.t.id)
        coast(p)
        // Not the one under your finger.
        //
        // The world has edges and everything inside it is held away from them
        // — which is right for a sky that settles, and exactly wrong for the
        // two gestures whose whole purpose is to carry something *out*. The
        // ceiling sits at the drop's own radius in world space, and once the
        // camera has moved (framing an open pool, say) that lands well below
        // the finishing line on the glass: you drag up, the drop stops dead
        // short of a line it can never reach, and the app looks broken.
        if (drag?.id === tl.t.id) continue
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
            // …and the same exemption. Most drops live inside a group, so a
            // member that cannot leave the world is a member that can never be
            // finished or let go — which is to say most of them.
            if (drag?.id !== m.id) {
              if (worldW() > hx * 2) mp.x = Math.max(hx, Math.min(worldW() - hx, mp.x))
              if (worldH() > hy * 2) mp.y = Math.max(hy, Math.min(worldH() - hy, mp.y))
            }
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
      // it has a place now, so it may be seen — see mountEl
      if (el.style.visibility) {
        el.style.visibility = ''
        /*
         * …and it condenses rather than appears.
         *
         * The same arrival the app's own name makes in the opening: out of
         * focus and gathering — blur to nothing, opacity coming on, its own
         * grain dissolving with it. Started here rather than at mount because
         * this is the first frame the drop is in the right place; a class
         * added any earlier animates a thing standing at the origin.
         *
         * Staggered by the order they are revealed in, capped at ten slots so
         * that a sky of thirty is still weather forming rather than a queue.
         * Cleared on the way out: `filter` on thirty elements is not something
         * to leave lying around, and the arrival happens once.
         */
        if (!reduced) {
          // Vapour until the curtain moves. The drop is placed and sized and
          // simply not water yet; `whenCurtainLifts` turns it, so the name
          // going out of focus and the drops coming into it are one movement
          // rather than two that happened to be near each other.
          el.classList.add('vapour')
          // Staggered only for the sky you open onto. A drop written later
          // arrives on its own and has no queue to be part of — and the
          // counter would otherwise climb all session and hand the twentieth
          // thing you wrote half a second of nothing.
          el.style.setProperty('--n', String(curtainLifted() ? 0 : Math.min(9, arriving++)))
          whenCurtainLifts(() => {
            el.classList.remove('vapour')
            el.classList.add('arrive')
            el.addEventListener('animationend', () => el.classList.remove('arrive'), { once: true })
          })
        }
      }
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
    // The sky is on the glass — every drop placed, sized and visible. The
    // opening waits for this before it dissolves, so the curtain never lifts
    // on an empty sky. Latched, so it is only ever the first frame.
    markSkyReady()
    raf = requestAnimationFrame(step)
  }

  // ---------- boot ----------
  //
  // Frame first, then draw. The order used to be the other way round with a
  // 60ms timer in between, which meant the first thing you saw on every visit
  // to the sky was one frame of the whole world at the wrong zoom and in the
  // wrong place, and then a hard snap into position — the pop. contentBox()
  // only reads positions and radii, so there is nothing to wait for: the
  // camera can be right before a single drop is painted.
  rebuild()
  fitAll(false)
  paintAll()
  // …and again once the physics have stopped shuffling things, animated this
  // time, so a sky that settled a little wider is eased back into frame.
  setTimeout(() => fitAll(), 900)
  let lastCount = view.tls.length
  let fitSoon: ReturnType<typeof setTimeout> | null = null
  function fitWhenSettled() {
    if (fitSoon) clearTimeout(fitSoon)
    fitSoon = setTimeout(() => fitAll(), 850)
  }
  const unsub = useGraph.subscribe(() => {
    // what the layout is a layout *of* has changed
    stir()
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
  /**
   * A link to one thought, from outside the sky.
   *
   * `/thought/:id` used to be a screen of its own — its own editor, its own
   * relationship list, its own four actions, its own model of what a thought
   * was. It is one link now, and it lands here: the drop itself, in the world,
   * with everything the app can do to it hanging off it.
   */
  function openArrivedThought(): boolean {
    if (dead || pageFor) return false
    const want = new URLSearchParams(location.search).get('open')
    if (!want) return false
    history.replaceState(null, '', location.pathname)
    const tl = view.byId.get(want)
    if (!tl) return false
    focusOn(posOf(want))
    openPage('open', tl, W / 2, innerHeight / 2)
    return true
  }
  const wanted = openArrivedBrief() || openArrivedThought()
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
    releaseHold()
    stopWatching()
    stopArranging()
    // leaving the sky is one of the ways typing stops; the timer it was
    // waiting on is about to be thrown away with everything else here
    flushEdits()
    if (draftT) clearTimeout(draftT)
    removeEventListener('resize', onResize)
    removeEventListener('pointerup', onUp)
    removeEventListener('tab-again', tabAgain)
    removeEventListener('pointercancel', onCancel)
    vv?.removeEventListener('resize', measureKeyboard)
    vv?.removeEventListener('scroll', measureKeyboard)
    if (deafT) clearTimeout(deafT)
    document.documentElement.style.removeProperty('--kb')
    document.body.classList.remove('sky-held')
    // leaving the sky with a page or a photo open would strand the hem on the
    // wrong colour, on a tab that is not even the sky any more
    document.body.classList.remove('on-paper')
    document.body.classList.remove('on-photo')
    document.body.classList.remove('sky-resting')
    document.body.classList.remove('sky-offering')
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
