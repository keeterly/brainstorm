// Think — the spatial world. Droplets are real loose thoughts; clouds are
// real goal/concept thoughts with part_of members; drags create real edges;
// rain creates real action thoughts. The prototype's physics, on the graph.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { looseDroplets, isCloudType } from '@/world/engine'
import { weatherLine, cloudMembers } from '@/world/weather'
import { toAction } from '@/world/interaction'
import { TypeBadge } from '@/components/TypeBadge'
import type { Thought } from '@/domain/types'
import './think.css'

interface DropNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
  coreEl: HTMLDivElement
  el: HTMLDivElement
}
interface CloudNode {
  id: string
  x: number
  y: number
  vx: number
  targetY: number
  w: number
  phase: number
  puffs: { dx: number; dy: number; r: number }[]
  cores: HTMLDivElement[]
  el: HTMLDivElement
}
interface Model {
  drops: { id: string; label: string; kind: string; r: number }[]
  clouds: { id: string; name: string; membersOpen: number; saturated: boolean; w: number }[]
  tethers: { a: string; b: string }[]
}

const STOP = new Set(['what', 'when', 'where', 'which', 'would', 'could', 'should', 'about',
  'with', 'this', 'that', 'than', 'then', 'like', 'look', 'looks', 'does', 'from', 'have',
  'over', 'into', 'your', 'their', 'there', 'they', 'week', 'next', 'really', 'thing', 'need'])

function radiusFor(label: string): number {
  return Math.min(88, 44 + Math.min(30, label.length * 0.3))
}

