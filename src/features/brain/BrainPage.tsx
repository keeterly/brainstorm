import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraph } from '@/store/graph'
import { useAction } from '@/ai/useAction'
import type { MakeMindMapOutput } from '@shared/ai/actions/make-mind-map'
import { computeLayout, CANVAS, CENTER, type Pos } from './layout'
import { TypeBadge } from '@/components/TypeBadge'
import type { RelType, Thought, ThoughtType } from '@/domain/types'

// Visual Brain — HTML nodes over an SVG edge layer inside one pan/zoom
// transform. Viewport + drags live in refs and mutate styles directly (no
// per-move React renders); React state changes only on gesture end.
const EDGE_STYLE: Record<RelType, { color: string; dash?: string; width: number }> = {
  relates_to: { color: 'var(--line-mid)', width: 1 },
  supports: { color: 'var(--map-1)', width: 1.5 },
  depends_on: { color: 'var(--map-4)', width: 1.5 },
  blocks: { color: 'var(--map-2)', width: 1.5 },
  contradicts: { color: 'var(--map-2)', dash: '6 4', width: 1.5 },
  inspired_by: { color: 'var(--map-3)', dash: '2 4', width: 1 },
  part_of: { color: 'var(--line-strong)', width: 1.5 },
  evolved_into: { color: 'var(--map-5)', width: 1.5 },
  duplicates: { color: 'var(--ink-faint)', dash: '2 2', width: 1 },
  answers: { color: 'var(--map-6)', width: 1.5 },
}

const TYPE_COLOR: Record<string, string> = {
  goal: 'var(--map-1)',
  concept: 'var(--map-6)',
  question: 'var(--map-3)',
  problem: 'var(--map-2)',
  decision: 'var(--map-5)',
  action: 'var(--map-4)',
}

interface VP {
  x: number
  y: number
  z: number
}

