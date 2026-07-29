// The Sky — the app's home. The interface IS the water world from the
// prototype: glass drops backed by real thoughts, pools backed by goals,
// threads backed by relationships, the ocean backed by done, the high
// clouds backed by snooze. No cards, no forms — hold the sky and write.
import { useEffect, useRef } from 'react'
import { useGraph } from '@/store/graph'
import { parseCapture } from '@/domain/parse-blocks'
import { runAction } from '@/ai/client'
import type { ClassifyOutput } from '@shared/ai/actions/classify-thought'
import { absorbText } from './absorbFlow'
import { waterlineY } from '@/world/water'
import type { Thought } from '@/domain/types'
import './sky.css'

export default function SkyPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => mountSky(rootRef.current as HTMLDivElement), [])
  return (
    <div ref={rootRef}>
      <div className="sky-stage" data-sky="stage">
        <svg className="sky-links" data-sky="links" aria-hidden="true" />
        <div data-sky="field" />
      </div>
      <header className="sky-head">
        <div className="hint" data-sky="hint" />
      </header>
      <div className="sky-meter" data-sky="meter" aria-hidden="true" />
      <button className="sky-rest" data-sky="rest" aria-label="Resting thoughts">
        ☁
      </button>
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
              aria-label="Absorb into the sky"
              title="Let the sky rearrange instead of adding duplicates"
            >
              <Ico d="M12 3.2c.7 4.2 1.9 5.4 6.1 6.1-4.2.7-5.4 1.9-6.1 6.1-.7-4.2-1.9-5.4-6.1-6.1 4.2-.7 5.4-1.9 6.1-6.1ZM17.6 15.2c.35 2 .95 2.6 2.95 2.95-2 .35-2.6.95-2.95 2.95-.35-2-.95-2.6-2.95-2.95 2-.35 2.6-.95 2.95-2.95Z" />
            </button>
            <button className="tool" data-sky="pageLater" aria-label="Let it rest">
              <Ico d="M7.2 18.4a4.2 4.2 0 0 1-.5-8.37 5.6 5.6 0 0 1 10.75-1.2 3.8 3.8 0 0 1 .35 7.55 4 4 0 0 1-.6.04H7.2Z" />
            </button>
            <span className="note" data-sky="pageN" />
          </div>
          <button className="done" data-sky="pageD">
            Done
          </button>
        </div>
      </div>
      <input type="file" data-sky="pageFile" accept="image/*" style={{ display: 'none' }} />
    </div>
  )
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
}

const QUESTIONS = [
  'What makes this one matter?',
  'What is the smallest true version?',
  'Who is it really for?',
]
const STOP = new Set(['what', 'when', 'where', 'which', 'would', 'could', 'should', 'about', 'with', 'this', 'that', 'than', 'then', 'like', 'look', 'from', 'have', 'over', 'into', 'your', 'their', 'there', 'they', 'want', 'need', 'make', 'build', 'helps', 'really', 'thing', 'something', 'anything'])
const STRONG = 2