export default function ThinkPage() {
  const navigate = useNavigate()
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const profile = useGraph((s) => s.profile)
  const addThought = useGraph((s) => s.addThought)
  const addRelationship = useGraph((s) => s.addRelationship)
  const saveLayout = useGraph((s) => s.saveLayout)
  const updateProfileSettings = useGraph((s) => s.updateProfileSettings)

  const [selected, setSelected] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const gooRef = useRef<HTMLDivElement>(null)
  const glossRef = useRef<HTMLDivElement>(null)
  const tetherRef = useRef<SVGPathElement>(null)
  const meterRef = useRef<HTMLDivElement>(null)

  // ---------- derive the model from the graph ----------
  const model: Model = useMemo(() => {
    const loose = looseDroplets(thoughts, relationships)
      .slice(0, 40)
      .map((t) => {
        const label = t.title || t.raw_content.slice(0, 90)
        return { id: t.id, label, kind: t.type, r: radiusFor(label) }
      })
    const looseIds = new Set(loose.map((d) => d.id))
    const clouds = thoughts
      .filter((t) => t.status === 'open' && isCloudType(t))
      .slice(0, 12)
      .map((c) => {
        const members = cloudMembers(c, thoughts, relationships).filter((m) => m.status === 'open')
        const actions = members.filter((m) => m.type === 'action' || m.type === 'task')
        return {
          id: c.id,
          name: c.title || c.raw_content.slice(0, 40),
          membersOpen: members.length,
          saturated: members.length >= 3 && actions.length === 0,
          w: Math.min(240, 120 + members.length * 14),
        }
      })
    const tethers = relationships
      .filter((r) => (r.type === 'relates_to' || r.type === 'inspired_by') && looseIds.has(r.from_id) && looseIds.has(r.to_id))
      .map((r) => ({ a: r.from_id, b: r.to_id }))
    return { drops: loose, clouds, tethers }
  }, [thoughts, relationships])

  const modelRef = useRef(model)
  modelRef.current = model
  const weather = useMemo(
    () => weatherLine({ thoughts, relationships, profile }),
    [thoughts, relationships, profile],
  )

  // ---------- graph mutations driven by gestures ----------
  const byId = useMemo(() => new Map(thoughts.map((t) => [t.id, t])), [thoughts])

  const conceptNameFor = useCallback((members: Thought[]): string => {
    const counts = new Map<string, number>()
    for (const m of members) {
      const words = new Set(
        (m.title || m.raw_content).toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)),
      )
      for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1)
    }
    let best: string | null = null
    for (const [w, n] of counts) if (n >= 2 && (!best || n > (counts.get(best) ?? 0))) best = w
    if (best) return best[0].toUpperCase() + best.slice(1)
    const first = (members[0].title || members[0].raw_content).split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    return first.slice(0, 2).join(' ') || 'New theme'
  }, [])

  const condenseGroup = useCallback(
    (ids: string[], at?: { x: number; y: number }) => {
      const members = ids.map((id) => byId.get(id)).filter((t): t is Thought => !!t)
      if (members.length < 3) return null
      const name = conceptNameFor(members)
      const cloud = addThought({ raw_content: `Theme: ${name}`, title: name, type: 'concept', source: 'ai' })
      for (const m of members) addRelationship(m.id, cloud.id, 'part_of')
      if (at) {
        const positions = { ...(useGraph.getState().layouts['think'] ?? {}) }
        positions[cloud.id] = { x: at.x, y: Math.min(at.y, window.innerHeight * 0.3) }
        saveLayout('think', positions)
      }
      setNotice(`condensation — “${name}” formed from ${members.length} thoughts`)
      return cloud
    },
    [addThought, addRelationship, byId, conceptNameFor, saveLayout],
  )

  const joinDrops = useCallback(
    (aId: string, bId: string, at: { x: number; y: number }) => {
      addRelationship(aId, bId, 'relates_to')
      // connected component over loose-droplet tethers (incl. the new edge)
      const looseIds = new Set(modelRef.current.drops.map((d) => d.id))
      const adj = new Map<string, string[]>()
      const push = (x: string, y: string) => {
        if (!adj.has(x)) adj.set(x, [])
        adj.get(x)!.push(y)
      }
      for (const t of [...modelRef.current.tethers, { a: aId, b: bId }]) {
        if (looseIds.has(t.a) && looseIds.has(t.b)) {
          push(t.a, t.b)
          push(t.b, t.a)
        }
      }
      const seen = new Set<string>([aId])
      const queue = [aId]
      while (queue.length) {
        const cur = queue.pop()!
        for (const nxt of adj.get(cur) ?? []) {
          if (!seen.has(nxt)) {
            seen.add(nxt)
            queue.push(nxt)
          }
        }
      }
      if (seen.size >= 3) condenseGroup([...seen], at)
      else setNotice('connected — one more thought makes a cloud')
    },
    [addRelationship, condenseGroup],
  )

  const absorbIntoCloud = useCallback(
    (dropId: string, cloudId: string) => {
      addRelationship(dropId, cloudId, 'part_of')
      setNotice('absorbed into the cloud')
    },
    [addRelationship],
  )

  const condenseBest = useCallback(() => {
    const loose = modelRef.current.drops
    const buckets = new Map<string, string[]>()
    for (const d of loose) {
      const words = new Set(d.label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)))
      for (const w of words) {
        if (!buckets.has(w)) buckets.set(w, [])
        buckets.get(w)!.push(d.id)
      }
    }
    let best: { w: string; ids: string[] } | null = null
    for (const [w, ids] of buckets) if (ids.length >= 3 && (!best || ids.length > best.ids.length)) best = { w, ids }
    if (!best) {
      setNotice('nothing wants to condense yet — connect thoughts by dragging them together')
      return
    }
    for (let i = 1; i < best.ids.length; i++) addRelationship(best.ids[0], best.ids[i], 'relates_to')
    condenseGroup(best.ids)
  }, [addRelationship, condenseGroup])

  const rainFrom = useCallback(
    (cloudId: string) => {
      const cloud = byId.get(cloudId)
      if (!cloud) return
      const members = cloudMembers(cloud, thoughts, relationships).filter(
        (m) => m.status === 'open' && m.type !== 'action' && m.type !== 'task',
      )
      const sources = members.slice(0, 6)
      if (!sources.length) return
      let firstId: string | null = null
      sources.forEach((m, i) => {
        const a = addThought({
          raw_content: toAction(m),
          title: toAction(m),
          type: 'action',
          source: 'ai',
          bucket: i === 0 ? 'now' : 'next',
        })
        addRelationship(a.id, cloud.id, 'part_of', 'ai')
        if (i === 0) firstId = a.id
      })
      if (firstId) {
        updateProfileSettings({
          recommended_action: {
            id: firstId,
            why: `It fell first from “${cloud.title || 'this cloud'}” — small enough to start the current moving.`,
            at: new Date().toISOString(),
          },
        })
      }
      setNotice(`rain — ${sources.length} action${sources.length === 1 ? '' : 's'} fell into the current`)
      setSelected(null)
    },
    [addRelationship, addThought, byId, relationships, thoughts, updateProfileSettings],
  )

  // stable refs for the engine
  const cb = useRef({ joinDrops, absorbIntoCloud, setSelected })
  cb.current = { joinDrops, absorbIntoCloud, setSelected }

  // ---------- the imperative water engine ----------
  useEffect(() => {
    const stage = stageRef.current
    const goo = gooRef.current
    const gloss = glossRef.current
    const tetherPath = tetherRef.current
    const meter = meterRef.current
    if (!stage || !goo || !gloss || !tetherPath || !meter) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    const dropNodes = new Map<string, DropNode>()
    const cloudNodes = new Map<string, CloudNode>()
    const saved: Record<string, { x: number; y: number }> =
      { ...(useGraph.getState().layouts['think'] ?? {}) }
    const dirty: Record<string, { x: number; y: number }> = {}
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    const schedulePersist = () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        const merged = { ...(useGraph.getState().layouts['think'] ?? {}), ...dirty }
        useGraph.getState().saveLayout('think', merged)
      }, 700)
    }

    const H = () => stage.clientHeight
    const W = () => stage.clientWidth
    const skyTop = () => 84
    const skyBottom = () => H() * 0.34
    const airTop = () => H() * 0.3
    const airBottom = () => H() - 60

    const sync = () => {
      const m = modelRef.current
      const dropIds = new Set(m.drops.map((d) => d.id))
      const cloudIds = new Set(m.clouds.map((c) => c.id))
      for (const [id, n] of dropNodes) {
        if (!dropIds.has(id)) {
          n.coreEl.remove()
          n.el.remove()
          dropNodes.delete(id)
        }
      }
      for (const [id, n] of cloudNodes) {
        if (!cloudIds.has(id)) {
          n.cores.forEach((c) => c.remove())
          n.el.remove()
          cloudNodes.delete(id)
        }
      }
      for (const d of m.drops) {
        let n = dropNodes.get(d.id)
        if (!n) {
          const coreEl = document.createElement('div')
          coreEl.className = 'think-core'
          const el = document.createElement('div')
          el.className = 'think-bub' + (reduced ? '' : ' pop')
          el.dataset.nodeId = d.id
          goo.appendChild(coreEl)
          gloss.appendChild(el)
          const p = saved[d.id] ?? {
            x: W() * (0.18 + Math.random() * 0.64),
            y: airTop() + Math.random() * (airBottom() - airTop() - 80),
          }
          n = {
            id: d.id, x: p.x, y: p.y,
            vx: (Math.random() - 0.5) * 0.3, vy: 0,
            r: d.r, phase: Math.random() * Math.PI * 2,
            coreEl, el,
          }
          dropNodes.set(d.id, n)
        }
        n.r = d.r
        n.el.style.setProperty('--tint', `var(--tint-${d.kind}, var(--ink-soft))`)
        n.el.innerHTML = `<div class="txt"></div><div class="kind">${d.kind}</div>`
        n.el.querySelector('.txt')!.textContent = d.label
        const dia = `${d.r * 2}px`
        n.coreEl.style.width = n.coreEl.style.height = dia
        n.el.style.width = n.el.style.height = dia
      }
      for (const c of m.clouds) {
        let n = cloudNodes.get(c.id)
        if (!n) {
          const el = document.createElement('div')
          el.className = 'think-cloudlabel'
          el.dataset.cloudId = c.id
          gloss.appendChild(el)
          const p = saved[c.id] ?? {
            x: W() * (0.25 + Math.random() * 0.5),
            y: skyTop() + 50 + Math.random() * Math.max(40, skyBottom() - skyTop() - 120),
          }
          n = {
            id: c.id, x: p.x, y: p.y,
            vx: (Math.random() < 0.5 ? -1 : 1) * 0.08,
            targetY: p.y, w: c.w,
            phase: Math.random() * Math.PI * 2,
            puffs: [], cores: [], el,
          }
          cloudNodes.set(c.id, n)
        }
        if (n.w !== c.w || !n.puffs.length) {
          n.w = c.w
          n.cores.forEach((x) => x.remove())
          n.cores = []
          n.puffs = []
          for (let i = 0; i < 5; i++) {
            const fx = i / 4 - 0.5
            n.puffs.push({
              dx: fx * c.w * 0.78,
              dy: (i % 2 === 0 ? -1 : 1) * (6 + (i * 7) % 11) - Math.abs(fx) * 10,
              r: (0.34 - Math.abs(fx) * 0.16) * c.w + 2,
            })
            const core = document.createElement('div')
            core.className = 'think-core think-core--cloud'
            goo.appendChild(core)
            n.cores.push(core)
          }
        }
        n.el.innerHTML =
          `<div class="name"></div>` +
          `<div class="meta ${c.saturated ? 'ready' : ''}">${c.saturated ? '● saturated — tap to rain' : `${c.membersOpen} thought${c.membersOpen === 1 ? '' : 's'}`}</div>`
        n.el.querySelector('.name')!.textContent = c.name
        n.el.style.width = `${c.w}px`
        n.el.style.height = `${c.w * 0.55}px`
      }
    }
    sync()
    const unsub = useGraph.subscribe(() => sync())

    // ---------- gestures ----------
    let drag: {
      n: DropNode
      dx: number
      dy: number
      sx: number
      sy: number
      moved: boolean
      target: { kind: 'drop' | 'cloud'; id: string } | null
    } | null = null

    const onDown = (e: PointerEvent) => {
      const p = { x: e.clientX, y: e.clientY }
      let hit: DropNode | null = null
      for (const n of dropNodes.values()) {
        if (Math.hypot(n.x - p.x, n.y - p.y) <= n.r) hit = n
      }
      if (!hit) {
        for (const n of cloudNodes.values()) {
          if (Math.abs(n.x - p.x) <= n.w / 2 && Math.abs(n.y - p.y) <= n.w * 0.3) {
            cb.current.setSelected(n.id)
            return
          }
        }
        cb.current.setSelected(null)
        return
      }
      drag = { n: hit, dx: hit.x - p.x, dy: hit.y - p.y, sx: p.x, sy: p.y, moved: false, target: null }
      stage.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!drag) return
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true
      if (!drag.moved) return
      drag.n.x = e.clientX + drag.dx
      drag.n.y = e.clientY + drag.dy
      drag.n.vx = drag.n.vy = 0
    }
    const onUp = () => {
      if (!drag) return
      const { n, moved, target } = drag
      drag = null
      meter.classList.remove('on', 'zero')
      if (!moved) {
        cb.current.setSelected(n.id)
        return
      }
      dirty[n.id] = { x: n.x, y: n.y }
      schedulePersist()
      if (target) {
        if (target.kind === 'drop') cb.current.joinDrops(n.id, target.id, { x: n.x, y: n.y })
        else cb.current.absorbIntoCloud(n.id, target.id)
        flash()
      }
    }
    const flash = () => {
      goo.classList.add('flash')
      setTimeout(() => goo.classList.remove('flash'), reduced ? 0 : 700)
    }
    stage.addEventListener('pointerdown', onDown)
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerup', onUp)
    stage.addEventListener('pointercancel', onUp)

    // ---------- physics ----------
    let t = 0
    let raf = 0
    const step = () => {
      t += 0.016
      for (const n of dropNodes.values()) {
        if (drag && drag.n === n) continue
        if (!reduced) {
          n.vx += Math.sin(t * 0.6 + n.phase) * 0.006
          n.vy += Math.cos(t * 0.5 + n.phase * 1.3) * 0.005
        }
        if (n.y > airBottom() - n.r) n.vy -= 0.06
        if (n.y < airTop() + n.r) n.vy += 0.05
        n.vx *= 0.985
        n.vy *= 0.985
        n.x += n.vx
        n.y += n.vy
        const m = n.r + 8
        if (n.x < m) { n.x = m; n.vx = Math.abs(n.vx) * 0.6 }
        if (n.x > W() - m) { n.x = W() - m; n.vx = -Math.abs(n.vx) * 0.6 }
      }
      const ds = [...dropNodes.values()]
      for (let i = 0; i < ds.length; i++) {
        for (let j = i + 1; j < ds.length; j++) {
          const a = ds[i], c = ds[j]
          if (drag && (drag.n === a || drag.n === c)) continue
          const dx = c.x - a.x, dy = c.y - a.y
          const dist = Math.hypot(dx, dy) || 1
          const min = a.r + c.r + 30
          if (dist < min) {
            const push = (min - dist) * 0.045
            const ux = dx / dist, uy = dy / dist
            a.vx -= ux * push; a.vy -= uy * push
            c.vx += ux * push; c.vy += uy * push
          }
        }
      }
      for (const n of cloudNodes.values()) {
        n.x += n.vx + (reduced ? 0 : Math.sin(t * 0.3 + n.phase) * 0.06)
        n.y += (n.targetY - n.y) * 0.03
        const m = n.w / 2 + 10
        if (n.x < m) { n.x = m; n.vx = Math.abs(n.vx) }
        if (n.x > W() - m) { n.x = W() - m; n.vx = -Math.abs(n.vx) }
      }
      // droplets keep clear of clouds unless deliberately dragged in
      for (const n of dropNodes.values()) {
        if (drag && drag.n === n) continue
        for (const c of cloudNodes.values()) {
          const dx = n.x - c.x, dy = n.y - c.y
          const dist = Math.hypot(dx, dy) || 1
          const min = c.w * 0.45 + n.r + 30
          if (dist < min) {
            const push = (min - dist) * 0.05
            n.vx += (dx / dist) * push
            n.vy += (dy / dist) * push + push * 0.6
          }
        }
      }
      // meter while dragging
      if (drag && drag.moved) {
        const n = drag.n
        let best: { kind: 'drop' | 'cloud'; id: string; x: number; y: number; r: number } | null = null
        let bestD = Infinity
        for (const o of dropNodes.values()) {
          if (o === n) continue
          const d = Math.hypot(o.x - n.x, o.y - n.y)
          if (d < bestD) { bestD = d; best = { kind: 'drop', id: o.id, x: o.x, y: o.y, r: o.r } }
        }
        for (const o of cloudNodes.values()) {
          const d = Math.hypot(o.x - n.x, o.y - n.y)
          if (d < bestD) { bestD = d; best = { kind: 'cloud', id: o.id, x: o.x, y: o.y, r: o.w * 0.34 } }
        }
        drag.target = null
        if (best && bestD < n.r + best.r + 130) {
          const gap = Math.max(0, bestD - (n.r + best.r) * 0.62)
          const deg = Math.round(gap / 4)
          meter.textContent = String(deg)
          meter.style.left = `${(n.x + best.x) / 2}px`
          meter.style.top = `${(n.y + best.y) / 2}px`
          meter.classList.add('on')
          meter.classList.toggle('zero', deg === 0)
          if (deg === 0) drag.target = { kind: best.kind, id: best.id }
        } else {
          meter.classList.remove('on', 'zero')
        }
      }
      // paint
      for (const n of dropNodes.values()) {
        const squish = reduced ? 0 : Math.sin(t * 2.6 + n.phase) * 0.035
        const tr = `translate(${n.x - n.r}px, ${n.y - n.r}px) scale(${1 + squish}, ${1 - squish})`
        n.coreEl.style.transform = tr
        n.el.style.transform = tr
      }
      for (const n of cloudNodes.values()) {
        n.puffs.forEach((p, i) => {
          const bob = reduced ? 0 : Math.sin(t * 0.8 + n.phase + i) * 2
          const core = n.cores[i]
          core.style.width = core.style.height = `${p.r * 2}px`
          core.style.transform = `translate(${n.x + p.dx - p.r}px, ${n.y + p.dy + bob - p.r}px)`
        })
        n.el.style.transform = `translate(${n.x - n.w / 2}px, ${n.y - n.w * 0.27}px)`
      }
      let td = ''
      for (const l of modelRef.current.tethers) {
        const a = dropNodes.get(l.a)
        const b = dropNodes.get(l.b)
        if (a && b) td += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`
      }
      tetherPath.setAttribute('d', td)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(raf)
      unsub()
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
      dropNodes.forEach((n) => { n.coreEl.remove(); n.el.remove() })
      cloudNodes.forEach((n) => { n.cores.forEach((c) => c.remove()); n.el.remove() })
    }
  }, [])

  // ---------- selection bar ----------
  const selectedThought = selected ? byId.get(selected) : null
  const selectedIsCloud = selectedThought ? isCloudType(selectedThought) : false
  const selectedMembers = useMemo(() => {
    if (!selectedThought || !selectedIsCloud) return []
    return cloudMembers(selectedThought, thoughts, relationships).filter((m) => m.status === 'open')
  }, [selectedThought, selectedIsCloud, thoughts, relationships])
  const canRain =
    selectedIsCloud &&
    selectedMembers.filter((m) => m.type !== 'action' && m.type !== 'task').length > 0 &&
    selectedMembers.filter((m) => m.type === 'action' || m.type === 'task').length === 0

  return (
    <>
      <div className="think-stage" ref={stageRef}>
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
          <defs>
            <filter id="bs-gooey">
              <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -13"
                result="goo"
              />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
          </defs>
        </svg>
        <svg className="think-tether" aria-hidden>
          <path ref={tetherRef} d="" />
        </svg>
        <div className="think-goo" ref={gooRef} />
        <div className="think-gloss" ref={glossRef} />
      </div>
      <div className="think-meter" ref={meterRef} aria-hidden>
        18
      </div>

      <div className="think-top">
        <div className="eyebrow" style={{ color: 'var(--ink)' }}>
          Think
        </div>
        <div className="weather">{notice ?? weather}</div>
      </div>

      <div className="think-quick">
        <button className="chip chip--ai" onClick={condenseBest}>
          ✦ Condense
        </button>
        {model.drops.length === 0 && model.clouds.length === 0 && (
          <button className="chip" onClick={() => navigate('/')}>
            Collect a thought
          </button>
        )}
      </div>

      {selectedThought && (
        <div className="think-bar">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <TypeBadge type={selectedThought.type} />
            <strong
              style={{
                flex: 1,
                fontSize: 'var(--fs-label)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedThought.title || selectedThought.raw_content.slice(0, 60)}
            </strong>
            <button aria-label="Close" className="faint" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn--sm" onClick={() => navigate(`/thought/${selectedThought.id}`)}>
              Open
            </button>
            {canRain && (
              <button className="btn btn--sm btn--accent" onClick={() => rainFrom(selectedThought.id)}>
                ☂ Make it rain
              </button>
            )}
            {selectedIsCloud && (
              <span className="faint" style={{ fontSize: 'var(--fs-caption)', alignSelf: 'center' }}>
                {selectedMembers.length} thoughts inside
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