export default function BrainPage() {
  const navigate = useNavigate()
  const thoughts = useGraph((s) => s.thoughts)
  const relationships = useGraph((s) => s.relationships)
  const layouts = useGraph((s) => s.layouts)
  const offline = useGraph((s) => s.offline)
  const saveLayout = useGraph((s) => s.saveLayout)
  const addThought = useGraph((s) => s.addThought)
  const addRelationship = useGraph((s) => s.addRelationship)
  const toggleDone = useGraph((s) => s.toggleDone)

  const [outline, setOutline] = useState(false)
  const [filterTypes, setFilterTypes] = useState<Set<ThoughtType> | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<string | null>(null) // tapped node
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const mindMap = useAction<MakeMindMapOutput>('make_mind_map')

  const visible = useMemo(
    () =>
      thoughts.filter(
        (t) =>
          t.status !== 'archived' &&
          (showDone || t.status !== 'done') &&
          (!filterTypes || filterTypes.has(t.type)),
      ),
    [thoughts, filterTypes, showDone],
  )
  const visibleIds = useMemo(() => new Set(visible.map((t) => t.id)), [visible])
  const edges = useMemo(
    () => relationships.filter((r) => visibleIds.has(r.from_id) && visibleIds.has(r.to_id)),
    [relationships, visibleIds],
  )

  const positions = useMemo(
    () => computeLayout(visible, relationships, layouts['brain'] ?? {}),
    [visible, relationships, layouts],
  )

  // ---- viewport (refs; direct DOM transforms) ----
  const stageRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const vpRef = useRef<VP>({ x: 0, y: 0, z: 0.5 })
  const posRef = useRef<Record<string, Pos>>(positions)
  posRef.current = positions
  const dirtyPos = useRef<Record<string, Pos>>({})
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyVP = useCallback(() => {
    const w = worldRef.current
    if (!w) return
    const { x, y, z } = vpRef.current
    w.style.transform = `translate(${x}px, ${y}px) scale(${z})`
  }, [])

  const fit = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const pts = Object.entries(posRef.current).filter(([id]) => visibleIds.has(id))
    if (!pts.length) {
      vpRef.current = { x: stage.clientWidth / 2 - CENTER * 0.5, y: stage.clientHeight / 2 - CENTER * 0.5, z: 0.5 }
      applyVP()
      return
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [, p] of pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
    }
    const pad = 160
    const w = maxX - minX + pad * 2 || 1
    const h = maxY - minY + pad * 2 || 1
    const z = Math.min(2, Math.max(0.15, Math.min(stage.clientWidth / w, stage.clientHeight / h)))
    vpRef.current = {
      z,
      x: stage.clientWidth / 2 - (minX + (maxX - minX) / 2) * z,
      y: stage.clientHeight / 2 - (minY + (maxY - minY) / 2) * z,
    }
    applyVP()
  }, [applyVP, visibleIds])

  useEffect(() => {
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outline]) // refit when returning from outline; initial mount included

  // ---- gestures ----
  const gesture = useRef<{
    mode: 'none' | 'pan' | 'node' | 'pinch'
    id?: string
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
    p2?: { id1: number; id2: number; d0: number; z0: number; cx: number; cy: number }
    pointers: Map<number, { x: number; y: number }>
  }>({ mode: 'none', startX: 0, startY: 0, origX: 0, origY: 0, moved: false, pointers: new Map() })

  const schedulePersist = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      const merged = { ...(useGraph.getState().layouts['brain'] ?? {}), ...dirtyPos.current }
      dirtyPos.current = {}
      saveLayout('brain', merged)
    }, 600)
  }, [saveLayout])

  const redrawEdges = useCallback((movedId: string, p: Pos) => {
    const svg = worldRef.current?.querySelector('svg')
    if (!svg) return
    svg.querySelectorAll<SVGLineElement>(`line[data-from="${movedId}"]`).forEach((l) => {
      l.setAttribute('x1', String(p.x))
      l.setAttribute('y1', String(p.y))
    })
    svg.querySelectorAll<SVGLineElement>(`line[data-to="${movedId}"]`).forEach((l) => {
      l.setAttribute('x2', String(p.x))
      l.setAttribute('y2', String(p.y))
    })
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const g = gesture.current
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.entries()]
      g.mode = 'pinch'
      g.p2 = {
        id1: a[0],
        id2: b[0],
        d0: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y),
        z0: vpRef.current.z,
        cx: (a[1].x + b[1].x) / 2,
        cy: (a[1].y + b[1].y) / 2,
      }
      return
    }
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-node-id]')
    g.moved = false
    g.startX = e.clientX
    g.startY = e.clientY
    if (target) {
      const id = target.dataset.nodeId!
      g.mode = 'node'
      g.id = id
      const p = posRef.current[id]
      g.origX = p?.x ?? CENTER
      g.origY = p?.y ?? CENTER
    } else {
      g.mode = 'pan'
      g.origX = vpRef.current.x
      g.origY = vpRef.current.y
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current
      if (!g.pointers.has(e.pointerId)) return
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (g.mode === 'pinch' && g.p2) {
        const a = g.pointers.get(g.p2.id1)
        const b = g.pointers.get(g.p2.id2)
        if (!a || !b) return
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const z = Math.min(2.5, Math.max(0.15, (g.p2.z0 * d) / (g.p2.d0 || 1)))
        const vp = vpRef.current
        // zoom about the pinch center
        const wx = (g.p2.cx - vp.x) / vp.z
        const wy = (g.p2.cy - vp.y) / vp.z
        vp.z = z
        vp.x = g.p2.cx - wx * z
        vp.y = g.p2.cy - wy * z
        applyVP()
        return
      }
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true
      if (g.mode === 'pan') {
        vpRef.current.x = g.origX + dx
        vpRef.current.y = g.origY + dy
        applyVP()
      } else if (g.mode === 'node' && g.id) {
        const z = vpRef.current.z
        const p = { x: g.origX + dx / z, y: g.origY + dy / z }
        posRef.current[g.id] = p
        dirtyPos.current[g.id] = p
        const el = worldRef.current?.querySelector<HTMLElement>(`[data-node-id="${g.id}"]`)
        if (el) el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
        redrawEdges(g.id, p)
      }
    },
    [applyVP, redrawEdges],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current
      g.pointers.delete(e.pointerId)
      if (g.mode === 'pinch') {
        if (g.pointers.size < 2) g.mode = 'none'
        return
      }
      if (g.mode === 'node' && g.id) {
        if (!g.moved) {
          // Tap
          const id = g.id
          if (connectFrom && connectFrom !== id) {
            addRelationship(connectFrom, id, 'relates_to')
            setConnectFrom(null)
            setNotice('Connected — edit the type from either thought')
          } else if (selectMode) {
            setSelected((s) => {
              const n = new Set(s)
              if (n.has(id)) n.delete(id)
              else n.add(id)
              return n
            })
          } else {
            setActive((a) => (a === id ? null : id))
          }
        } else {
          schedulePersist()
        }
      }
      g.mode = 'none'
      g.id = undefined
    },
    [addRelationship, connectFrom, selectMode, schedulePersist],
  )

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const vp = vpRef.current
      const z = Math.min(2.5, Math.max(0.15, vp.z * (e.deltaY < 0 ? 1.1 : 0.9)))
      const wx = (e.clientX - vp.x) / vp.z
      const wy = (e.clientY - vp.y) / vp.z
      vp.z = z
      vp.x = e.clientX - wx * z
      vp.y = e.clientY - wy * z
      applyVP()
    },
    [applyVP],
  )

  // ---- AI organize ----
  async function organize() {
    const subject = selected.size >= 2 ? visible.filter((t) => selected.has(t.id)) : visible
    const input = subject.slice(0, 120).map((t) => ({
      id: t.id,
      title: t.title || t.raw_content.slice(0, 100),
      type: t.type,
      summary: t.summary,
    }))
    if (input.length < 2) {
      setNotice('Capture a few thoughts first')
      return
    }
    const out = await mindMap.run({ thoughts: input })
    if (!out) return
    // Apply: new nodes become thoughts; edges become relationships. Partial
    // application is fine — whatever validated gets used.
    const tempToReal = new Map<string, string>()
    const inputIds = new Set(input.map((i) => i.id))
    for (const n of out.newNodes) {
      const th = addThought({ raw_content: n.title, title: n.title, type: n.type, source: 'ai' })
      tempToReal.set(n.tempId, th.id)
    }
    const resolve = (ref: { id?: string; tempId?: string }): string | null => {
      if ('id' in ref && ref.id) return inputIds.has(ref.id) ? ref.id : null
      if ('tempId' in ref && ref.tempId) return tempToReal.get(ref.tempId) ?? null
      return null
    }
    let applied = 0
    let skipped = 0
    for (const e of out.edges) {
      const from = resolve(e.from)
      const to = resolve(e.to)
      if (from && to && from !== to) {
        addRelationship(from, to, e.relType, 'ai')
        applied++
      } else skipped++
    }
    // Place new nodes near the average of their connected members.
    const merged = { ...(useGraph.getState().layouts['brain'] ?? {}) }
    for (const [tempId, realId] of tempToReal) {
      const memberPts: Pos[] = []
      for (const e of out.edges) {
        const from = resolve(e.from)
        const to = resolve(e.to)
        const other = from === realId ? to : to === realId ? from : null
        const p = other ? posRef.current[other] : null
        if (p) memberPts.push(p)
      }
      void tempId
      merged[realId] = memberPts.length
        ? {
            x: memberPts.reduce((s, p) => s + p.x, 0) / memberPts.length,
            y: memberPts.reduce((s, p) => s + p.y, 0) / memberPts.length - 120,
          }
        : { x: CENTER + Math.random() * 200 - 100, y: CENTER + Math.random() * 200 - 100 }
    }
    saveLayout('brain', merged)
    setSelected(new Set())
    setSelectMode(false)
    setNotice(`${out.insight} (${applied} connections${skipped ? `, ${skipped} skipped` : ''})`)
  }

  const activeThought = active ? thoughts.find((t) => t.id === active) : null

  if (outline) {
    return (
      <OutlineView
        visible={visible}
        onCanvas={() => setOutline(false)}
        onOpen={(id) => navigate(`/thought/${id}`)}
      />
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        bottom: 'calc(var(--tabbar-h) + var(--sab))',
        overflow: 'hidden',
        background: 'var(--bg)',
        touchAction: 'none',
      }}
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {/* world */}
      <div
        ref={worldRef}
        style={{ position: 'absolute', width: CANVAS, height: CANVAS, transformOrigin: '0 0', willChange: 'transform' }}
      >
        <svg width={CANVAS} height={CANVAS} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {edges.map((r) => {
            const a = positions[r.from_id]
            const b = positions[r.to_id]
            if (!a || !b) return null
            const st = EDGE_STYLE[r.type]
            return (
              <line
                key={r.id}
                data-from={r.from_id}
                data-to={r.to_id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={st.color}
                strokeWidth={st.width}
                strokeDasharray={st.dash}
                opacity={0.7}
              />
            )
          })}
        </svg>
        {visible.map((t) => {
          const p = positions[t.id]
          if (!p) return null
          const hub = t.type === 'goal' || t.type === 'concept'
          const color = TYPE_COLOR[t.type]
          const isSel = selected.has(t.id)
          const isActive = active === t.id
          const isConnectSrc = connectFrom === t.id
          return (
            <div
              key={t.id}
              data-node-id={t.id}
              style={{
                position: 'absolute',
                transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`,
                maxWidth: hub ? 220 : 180,
                padding: hub ? '10px 14px' : '7px 11px',
                background: t.status === 'done' ? 'var(--bg-sunken)' : 'var(--bg-raised)',
                border: `${isActive || isSel || isConnectSrc ? 2 : 1}px solid ${
                  isConnectSrc ? 'var(--accent)' : isSel ? 'var(--accent)' : isActive ? 'var(--ink)' : color || 'var(--line-mid)'
                }`,
                borderRadius: hub ? 'var(--r-lg)' : 'var(--r-md)',
                fontSize: hub ? 'var(--fs-label)' : 'var(--fs-caption)',
                fontWeight: hub ? 700 : 500,
                color: t.status === 'done' ? 'var(--ink-faint)' : 'var(--ink)',
                textDecoration: t.status === 'done' ? 'line-through' : 'none',
                boxShadow: isActive ? 'var(--shadow-pop)' : 'none',
                cursor: 'grab',
                userSelect: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {color && (
                <span
                  aria-hidden
                  style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 6 }}
                />
              )}
              {t.title || t.raw_content.slice(0, 90)}
            </div>
          )
        })}
      </div>

      {/* top bar */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(var(--sat) + 8px)',
          left: 8,
          right: 8,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
          pointerEvents: 'none',
        }}
      >
        {[
          { label: mindMap.status === 'running' ? '✦ Organizing…' : '✦ Organize', fn: organize, disabled: mindMap.status === 'running' || offline, accent: true },
          { label: selectMode ? `Selecting (${selected.size})` : 'Select', fn: () => { setSelectMode((m) => !m); setSelected(new Set()) }, on: selectMode },
          { label: 'Fit', fn: fit },
          { label: 'Outline', fn: () => setOutline(true) },
          { label: showDone ? 'Hide done' : 'Show done', fn: () => setShowDone((s) => !s) },
        ].map((b, i) => (
          <button
            key={i}
            className={`chip ${b.on ? 'chip--on' : ''} ${b.accent ? 'chip--ai' : ''}`}
            style={{ pointerEvents: 'auto', boxShadow: 'var(--shadow-pop)' }}
            disabled={b.disabled}
            onClick={b.fn}
          >
            {b.label}
          </button>
        ))}
        <TypeFilter current={filterTypes} onChange={setFilterTypes} />
      </div>

      {(notice || mindMap.status === 'error') && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 84,
            padding: '10px 14px',
            borderRadius: 'var(--r-md)',
            background: mindMap.status === 'error' ? 'var(--danger-soft)' : 'var(--bg-inverse)',
            color: mindMap.status === 'error' ? 'var(--danger)' : 'var(--ink-on-inverse)',
            fontSize: 'var(--fs-label)',
            boxShadow: 'var(--shadow-pop)',
          }}
          onClick={() => setNotice(null)}
        >
          {mindMap.status === 'error' ? (
            <>
              {mindMap.error}{' '}
              <button style={{ textDecoration: 'underline', color: 'inherit' }} onClick={mindMap.retry}>
                Retry
              </button>
            </>
          ) : (
            notice
          )}
        </div>
      )}

      {connectFrom && (
        <div
          role="status"
          style={{ position: 'absolute', left: 12, right: 12, bottom: 84, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'var(--accent)', color: '#fff', fontSize: 'var(--fs-label)', display: 'flex', justifyContent: 'space-between' }}
        >
          Tap another node to connect
          <button style={{ color: '#fff', textDecoration: 'underline' }} onClick={() => setConnectFrom(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* node action bar */}
      {activeThought && !connectFrom && (
        <div
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 8,
            background: 'var(--bg-raised)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--shadow-pop)',
            padding: 'var(--sp-3)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <TypeBadge type={activeThought.type} />
            <strong style={{ flex: 1, fontSize: 'var(--fs-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeThought.title || activeThought.raw_content.slice(0, 60)}
            </strong>
            <button aria-label="Close" className="faint" onClick={() => setActive(null)}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn--sm" onClick={() => navigate(`/thought/${activeThought.id}`)}>Open</button>
            <button className="btn btn--sm btn--ghost" onClick={() => { setConnectFrom(activeThought.id); setActive(null) }}>⇄ Connect</button>
            <button className="btn btn--sm btn--ghost" onClick={() => toggleDone(activeThought.id)}>
              {activeThought.status === 'done' ? 'Reopen' : '✓ Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TypeFilter({
  current,
  onChange,
}: {
  current: Set<ThoughtType> | null
  onChange: (v: Set<ThoughtType> | null) => void
}) {
  const [open, setOpen] = useState(false)
  const OPTIONS: ThoughtType[] = ['goal', 'idea', 'action', 'question', 'note', 'concept', 'decision']
  return (
    <span style={{ pointerEvents: 'auto', position: 'relative' }}>
      <button className={`chip ${current ? 'chip--on' : ''}`} style={{ boxShadow: 'var(--shadow-pop)' }} onClick={() => setOpen((o) => !o)}>
        Filter{current ? ` (${current.size})` : ''}
      </button>
      {open && (
        <div
          style={{ position: 'absolute', top: 34, left: 0, zIndex: 60, background: 'var(--bg-raised)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-pop)', padding: 8, display: 'grid', gap: 4, minWidth: 140 }}
        >
          {OPTIONS.map((ty) => {
            const on = current?.has(ty) ?? false
            return (
              <button
                key={ty}
                className={`chip ${on ? 'chip--on' : ''}`}
                onClick={() => {
                  const next = new Set(current ?? [])
                  if (on) next.delete(ty)
                  else next.add(ty)
                  onChange(next.size ? next : null)
                }}
              >
                {ty}
              </button>
            )
          })}
          <button className="chip" onClick={() => { onChange(null); setOpen(false) }}>
            Clear
          </button>
        </div>
      )}
    </span>
  )
}

function OutlineView({
  visible,
  onCanvas,
  onOpen,
}: {
  visible: Thought[]
  onCanvas: () => void
  onOpen: (id: string) => void
}) {
  const relationships = useGraph((s) => s.relationships)
  const partOf = new Map<string, string[]>()
  for (const r of relationships) {
    if (r.type === 'part_of') {
      const arr = partOf.get(r.to_id) ?? []
      arr.push(r.from_id)
      partOf.set(r.to_id, arr)
    }
  }
  const byId = new Map(visible.map((t) => [t.id, t]))
  const childIds = new Set([...partOf.values()].flat())
  const roots = visible.filter((t) => !childIds.has(t.id))

  const renderNode = (t: Thought, depth: number): React.ReactNode => (
    <div key={t.id} style={{ marginLeft: depth * 20 }}>
      <button
        onClick={() => onOpen(t.id)}
        style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', textAlign: 'left', width: '100%' }}
      >
        <TypeBadge type={t.type} />
        <span style={{ fontSize: 'var(--fs-label)', textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--ink-faint)' : 'var(--ink)' }}>
          {t.title || t.raw_content.slice(0, 100)}
        </span>
      </button>
      {(partOf.get(t.id) ?? [])
        .map((id) => byId.get(id))
        .filter((c): c is Thought => !!c)
        .map((c) => renderNode(c, depth + 1))}
    </div>
  )

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 className="page-title">Brain</h1>
        <button className="chip" onClick={onCanvas}>Canvas view</button>
      </div>
      {roots.length === 0 && <p className="faint">Nothing to show yet.</p>}
      {roots.map((t) => renderNode(t, 0))}
    </div>
  )
}
