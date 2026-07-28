// Think — the spatial world, kept legible. Hubs (themes/goals) sit as bright
// glass circles with their member thoughts as satellites on thin lines,
// exactly like the concept board. Loose thoughts drift below and can be
// dragged together (three make a theme) or into a hub. A Themes view shows
// the same understanding as a calm list.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { looseDroplets, isCloudType } from '@/world/engine'
import { weatherLine, cloudMembers } from '@/world/weather'
import { toAction } from '@/world/interaction'
import { TypeBadge } from '@/components/TypeBadge'
import type { Thought } from '@/domain/types'
import './think.css'

const STOP = new Set(['what', 'when', 'where', 'which', 'would', 'could', 'should', 'about',
  'with', 'this', 'that', 'than', 'then', 'like', 'look', 'looks', 'does', 'from', 'have',
  'over', 'into', 'your', 'their', 'there', 'they', 'week', 'next', 'really', 'thing', 'need'])

interface SatView {
  id: string
  label: string
  done: boolean
  x: number
  y: number
  r: number
}
interface HubView {
  id: string
  name: string
  membersOpen: number
  saturated: boolean
  x: number
  y: number
  r: number
  sats: SatView[]
  more: number
}
interface DropView {
  id: string
  label: string
  kind: string
  x: number
  y: number
  r: number
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export default function ThinkPage() {
  const navigate = useNavigate()
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const layouts = useGraph((s) => s.layouts)
  const profile = useGraph((s) => s.profile)
  const addThought = useGraph((s) => s.addThought)
  const addRelationship = useGraph((s) => s.addRelationship)
  const saveLayout = useGraph((s) => s.saveLayout)
  const updateProfileSettings = useGraph((s) => s.updateProfileSettings)

  const [view, setView] = useState<'map' | 'themes'>('map')
  const [selectedHub, setSelectedHub] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight - 140 })

  useEffect(() => {
    const onR = () => setSize({ w: window.innerWidth, h: window.innerHeight - 140 })
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])

  const byId = useMemo(() => new Map(thoughts.map((t) => [t.id, t])), [thoughts])
  const allLoose = useMemo(() => looseDroplets(thoughts, relationships), [thoughts, relationships])
  const weather = useMemo(
    () => weatherLine({ thoughts, relationships, profile }),
    [thoughts, relationships, profile],
  )

  // ---------- deterministic constellation layout ----------
  const saved = layouts['think'] ?? {}
  const { hubs, drops, beneath } = useMemo(() => {
    const { w, h } = size
    const clouds = thoughts.filter((t) => t.status === 'open' && isCloudType(t)).slice(0, 6)
    const hubs: HubView[] = clouds.map((c, i) => {
      const members = cloudMembers(c, thoughts, relationships)
      const open = members.filter((m) => m.status === 'open')
      const actions = open.filter((m) => m.type === 'action' || m.type === 'task')
      const n = clouds.length
      const hx = saved[c.id]?.x ?? w * ((i + 1) / (n + 1))
      const hy = saved[c.id]?.y ?? h * (n > 2 ? (i % 2 === 0 ? 0.3 : 0.46) : 0.37)
      const shown = members.slice(0, 6)
      const satR = 34
      const orbit = 62 + satR + 28
      const sats: SatView[] = shown.map((m, j) => {
        // half-step rotation keeps satellites off the header line above
        const a = -Math.PI / 2 + ((j + 0.5) / shown.length) * Math.PI * 2
        return {
          id: m.id,
          label: m.title || m.raw_content.slice(0, 40),
          done: m.status === 'done',
          x: hx + Math.cos(a) * orbit,
          y: hy + Math.sin(a) * orbit,
          r: satR,
        }
      })
      return {
        id: c.id,
        name: c.title || c.raw_content.slice(0, 40),
        membersOpen: open.length,
        saturated: open.length >= 3 && actions.length === 0,
        x: hx,
        y: hy,
        r: 62,
        sats,
        more: members.length - shown.length,
      }
    })
    const looseCap = clouds.length ? 6 : 10
    const loose = allLoose.slice(0, looseCap)
    const bandTop = clouds.length ? h * 0.73 : h * 0.32
    const drops: DropView[] = loose.map((t, i) => {
      const label = t.title || t.raw_content.slice(0, 60)
      const col = i % 3
      const row = Math.floor(i / 3)
      const jx = ((hash(t.id) % 40) - 20)
      const jy = ((hash(t.id + 'y') % 30) - 15)
      return {
        id: t.id,
        label,
        kind: t.type,
        x: saved[t.id]?.x ?? w * (0.2 + col * 0.3) + jx,
        y: saved[t.id]?.y ?? bandTop + row * 118 + jy,
        r: 46,
      }
    })
    return { hubs, drops, beneath: Math.max(0, allLoose.length - looseCap) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thoughts, relationships, allLoose, size, layouts])

  // ---------- understanding: mist = a theme the world can see ----------
  const mist = useMemo(() => {
    const buckets = new Map<string, string[]>()
    for (const d of allLoose.slice(0, 10)) {
      const words = new Set(
        (d.title || d.raw_content).toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)),
      )
      for (const w of words) {
        if (!buckets.has(w)) buckets.set(w, [])
        buckets.get(w)!.push(d.id)
      }
    }
    let best: { w: string; ids: string[] } | null = null
    for (const [w, ids] of buckets) if (ids.length >= 3 && (!best || ids.length > best.ids.length)) best = { w, ids }
    return best
  }, [allLoose])

  // ---------- graph mutations ----------
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
    const first = (members[0].title || members[0].raw_content)
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    return first.slice(0, 2).join(' ') || 'New theme'
  }, [])

  const condenseGroup = useCallback(
    (ids: string[]) => {
      const members = ids.map((id) => byId.get(id)).filter((t): t is Thought => !!t)
      if (members.length < 3) return
      const name = conceptNameFor(members)
      const cloud = addThought({ raw_content: `Theme: ${name}`, title: name, type: 'concept', source: 'ai' })
      for (const m of members) addRelationship(m.id, cloud.id, 'part_of')
      setNotice(`“${name}” formed from ${members.length} thoughts`)
    },
    [addThought, addRelationship, byId, conceptNameFor],
  )

  const joinDrops = useCallback(
    (aId: string, bId: string) => {
      addRelationship(aId, bId, 'relates_to')
      const looseIds = new Set(drops.map((d) => d.id))
      const edges = relationships
        .filter((r) => (r.type === 'relates_to' || r.type === 'inspired_by') && looseIds.has(r.from_id) && looseIds.has(r.to_id))
        .map((r) => ({ a: r.from_id, b: r.to_id }))
      edges.push({ a: aId, b: bId })
      const adj = new Map<string, string[]>()
      for (const e of edges) {
        if (!adj.has(e.a)) adj.set(e.a, [])
        if (!adj.has(e.b)) adj.set(e.b, [])
        adj.get(e.a)!.push(e.b)
        adj.get(e.b)!.push(e.a)
      }
      const seen = new Set<string>([aId])
      const q = [aId]
      while (q.length) {
        const cur = q.pop()!
        for (const nx of adj.get(cur) ?? []) if (!seen.has(nx)) { seen.add(nx); q.push(nx) }
      }
      if (seen.size >= 3) condenseGroup([...seen])
      else setNotice('connected — one more thought makes a theme')
    },
    [addRelationship, condenseGroup, drops, relationships],
  )

  const rainFrom = useCallback(
    (cloudId: string) => {
      const cloud = byId.get(cloudId)
      if (!cloud) return
      const sources = cloudMembers(cloud, thoughts, relationships)
        .filter((m) => m.status === 'open' && m.type !== 'action' && m.type !== 'task')
        .slice(0, 6)
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
            why: `It fell first from “${cloud.title || 'this theme'}” — small enough to start the current moving.`,
            at: new Date().toISOString(),
          },
        })
      }
      setSelectedHub(null)
      setNotice(`rain — ${sources.length} action${sources.length === 1 ? '' : 's'} fell into the current`)
    },
    [addRelationship, addThought, byId, relationships, thoughts, updateProfileSettings],
  )

  // ---------- drag (loose drops only) ----------
  const stageRef = useRef<HTMLDivElement>(null)
  const meterRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string
    el: HTMLElement
    dx: number
    dy: number
    sx: number
    sy: number
    moved: boolean
    x: number
    y: number
    target: { kind: 'drop' | 'hub'; id: string } | null
  } | null>(null)
  const viewsRef = useRef({ hubs, drops })
  viewsRef.current = { hubs, drops }
  const [dragTick, setDragTick] = useState(0) // re-render lines during drag

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-drop-id]')
    if (!el) return
    const id = el.dataset.dropId!
    const d = viewsRef.current.drops.find((x) => x.id === id)
    if (!d) return
    dragRef.current = {
      id, el,
      dx: d.x - e.clientX, dy: d.y - e.clientY,
      sx: e.clientX, sy: e.clientY,
      moved: false, x: d.x, y: d.y, target: null,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const g = dragRef.current
    if (!g) return
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 6) g.moved = true
    if (!g.moved) return
    g.x = e.clientX + g.dx
    g.y = e.clientY + g.dy
    g.el.style.transform = `translate(${g.x - 46}px, ${g.y - 46}px)`
    // nearest target
    let best: { kind: 'drop' | 'hub'; id: string; x: number; y: number; r: number } | null = null
    let bestD = Infinity
    for (const o of viewsRef.current.drops) {
      if (o.id === g.id) continue
      const d = Math.hypot(o.x - g.x, o.y - g.y)
      if (d < bestD) { bestD = d; best = { kind: 'drop', id: o.id, x: o.x, y: o.y, r: o.r } }
    }
    for (const o of viewsRef.current.hubs) {
      const d = Math.hypot(o.x - g.x, o.y - g.y)
      if (d < bestD) { bestD = d; best = { kind: 'hub', id: o.id, x: o.x, y: o.y, r: o.r } }
    }
    const meter = meterRef.current
    g.target = null
    if (meter && best && bestD < 46 + best.r + 120) {
      const gap = Math.max(0, bestD - (46 + best.r) * 0.6)
      const deg = Math.round(gap / 4)
      meter.textContent = String(deg)
      meter.style.left = `${(g.x + best.x) / 2}px`
      meter.style.top = `${(g.y + best.y) / 2}px`
      meter.classList.add('on')
      meter.classList.toggle('zero', deg === 0)
      if (deg === 0) g.target = { kind: best.kind, id: best.id }
    } else if (meter) {
      meter.classList.remove('on', 'zero')
    }
    setDragTick((t) => t + 1)
  }, [])

  const onPointerUp = useCallback(() => {
    const g = dragRef.current
    dragRef.current = null
    meterRef.current?.classList.remove('on', 'zero')
    if (!g) return
    if (!g.moved) {
      navigate(`/thought/${g.id}`)
      return
    }
    const positions = { ...(useGraph.getState().layouts['think'] ?? {}) }
    positions[g.id] = { x: g.x, y: g.y }
    saveLayout('think', positions)
    if (g.target) {
      if (g.target.kind === 'hub') {
        addRelationship(g.id, g.target.id, 'part_of')
        setNotice('absorbed into the theme')
      } else {
        joinDrops(g.id, g.target.id)
      }
    }
  }, [addRelationship, joinDrops, navigate, saveLayout])

  // gentle drift for the whole field (one transform on a wrapper — calm, cheap)
  const driftRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let t = 0
    const step = () => {
      t += 0.016
      if (driftRef.current) {
        driftRef.current.style.transform = `translate(${Math.sin(t * 0.3) * 3}px, ${Math.cos(t * 0.23) * 3}px)`
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(id)
  }, [notice])

  const hub = selectedHub ? hubs.find((h) => h.id === selectedHub) : null
  const hubMembers = useMemo(() => {
    if (!hub) return []
    const c = byId.get(hub.id)
    return c ? cloudMembers(c, thoughts, relationships) : []
  }, [hub, byId, thoughts, relationships])

  const empty = hubs.length === 0 && drops.length === 0
  const g = dragRef.current
  void dragTick

  return (
    <>
      <div className="think-top">
        <div className="tk-seg" role="tablist" aria-label="Think views">
          <button role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>
            Map
          </button>
          <button role="tab" aria-selected={view === 'themes'} className={view === 'themes' ? 'on' : ''} onClick={() => setView('themes')}>
            Themes
          </button>
        </div>
        <div className="weather">{notice ?? weather}</div>
      </div>

      {view === 'themes' ? (
        <div className="tk-themes">
          {hubs.length > 0 || mist ? (
            <div className="lead">I see themes around…</div>
          ) : (
            <div className="lead">No themes yet</div>
          )}
          {hubs.map((h) => (
            <button key={h.id} className="tk-theme-row" onClick={() => navigate(`/thought/${h.id}`)}>
              <div>
                <div className="name">{h.name}</div>
                <div className="sub">
                  {h.membersOpen} thought{h.membersOpen === 1 ? '' : 's'}
                  {h.saturated ? ' · ready to rain' : ''}
                </div>
              </div>
              <span className="chev">›</span>
            </button>
          ))}
          {mist && (
            <button className="tk-theme-row tk-theme-row--mist" onClick={() => condenseGroup(mist.ids)}>
              <div>
                <div className="name">✦ {mist.w}</div>
                <div className="sub">{mist.ids.length} loose thoughts — tap to condense</div>
              </div>
              <span className="chev">›</span>
            </button>
          )}
          {hubs.length === 0 && !mist && (
            <p className="faint" style={{ fontSize: 'var(--fs-label)' }}>
              Connect thoughts on the map — three make a theme.
            </p>
          )}
        </div>
      ) : (
        <div
          className="think-stage"
          ref={stageRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div ref={driftRef} style={{ position: 'absolute', inset: 0 }}>
            <svg className="tk-lines" aria-hidden>
              {hubs.map((h) =>
                h.sats.map((s) => (
                  <line key={`${h.id}-${s.id}`} className="edge" x1={h.x} y1={h.y} x2={s.x} y2={s.y} />
                )),
              )}
              {relationships
                .filter((r) => r.type === 'relates_to' || r.type === 'inspired_by')
                .map((r) => {
                  const a = g?.id === r.from_id ? g : drops.find((d) => d.id === r.from_id)
                  const b = g?.id === r.to_id ? g : drops.find((d) => d.id === r.to_id)
                  if (!a || !b) return null
                  return <line key={r.id} className="tether" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                })}
            </svg>

            {hubs.map((h) => (
              <div key={h.id}>
                <button
                  className={`tk-node tk-node--hub ${h.saturated ? 'ready' : ''}`}
                  style={{
                    width: h.r * 2,
                    height: h.r * 2,
                    transform: `translate(${h.x - h.r}px, ${h.y - h.r}px)`,
                  }}
                  onClick={() => setSelectedHub((s) => (s === h.id ? null : h.id))}
                >
                  <span className="txt">{h.name}</span>
                  <span className="meta">{h.saturated ? '● tap to rain' : `${h.membersOpen}`}</span>
                </button>
                {h.sats.map((s) => (
                  <button
                    key={s.id}
                    className={`tk-node tk-node--sat ${s.done ? 'done' : ''}`}
                    style={{
                      width: s.r * 2,
                      height: s.r * 2,
                      transform: `translate(${s.x - s.r}px, ${s.y - s.r}px)`,
                    }}
                    onClick={() => navigate(`/thought/${s.id}`)}
                  >
                    <span className="txt">{s.label}</span>
                  </button>
                ))}
              </div>
            ))}

            {drops.map((d) => (
              <div
                key={d.id}
                data-drop-id={d.id}
                className="tk-node tk-node--drop"
                style={{
                  width: d.r * 2,
                  height: d.r * 2,
                  transform: `translate(${(g?.id === d.id ? g.x : d.x) - d.r}px, ${(g?.id === d.id ? g.y : d.y) - d.r}px)`,
                  ['--tint' as string]: `var(--tint-${d.kind}, var(--ink-soft))`,
                }}
              >
                <span className="txt">{d.label}</span>
              </div>
            ))}
          </div>

          {empty && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <button className="chip" onClick={() => navigate('/')}>
                Collect a thought
              </button>
            </div>
          )}
          {beneath > 0 && (
            <div
              className="faint"
              style={{
                position: 'absolute',
                bottom: 14,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontSize: 'var(--fs-caption)',
                pointerEvents: 'none',
              }}
            >
              +{beneath} beneath the surface
            </div>
          )}
        </div>
      )}

      <div className="think-meter" ref={meterRef} aria-hidden>
        18
      </div>

      {view === 'map' && mist && !hub && (
        <div className="think-quick">
          <button className="chip chip--ai" onClick={() => condenseGroup(mist.ids)}>
            ✦ mist is forming — condense “{mist.w}”
          </button>
        </div>
      )}

      {hub && (
        <div className="think-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <strong style={{ flex: 1 }}>{hub.name}</strong>
            <button aria-label="Close" className="faint" onClick={() => setSelectedHub(null)}>
              ×
            </button>
          </div>
          {hubMembers.slice(0, 5).map((m) => (
            <button key={m.id} className="row" onClick={() => navigate(`/thought/${m.id}`)}>
              <TypeBadge type={m.type} />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textDecoration: m.status === 'done' ? 'line-through' : 'none',
                }}
              >
                {m.title || m.raw_content.slice(0, 60)}
              </span>
              <span className="chev">›</span>
            </button>
          ))}
          {hubMembers.length > 5 && (
            <p className="faint" style={{ fontSize: 'var(--fs-caption)', margin: '6px 0' }}>
              +{hubMembers.length - 5} more inside
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {hub.saturated && (
              <button className="btn btn--accent btn--sm" onClick={() => rainFrom(hub.id)}>
                ☂ Make it rain
              </button>
            )}
            <button className="btn btn--ghost btn--sm" onClick={() => navigate(`/thought/${hub.id}`)}>
              Open
            </button>
          </div>
        </div>
      )}
    </>
  )
}