// the same drawn family as the page tools — no stray emoji in the sky
const MOON_ICONS: Record<string, string> = {
  grow: 'M12 3.4c.72 4.3 1.94 5.52 6.24 6.24-4.3.72-5.52 1.94-6.24 6.24-.72-4.3-1.94-5.52-6.24-6.24 4.3-.72 5.52-1.94 6.24-6.24ZM17.7 15.6c.32 1.9.88 2.46 2.78 2.78-1.9.32-2.46.88-2.78 2.78-.32-1.9-.88-2.46-2.78-2.78 1.9-.32 2.46-.88 2.78-2.78Z',
  gather: 'M3.2 12h5.4M20.8 12h-5.4M6.2 9.2 8.9 12l-2.7 2.8M17.8 9.2 15.1 12l2.7 2.8',
  rain: 'M7.6 13.6a3.7 3.7 0 0 1-.44-7.37 4.95 4.95 0 0 1 9.5-1.06 3.36 3.36 0 0 1 .3 6.67 3.6 3.6 0 0 1-.53.03H7.6M8.4 16.4l-1 3M13 16.4l-1 3M17.6 16.4l-1 3',
}
function moonSvg(key: string) {
  return (
    `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">` +
    `<path d="${MOON_ICONS[key] ?? MOON_ICONS.grow}" stroke="currentColor" stroke-width="1.5" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}

function mountSky(root: HTMLDivElement) {
  const $ = <T extends HTMLElement>(k: string) => root.querySelector(`[data-sky="${k}"]`) as T
  const stage = $('stage')
  const field = $('field')
  const links = root.querySelector('[data-sky="links"]') as unknown as SVGSVGElement
  const hint = $('hint')
  const meter = $('meter')
  const restEl = $('rest')
  const undoEl = $('undo')
  const undoLb = $('undoLb')
  const undoGo = $('undoGo')
  const page = $('page')
  const pageQ = $('pageQ')
  const pageT = $<HTMLTextAreaElement>('pageT')
  const pageA = $('pageA')
  const pageN = $('pageN')
  const pageD = $('pageD')
  const pageX = $('pageX')
  const pageMic = $('pageMic')
  const pagePic = $('pagePic')
  const pageAbsorb = $('pageAbsorb')
  const pageLater = $('pageLater')
  const pageFile = root.querySelector('[data-sky="pageFile"]') as HTMLInputElement

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const S = () => useGraph.getState()
  const todayISO = () => new Date().toISOString().slice(0, 10)
  const ex = (t: Thought) => (t.extra ?? {}) as Record<string, unknown>
  const label = (t: Thought) => t.title || t.raw_content
  const answersOf = (t: Thought) => (ex(t).answers as string[] | undefined) ?? []
  const isKept = (t: Thought) => ex(t).kept === true
  const isRipe = (t: Thought) => !isKept(t) && answersOf(t).length >= 1
  const imgOf = (t: Thought) => ex(t).img as string | undefined
  const patchExtra = (t: Thought, patch: Record<string, unknown>) =>
    S().updateThought(t.id, { extra: { ...ex(t), ...patch } })

  let W = innerWidth
  let H = stage.clientHeight || innerHeight
  const onResize = () => {
    W = innerWidth
    H = stage.clientHeight || innerHeight
  }
  addEventListener('resize', onResize)

  // ---------- world view over the store ----------
  let ver = 0
  let view: { tls: TL[]; byId: Map<string, TL>; threads: { a: string; b: string; id: string }[] } = {
    tls: [],
    byId: new Map(),
    threads: [],
  }
  function rebuild() {
    const s = S()
    const open = s.thoughts.filter((t) => t.status === 'open')
    const goals = open.filter((t) => t.type === 'goal')
    const goalIds = new Set(goals.map((g) => g.id))
    const memberOf = new Map<string, string>()
    for (const r of s.relationships) {
      if (r.type === 'part_of' && goalIds.has(r.to_id)) memberOf.set(r.from_id, r.to_id)
    }
    const membersByGoal = new Map<string, Thought[]>()
    for (const t of open) {
      const g = memberOf.get(t.id)
      if (g && t.type !== 'goal') {
        if (!membersByGoal.has(g)) membersByGoal.set(g, [])
        ;(membersByGoal.get(g) as Thought[]).push(t)
      }
    }
    const tls: TL[] = [
      ...open
        .filter((t) => t.type !== 'goal' && !memberOf.has(t.id))
        .map((t) => ({ kind: 'drop' as const, t, members: [] })),
      ...goals.map((g) => ({ kind: 'pool' as const, t: g, members: membersByGoal.get(g.id) ?? [] })),
    ]
    const byId = new Map(tls.map((tl) => [tl.t.id, tl]))
    const topIds = new Set(byId.keys())
    const threads = s.relationships
      .filter((r) => r.type === 'relates_to' && topIds.has(r.from_id) && topIds.has(r.to_id))
      .map((r) => ({ a: r.from_id, b: r.to_id, id: r.id }))
    view = { tls, byId, threads }
    ver++
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
      p = { x, y, rx: x, ry: y, s: 1, vx: 0, vy: 0 }
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
  const wordCache = new Map<string, Set<string>>()
  let wordV = -1
  function tlWords(tl: TL): Set<string> {
    if (wordV !== ver) {
      wordCache.clear()
      wordV = ver
    }
    const hit = wordCache.get(tl.t.id)
    if (hit) return hit
    let w: Set<string>
    if (tl.kind === 'drop') w = words(label(tl.t) + ' ' + answersOf(tl.t).join(' '))
    else {
      w = words(label(tl.t))
      for (const m of tl.members) for (const x of words(label(m))) w.add(x)
    }
    wordCache.set(tl.t.id, w)
    return w
  }
  function kinOf(tl: TL) {
    const mine = tlWords(tl)
    const out: { tl: TL; shared: number }[] = []
    for (const other of view.tls) {
      if (other.t.id === tl.t.id) continue
      let shared = 0
      for (const w of tlWords(other)) if (mine.has(w)) shared++
      if (shared > 0) out.push({ tl: other, shared })
    }
    return out.sort((a, b) => b.shared - a.shared)
  }
  let kinCache: { v: number; pairs: { a: TL; b: TL; shared: number }[] } = { v: -1, pairs: [] }
  function allKinPairs() {
    if (kinCache.v === ver) return kinCache.pairs
    const pairs: { a: TL; b: TL; shared: number }[] = []
    for (let i = 0; i < view.tls.length; i++) {
      const wi = tlWords(view.tls[i])
      for (let j = i + 1; j < view.tls.length; j++) {
        let shared = 0
        for (const w of tlWords(view.tls[j])) if (wi.has(w)) shared++
        if (shared > 0) pairs.push({ a: view.tls[i], b: view.tls[j], shared })
      }
    }
    kinCache = { v: ver, pairs: pairs.sort((a, b) => b.shared - a.shared).slice(0, 12) }
    return kinCache.pairs
  }
  function hasThread(a: string, b: string) {
    return view.threads.some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a))
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
    return first.slice(0, 2).join(' ') || 'Pool'
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
    el.className = cls + (reduced ? '' : ' pop')
    el.dataset.id = id
    field.appendChild(el)
    els.set(id, el)
    return el
  }
  function unmountEl(id: string) {
    els.get(id)?.remove()
    els.delete(id)
  }
  function memberR() {
    return 50
  }
  function paintDropEl(t: Thought, el: HTMLDivElement, r: number, asMember: boolean) {
    el.style.width = el.style.height = r * 2 + 'px'
    el.classList.toggle('saturated', isRipe(t))
    el.classList.toggle('member', asMember)
    el.classList.toggle('small', r < 50)
    const dots = answersOf(t).length
      ? `<div class="dots">${'<i></i>'.repeat(Math.min(3, answersOf(t).length))}</div>`
      : ''
    const st = isRipe(t)
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
  function paintAll() {
    const alive = new Set<string>()
    for (const tl of view.tls) {
      alive.add(tl.t.id)
      const el = els.get(tl.t.id) ?? mountEl(tl.t.id, tl.kind === 'pool' ? 'skyb pool' : 'skyb')
      el.classList.toggle('pool', tl.kind === 'pool')
      // an open pool takes the stage; everything else steps back
      el.classList.toggle('recede', !!openPool && openPool !== tl.t.id)
      if (tl.kind === 'pool') {
        const r = radiusOf(tl)
        el.style.width = el.style.height = r * 2 + 'px'
        const shifted = isKept(tl.t) && !!ex(tl.t).planSig && ex(tl.t).planSig !== sigOf(tl)
        const open = openPool === tl.t.id
        const st = open
          ? ''
          : shifted
            ? 'the sky shifted'
            : isKept(tl.t)
              ? 'has a path'
              : `${tl.members.length} inside`
        const next = tl.members[0]
        const peek = !open && next ? `<div class="peek"></div>` : ''
        el.innerHTML =
          `<div class="t" style="font-weight:600"></div>` + peek + (st ? `<div class="state ${shifted ? 'blue' : ''}"></div>` : '')
        const nameEl = el.querySelector('.t') as HTMLDivElement
        nameEl.style.fontSize = Math.round(Math.max(12, Math.min(18, 7 + r * 0.1)) * 10) / 10 + 'px'
        nameEl.textContent = label(tl.t)
        if (st) (el.querySelector('.state') as HTMLDivElement).textContent = st
        if (peek) (el.querySelector('.peek') as HTMLDivElement).textContent = '→ ' + trim(label(next), 34)
      } else {
        paintDropEl(tl.t, el, radiusOf(tl), false)
      }
      // open pool renders its members in orbit
      if (tl.kind === 'pool' && openPool === tl.t.id) {
        for (const m of tl.members) {
          alive.add(m.id)
          const me = els.get(m.id) ?? mountEl(m.id, 'skyb')
          me.classList.remove('recede')
          paintDropEl(m, me, memberR(), true)
        }
      }
    }
    for (const [id] of els) if (!alive.has(id)) unmountEl(id)
    const resting = S().thoughts.filter((t) => t.status === 'snoozed').length
    restEl.textContent = `☁ ${resting} resting`
    restEl.classList.toggle('show', resting > 0)
    // first-run invite
    inviteEl.style.display = view.tls.length === 0 ? '' : 'none'
  }

  // the question bubble — pure invitation, not a stored thought
  const inviteEl = document.createElement('div')
  inviteEl.className = 'skyb'
  inviteEl.dataset.id = '__invite'
  inviteEl.style.width = inviteEl.style.height = '192px'
  inviteEl.innerHTML = `<div class="q">What’s on your mind?</div>`
  field.appendChild(inviteEl)
  const invitePos: Pos = { x: W / 2, y: H * 0.34, rx: W / 2, ry: H * 0.34, s: 1, vx: 0, vy: 0 }

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
  function say(msg: string) {
    hint.textContent = msg
    hint.style.opacity = '1'
    if (sayT) clearTimeout(sayT)
    sayT = setTimeout(() => {
      hint.style.opacity = '0'
    }, 4200)
  }

  // ---------- undo / ocean / clouds ----------
  let undoFn: (() => void) | null = null
  let undoT: ReturnType<typeof setTimeout> | null = null
  function offerUndo(lb: string, fn: () => void) {
    undoLb.textContent = lb
    undoFn = fn
    undoEl.classList.add('show')
    if (undoT) clearTimeout(undoT)
    undoT = setTimeout(() => hideUndo(), 6000)
  }
  function hideUndo() {
    undoEl.classList.remove('show')
    undoFn = null
  }
  undoGo.addEventListener('click', () => {
    if (!undoFn) return
    const f = undoFn
    hideUndo()
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
      el.style.transition = 'transform 720ms cubic-bezier(0.5, 0, 0.8, 0.6), opacity 720ms'
      el.style.transform = `translate3d(${p.x - 20}px, ${waterlineY() + 6}px, 0) scale(0.22)`
      el.style.opacity = '0'
      setTimeout(() => el.remove(), reduced ? 0 : 760)
    }
    setTimeout(() => splash(p.x), reduced ? 0 : 480)
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
  restEl.addEventListener('click', () => {
    for (const t of S().thoughts) {
      if (t.status === 'snoozed') S().updateThought(t.id, { status: 'open', snooze_until: null })
    }
    say('the clouds part — they return')
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
  function poolTogether(a: TL, b: TL, at: { x: number; y: number }) {
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
      S().addRelationship(drop.t.id, pool.t.id, 'part_of')
      say(`absorbed into “${label(pool.t)}”`)
    } else {
      const name = conceptName([label(a.t), label(b.t)])
      const g = S().addThought({ raw_content: name, title: name, type: 'goal' })
      const p = posOf(g.id)
      p.x = p.rx = at.x
      p.y = p.ry = at.y
      S().addRelationship(a.t.id, g.id, 'part_of')
      S().addRelationship(b.t.id, g.id, 'part_of')
      say(`pooled — “${name}”`)
    }
    splash(at.x)
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
      .filter((k) => k.shared >= STRONG || !hasThread(tl.t.id, k.tl.t.id))
    if (!kin.length) {
      say('nothing like-minded nearby yet')
      return
    }
    closeMoons()
    holding = { id: tl.t.id, auto, started: performance.now() }
    els.get(tl.t.id)?.classList.add('holding')
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
      const strong = k.shared >= STRONG
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
      if (k.shared >= STRONG) {
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
    } else say('they drift near — but nothing binds yet')
  }

  // ---------- the light page ----------
  type PageMode = 'capture' | 'grow' | 'edit' | 'path'
  let pageFor: { mode: PageMode; tl?: TL; ox: number; oy: number } | null = null
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
  function openPage(mode: PageMode, tl: TL | undefined, ox: number, oy: number) {
    pageFor = { mode, tl, ox, oy }
    pageA.style.display = 'none'
    pageA.innerHTML = ''
    pageT.style.display = mode === 'path' ? 'none' : ''
    page.classList.toggle('path', mode === 'path')
    pageD.textContent = mode === 'path' ? (tl && isKept(tl.t) ? 'Keep it' : 'Keep this path') : 'Done'
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
    } else if (mode === 'capture') {
      pageQ.textContent = 'What’s on your mind?'
      pageT.value = ''
      pageT.placeholder = 'Let it storm.'
      pageN.textContent = 'a line, a drop'
    } else if (mode === 'grow' && tl) {
      pageQ.textContent = QUESTIONS[answersOf(tl.t).length] || 'What else wants to be said?'
      pageT.value = ''
      pageT.placeholder = 'Answer with as much or as little as you have…'
      pageN.textContent = trim(label(tl.t), 46)
    } else if (tl) {
      pageQ.textContent = 'Inside this drop'
      pageT.value = tl.t.raw_content
      pageT.placeholder = ''
      pageN.textContent = answersOf(tl.t).length ? '' : 'edits are kept'
      const answers = answersOf(tl.t)
      if (imgOf(tl.t) || answers.length) {
        pageA.style.display = 'block'
        pageA.innerHTML =
          (imgOf(tl.t) ? `<img alt="the photo in this drop" />` : '') +
          (answers.length ? `<div class="lab">what it has absorbed</div>` + answers.map(() => `<div class="a"></div>`).join('') : '')
        const im = pageA.querySelector('img')
        if (im && imgOf(tl.t)) im.src = imgOf(tl.t) as string
        ;[...pageA.querySelectorAll('.a')].forEach((el, i) => ((el as HTMLElement).textContent = answers[i]))
      }
    }
    pageMic.classList.toggle('show', speechOK && (mode === 'capture' || mode === 'grow'))
    pageMic.classList.remove('live')
    pagePic.classList.toggle('show', mode === 'capture')
    pageAbsorb.classList.toggle('show', mode === 'capture' && !S().offline && S().thoughts.filter((t) => t.status === 'open').length >= 3)
    pageLater.classList.toggle('show', mode === 'edit')
    page.classList.add('show')
    page.style.clipPath = `circle(0px at ${ox}px ${oy}px)`
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        page.style.clipPath = `circle(${Math.hypot(W, innerHeight)}px at ${ox}px ${oy}px)`
        page.classList.add('on')
      }),
    )
    if (mode !== 'path') setTimeout(() => pageT.focus(), reduced ? 0 : 260)
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
  function closePage(commit: boolean) {
    if (!pageFor) return
    stopMic()
    const pf = pageFor
    pageFor = null
    pageT.blur()
    page.classList.remove('on')
    page.style.clipPath = `circle(0px at ${pf.ox}px ${pf.oy}px)`
    setTimeout(() => page.classList.remove('show', 'path'), reduced ? 0 : 580)
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
    } else if (pf.mode === 'grow' && pf.tl) {
      const ans = v.trim()
      if (!ans) return
      const t = pf.tl.t
      patchExtra(t, { answers: [...answersOf(t), ans], plan: null, planSig: null })
      absorbAnim(t.id)
      say(answersOf(t).length === 0 ? 'saturated — it’s ready to rain' : 'absorbed — the path grows richer')
    } else if (pf.mode === 'path' && pf.tl) {
      patchExtra(pf.tl.t, { kept: true })
      say('the path is kept — it will wait for you')
    } else if (pf.tl) {
      const txt = v.trim()
      if (txt) S().updateThought(pf.tl.t.id, { raw_content: txt, title: null })
    }
  }
  pageD.addEventListener('click', () => closePage(true))
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
  pageMic.addEventListener('click', () => {
    if (rec) {
      stopMic()
      return
    }
    if (!SRCls) return
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
    } catch {
      rec = null
    }
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
      const s = Math.min(1, 240 / Math.min(im.width, im.height))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(im.width * s))
      c.height = Math.max(1, Math.round(im.height * s))
      ;(c.getContext('2d') as CanvasRenderingContext2D).drawImage(im, 0, 0, c.width, c.height)
      let img: string
      try {
        img = c.toDataURL('image/jpeg', 0.82)
      } catch {
        return
      }
      const pf = pageFor
      const t = S().addThought({ raw_content: 'A captured photo', extra: { img } })
      const p = posOf(t.id)
      const a = Math.random() * Math.PI * 2
      p.x = p.rx = Math.max(60, Math.min(W - 60, (pf?.ox ?? W / 2) + Math.cos(a) * 110))
      p.y = p.ry = Math.max(140, Math.min(H - 160, (pf?.oy ?? H / 2) + Math.sin(a) * 90))
      pageN.textContent = 'caught'
    }
    im.onerror = () => URL.revokeObjectURL(url)
    im.src = url
  })
  pageAbsorb.addEventListener('click', async () => {
    const v = pageT.value.trim()
    if (!v || !pageFor) return
    pageN.textContent = 'absorbing…'
    const res = await absorbText(v)
    if (res.kind === 'absorbed') {
      pageT.value = ''
      closePage(false)
      say(res.note || 'absorbed — the sky rearranged itself')
      splash(pageFor?.ox ?? W / 2)
    } else {
      // nothing to adjust (or offline blip) → plain capture, never lost
      closePage(true)
      say('captured as new — nothing in the sky needed adjusting')
    }
  })
  pageLater.addEventListener('click', () => {
    if (!pageFor || pageFor.mode !== 'edit' || !pageFor.tl) return
    const t = pageFor.tl.t
    closePage(false)
    restDrop(t)
  })

  // ---------- moons ----------
  let moonsFor: string | null = null
  const moonEls: HTMLDivElement[] = []
  function closeMoons() {
    moonEls.forEach((m) => m.remove())
    moonEls.length = 0
    moonsFor = null
  }
  function showMoons(tl: TL) {
    closeMoons()
    moonsFor = tl.t.id
    const p = posOf(tl.t.id)
    p.y = Math.max(p.y, radiusOf(tl) + 170)
    const acts: { icon: string; lb: string; dim?: boolean; run: () => void }[] = []
    if (tl.kind === 'drop' && !isKept(tl.t)) {
      acts.push({
        icon: 'grow',
        lb: isRipe(tl.t) ? 'deepen' : 'grow',
        run: () => {
          closeMoons()
          openPage('grow', tl, p.x, p.y)
        },
      })
    }
    const kin = kinOf(tl)
    acts.push({ icon: 'gather', lb: 'gather', dim: kin.length === 0, run: () => startPull(tl, true) })
    const canRain = tl.kind === 'drop' || tl.members.length >= 1
    acts.push({
      icon: 'rain',
      lb: isKept(tl.t) ? 'path' : 'rain',
      dim: !canRain,
      run: () => {
        closeMoons()
        rain(tl)
      },
    })
    acts.forEach((a, i) => {
      const m = document.createElement('div')
      m.className = 'sky-moon' + (a.dim ? ' dim' : '')
      m.innerHTML = `<div class="ic">${moonSvg(a.icon)}</div><div class="lb">${a.lb}</div>`
      if (!reduced) m.style.animationDelay = i * 45 + 'ms'
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
  function layoutMoons() {
    if (!moonsFor) return
    const tl = view.byId.get(moonsFor)
    if (!tl) {
      closeMoons()
      return
    }
    const p = posOf(tl.t.id)
    const r = radiusOf(tl) + 44
    // the orbit swings toward open space — the moons face the middle of the
    // screen, so they never collide with each other or fall off an edge
    const open = openPool === tl.t.id
    const toCenter = Math.atan2(H * 0.46 - p.y, W / 2 - p.x)
    const spread = 0.66
    moonEls.forEach((m) => {
      const el = m as HTMLDivElement & { _slot?: number; _of?: number }
      const n = el._of ?? 1
      const slot = el._slot ?? 0
      let x: number
      let y: number
      if (open) {
        // an opened pool is showing its contents; its own actions step out of
        // the orbit and wait together above the water
        const gap = 78
        x = W / 2 + (slot - (n - 1) / 2) * gap - 27
        y = waterlineY() - 96
      } else {
        const ang = toCenter + (slot - (n - 1) / 2) * spread
        x = p.x + Math.cos(ang) * r - 27
        y = p.y + Math.sin(ang) * r - 27
      }
      m.style.transform = `translate(${Math.max(30, Math.min(W - 84, x))}px, ${Math.max(72, Math.min(H - 92, y))}px)`
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
    setTimeout(() => openPage('path', tl, p.x, p.y), reduced ? 0 : 430)
  }
  let openPool: string | null = null
  function clearAll() {
    closeMoons()
    if (openPool) openPool = null
    paintAll()
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
    target: TL | null
    el: HTMLDivElement
  } | null = null
  let bgDown: { x: number; y: number } | null = null
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  stage.addEventListener('pointerdown', (e) => {
    const bubEl = (e.target as HTMLElement).closest?.('.skyb') as HTMLDivElement | null
    if (!bubEl) {
      if (!(e.target as HTMLElement).closest?.('.sky-moon')) {
        bgDown = { x: e.clientX, y: e.clientY }
        if (holdTimer) clearTimeout(holdTimer)
        holdTimer = setTimeout(() => {
          if (bgDown && !pageFor && !holding) {
            const b = bgDown
            bgDown = null
            clearAll()
            openPage('capture', undefined, b.x, b.y)
          }
        }, 420)
      }
      return
    }
    const id = bubEl.dataset.id as string
    if (id === '__invite') {
      openPage('capture', undefined, invitePos.x, invitePos.y)
      return
    }
    const tl = view.byId.get(id)
    const memberPool = tl
      ? undefined
      : view.tls.find((x) => x.kind === 'pool' && x.members.some((m) => m.id === id))?.t.id
    const memberT = memberPool ? S().thoughts.find((t) => t.id === id) : undefined
    const ent: TL | undefined = tl ?? (memberT ? { kind: 'drop', t: memberT, members: [] } : undefined)
    if (!ent) return
    const p = posOf(id)
    drag = {
      id,
      tl: ent,
      isMember: !!memberPool,
      memberPool,
      dx: p.x - e.clientX,
      dy: p.y - e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      vx: 0,
      vy: 0,
      moved: false,
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
    if (!drag) {
      if (bgDown && Math.hypot(e.clientX - bgDown.x, e.clientY - bgDown.y) > 9) {
        bgDown = null
        if (holdTimer) clearTimeout(holdTimer)
      }
      return
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 9) {
      drag.moved = true
      if (holdTimer) clearTimeout(holdTimer)
      drag.el.classList.add('dragging')
      closeMoons()
    }
    if (!drag.moved) return
    const p = posOf(drag.id)
    const nx = e.clientX + drag.dx
    const ny = e.clientY + drag.dy
    drag.vx = (nx - p.x) * 0.6 + drag.vx * 0.4
    drag.vy = (ny - p.y) * 0.6 + drag.vy * 0.4
    p.x = nx
    p.y = ny
    drag.target = null
    if (!drag.isMember) {
      let best: TL | null = null
      let bestD = Infinity
      for (const tl of view.tls) {
        if (tl.t.id === drag.id) continue
        const tp = posOf(tl.t.id)
        const d = Math.hypot(tp.x - p.x, tp.y - p.y)
        if (d < bestD) {
          bestD = d
          best = tl
        }
      }
      if (best && bestD < radiusOf(drag.tl) + radiusOf(best) + 110) {
        const gap = Math.max(0, bestD - (radiusOf(drag.tl) + radiusOf(best)) * 0.55)
        const deg = Math.round(gap / 4)
        meter.textContent = String(deg)
        const bp = posOf(best.t.id)
        meter.style.left = (p.x + bp.x) / 2 + 'px'
        meter.style.top = (p.y + bp.y) / 2 + 'px'
        meter.classList.add('on')
        meter.classList.toggle('zero', deg === 0)
        if (deg === 0) drag.target = best
      } else meter.classList.remove('on', 'zero')
    }
  })
  stage.addEventListener('pointerup', (e) => {
    if (holdTimer) clearTimeout(holdTimer)
    if (holding && !holding.auto) {
      endHold(true)
      return
    }
    if (!drag) {
      if (bgDown && Math.hypot(e.clientX - bgDown.x, e.clientY - bgDown.y) < 9) clearAll()
      bgDown = null
      return
    }
    const d = drag
    drag = null
    meter.classList.remove('on', 'zero')
    d.el.classList.remove('dragging')
    if (!d.moved) {
      onTap(d.id, d.isMember)
      return
    }
    if (d.tl.kind === 'drop' && e.clientY > waterlineY() - 12) {
      completeDrop(d.tl.t)
      persistLayout()
      return
    }
    if (d.isMember && d.memberPool) {
      const gp = posOf(d.memberPool)
      const p = posOf(d.id)
      const g = view.byId.get(d.memberPool)
      if (g && Math.hypot(gp.x - p.x, gp.y - p.y) > radiusOf(g) + 70) releaseMember(d.tl.t, d.memberPool)
    }
    if (d.target) {
      const p = posOf(d.id)
      const tp = posOf(d.target.t.id)
      poolTogether(d.target, d.tl, { x: (p.x + tp.x) / 2, y: (p.y + tp.y) / 2 })
    } else if (Math.hypot(d.vx, d.vy) > 2.5) {
      const p = posOf(d.id)
      p.vx = Math.max(-14, Math.min(14, d.vx))
      p.vy = Math.max(-14, Math.min(14, d.vy))
    }
    persistLayout()
  })
  stage.addEventListener('pointercancel', () => {
    if (holdTimer) clearTimeout(holdTimer)
    endHold(false)
    if (drag) drag.el.classList.remove('dragging')
    drag = null
    meter.classList.remove('on', 'zero')
  })
  function onTap(id: string, isMember: boolean) {
    hint.style.opacity = '0'
    const tl = view.byId.get(id)
    if (isMember) {
      const t = S().thoughts.find((x) => x.id === id)
      if (t) {
        const p = posOf(id)
        openPage('edit', { kind: 'drop', t, members: [] }, p.x, p.y)
      }
      return
    }
    if (!tl) return
    const p = posOf(id)
    if (tl.kind === 'pool') {
      if (openPool === tl.t.id) showMoons(tl)
      else {
        clearAll()
        openPool = tl.t.id
        p.y = Math.max(p.y, radiusOf(tl) + 236)
        p.x = Math.max(radiusOf(tl) + 90, Math.min(W - radiusOf(tl) - 90, p.x))
        paintAll()
        showMoons(tl)
      }
      return
    }
    if (moonsFor === id) {
      closeMoons()
      openPage('edit', tl, p.x, p.y)
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
          const pull = Math.min(0.4, (dist - rest) * 0.0012 * (pair.shared + (bonded ? 2 : 0)))
          pa.x += (dx / dist) * pull
          pa.y += (dy / dist) * pull
          pb.x -= (dx / dist) * pull
          pb.y -= (dy / dist) * pull
        }
      }
      for (let i = 0; i < view.tls.length; i++) {
        for (let j = i + 1; j < view.tls.length; j++) {
          const a = view.tls[i]
          const b = view.tls[j]
          const pa = posOf(a.t.id)
          const pb = posOf(b.t.id)
          const dx = pb.x - pa.x
          const dy = pb.y - pa.y
          const dist = Math.hypot(dx, dy) || 1
          const min = radiusOf(a) + radiusOf(b) + 22
          if (dist < min) {
            const push = (min - dist) * 0.03
            pa.x -= (dx / dist) * push
            pa.y -= (dy / dist) * push
            pb.x += (dx / dist) * push
            pb.y += (dy / dist) * push
          }
        }
      }
      for (const tl of view.tls) {
        const p = posOf(tl.t.id)
        coast(p)
        const r = radiusOf(tl)
        p.x = Math.max(r + 8, Math.min(W - r - 8, p.x))
        p.y = Math.max(r + 74, Math.min(waterlineY() - r - 18, p.y))
      }
    }
    if (openPool) {
      const g = view.byId.get(openPool)
      if (g) {
        const gp = posOf(g.t.id)
        const or = radiusOf(g) + 62
        g.members.forEach((m, i) => {
          const a = -Math.PI / 2 + (i / g.members.length) * Math.PI * 2 + t * 0.05
          const mp = posOf(m.id)
          if (!(drag && drag.id === m.id)) {
            mp.x += (gp.x + Math.cos(a) * or - mp.x) * 0.1
            mp.y += (gp.y + Math.sin(a) * or - mp.y) * 0.1
          }
          // members never leave the frame, whatever the orbit wants
          const mr = memberR()
          mp.x = Math.max(mr + 8, Math.min(W - mr - 8, mp.x))
          mp.y = Math.max(mr + 74, Math.min(waterlineY() - mr - 14, mp.y))
        })
        // clear the orbit's room: the rest of the sky drifts out of the way
        const clear = or + memberR() + 34
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
    // render
    for (const [id, el] of els) {
      const p = pos.get(id)
      if (!p) continue
      glide(p, drag?.id === id && drag.moved)
      const r = el.clientWidth / 2 || 40
      const squish = reduced ? 0 : Math.sin(t * 2 + hashN(id)) * 0.014
      el.style.transform = `translate3d(${p.rx - r}px, ${p.ry - r}px, 0) scale(${p.s + squish}, ${p.s - squish})`
    }
    if (inviteEl.style.display !== 'none') {
      invitePos.x = W / 2 + Math.sin(t * 0.4) * 5
      invitePos.y = H * 0.34 + Math.cos(t * 0.3) * 4
      inviteEl.style.transform = `translate3d(${invitePos.x - 96}px, ${invitePos.y - 96}px, 0)`
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
  const unsub = useGraph.subscribe(() => {
    rebuild()
    paintAll()
  })
  raf = requestAnimationFrame(step)
  const n = view.tls.length
  if (n > 0) say(view.tls.some((tl) => tl.kind === 'drop' && isRipe(tl.t)) ? 'something is saturated' : n >= 8 ? 'a storm is brewing — hold a drop to gather it' : 'welcome back')

  return () => {
    dead = true
    cancelAnimationFrame(raf)
    unsub()
    removeEventListener('resize', onResize)
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
