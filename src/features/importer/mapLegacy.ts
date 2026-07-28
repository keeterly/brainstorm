// Pure mapping from the legacy VENIA OS workspace blob (venia_workspace.data)
// into the Brainstorm graph. Nothing is lost: whatever isn't modeled lands in
// import_archives verbatim.
import type { Memory, Relationship, ResearchArtifact, Thought } from '@/domain/types'

// ---- legacy shapes (only the fields we read) ----
interface LegacyChild {
  id?: string
  t?: string
  done?: boolean
  parentId?: string
  img?: string
}
interface LegacyItem {
  id?: string
  t?: string
  d?: string
  done?: boolean
  doneAt?: string
  due?: string
  snooze?: string
  parentId?: string
  img?: string
  children?: LegacyChild[]
  web?: {
    branches?: { label?: string; ids?: string[] }[]
    pos?: Record<string, { x: number; y: number }>
    extra?: { id?: string; parentId?: string; t?: string }[]
  }
  work?: { q?: string; md?: string; at?: string }
}
interface LegacyMemory {
  id?: string
  t?: string
  at?: string
  src?: string
}
export interface LegacyBlob {
  dump?: LegacyItem[]
  eniMemory?: LegacyMemory[]
  dumpMasterPos?: Record<string, { x: number; y: number }>
  [k: string]: unknown
}

export interface MappedImport {
  thoughts: Thought[]
  relationships: Relationship[]
  layouts: { scope: string; positions: Record<string, { x: number; y: number }> }[]
  memories: Memory[]
  artifacts: ResearchArtifact[]
  counts: {
    notes: number
    goals: number
    actions: number
    concepts: number
    ideas: number
    edges: number
    memories: number
    artifacts: number
  }
}

export function isLegacyBlob(v: unknown): v is LegacyBlob {
  return (
    !!v &&
    typeof v === 'object' &&
    (Array.isArray((v as LegacyBlob).dump) || Array.isArray((v as LegacyBlob).eniMemory))
  )
}

export function mapLegacy(
  blob: LegacyBlob,
  userId: string,
  newId: () => string = () => crypto.randomUUID(),
): MappedImport {
  const thoughts: Thought[] = []
  const relationships: Relationship[] = []
  const layouts: MappedImport['layouts'] = []
  const memories: Memory[] = []
  const artifacts: ResearchArtifact[] = []
  const counts = { notes: 0, goals: 0, actions: 0, concepts: 0, ideas: 0, edges: 0, memories: 0, artifacts: 0 }
  const idMap = new Map<string, string>() // old id -> new uuid
  const now = new Date().toISOString()

  const mapId = (oldId: string | undefined): string => {
    const key = oldId || `anon-${idMap.size}`
    let v = idMap.get(key)
    if (!v) {
      v = newId()
      idMap.set(key, v)
    }
    return v
  }

  const baseThought = (over: Partial<Thought>): Thought => ({
    id: newId(),
    user_id: userId,
    raw_content: '',
    title: null,
    summary: null,
    type: 'note',
    status: 'open',
    bucket: null,
    source: 'import',
    confidence: null,
    urgency: null,
    importance: null,
    effort: null,
    due_date: null,
    snooze_until: null,
    project_id: null,
    image_path: null,
    extra: {},
    created_at: now,
    updated_at: now,
    completed_at: null,
    ...over,
  })

  const edge = (fromId: string, toId: string, type: Relationship['type']) => {
    if (fromId === toId) return
    relationships.push({
      id: newId(),
      user_id: userId,
      from_id: fromId,
      to_id: toId,
      type,
      created_by: 'user',
      agent_run_id: null,
      created_at: now,
    })
    counts.edges++
  }

  const validDate = (s: string | undefined): string | null =>
    s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null

  for (const item of blob.dump ?? []) {
    const text = String(item.t ?? '').trim()
    if (!text) continue
    const isGoal = Array.isArray(item.children)
    const id = mapId(item.id)
    const created = item.d && !Number.isNaN(Date.parse(item.d)) ? item.d : now

    thoughts.push(
      baseThought({
        id,
        raw_content: text,
        title: text.split('\n')[0].slice(0, 120),
        type: isGoal ? 'goal' : 'note',
        status: item.done ? 'done' : 'open',
        completed_at: item.done ? (item.doneAt ?? now) : null,
        due_date: validDate(item.due),
        snooze_until: validDate(item.snooze),
        created_at: created,
        updated_at: created,
      }),
    )
    if (isGoal) counts.goals++
    else counts.notes++

    // Sub-goal nesting: item.parentId points at another dump item (a goal).
    if (item.parentId) edge(id, mapId(item.parentId), 'part_of')

    if (isGoal) {
      // Children: flat list where child.parentId may point at a sibling (a
      // nested sub-step); otherwise the child belongs to the goal directly.
      const childIds = new Set((item.children ?? []).map((c) => c.id).filter(Boolean))
      for (const c of item.children ?? []) {
        const ct = String(c.t ?? '').trim()
        if (!ct) continue
        const cid = mapId(c.id)
        thoughts.push(
          baseThought({
            id: cid,
            raw_content: ct,
            title: ct.slice(0, 120),
            type: 'action',
            status: c.done ? 'done' : 'open',
            completed_at: c.done ? now : null,
            created_at: created,
            updated_at: created,
          }),
        )
        counts.actions++
        const parent = c.parentId && childIds.has(c.parentId) ? mapId(c.parentId) : id
        edge(cid, parent, 'part_of')
      }

      // Mind-map branches become concept themes between goal and leaves.
      for (const b of item.web?.branches ?? []) {
        const label = String(b.label ?? '').trim()
        if (!label) continue
        const bid = newId()
        thoughts.push(
          baseThought({
            id: bid,
            raw_content: label,
            title: label.slice(0, 120),
            type: 'concept',
            created_at: created,
            updated_at: created,
          }),
        )
        counts.concepts++
        edge(bid, id, 'part_of')
        for (const leafOld of b.ids ?? []) {
          if (!idMap.has(leafOld)) continue // only re-point known children
          const leafNew = mapId(leafOld)
          // Re-point: leaf belongs to the branch, not directly to the goal.
          const direct = relationships.findIndex(
            (r) => r.from_id === leafNew && r.to_id === id && r.type === 'part_of',
          )
          if (direct >= 0) relationships[direct] = { ...relationships[direct], to_id: bid }
          else edge(leafNew, bid, 'part_of')
        }
      }

      // Free-floating idea nodes on the goal's map.
      for (const ex of item.web?.extra ?? []) {
        const et = String(ex.t ?? '').trim()
        if (!et) continue
        const eid = mapId(ex.id)
        thoughts.push(
          baseThought({
            id: eid,
            raw_content: et,
            title: et.slice(0, 120),
            type: 'idea',
            created_at: created,
            updated_at: created,
          }),
        )
        counts.ideas++
        const anchor = ex.parentId && idMap.has(ex.parentId) ? mapId(ex.parentId) : id
        edge(eid, anchor, 'relates_to')
      }

      // Saved positions for this goal's map (ids remapped; unknown ids dropped).
      const pos = item.web?.pos
      if (pos && Object.keys(pos).length) {
        const remapped: Record<string, { x: number; y: number }> = {}
        for (const [oldId, p] of Object.entries(pos)) {
          if (idMap.has(oldId) && p && typeof p.x === 'number' && typeof p.y === 'number') {
            remapped[mapId(oldId)] = { x: p.x, y: p.y }
          }
        }
        if (Object.keys(remapped).length) layouts.push({ scope: `thought:${id}`, positions: remapped })
      }
    }

    // Delegate/research briefs attach as research artifacts.
    if (item.work?.md) {
      artifacts.push({
        id: newId(),
        user_id: userId,
        thought_id: id,
        title: String(item.work.q ?? 'Imported brief').slice(0, 200),
        content_md: String(item.work.md),
        sources: [],
        agent_run_id: null,
        created_at: item.work.at && !Number.isNaN(Date.parse(item.work.at)) ? item.work.at : now,
      })
      counts.artifacts++
    }
  }

  // Master map positions → the brain scope.
  if (blob.dumpMasterPos && Object.keys(blob.dumpMasterPos).length) {
    const remapped: Record<string, { x: number; y: number }> = {}
    for (const [oldId, p] of Object.entries(blob.dumpMasterPos)) {
      if (idMap.has(oldId) && p && typeof p.x === 'number' && typeof p.y === 'number') {
        remapped[mapId(oldId)] = { x: p.x, y: p.y }
      }
    }
    if (Object.keys(remapped).length) layouts.push({ scope: 'brain', positions: remapped })
  }

  for (const m of blob.eniMemory ?? []) {
    const t = String(m.t ?? '').trim()
    if (!t) continue
    memories.push({
      id: newId(),
      user_id: userId,
      content: t,
      source: 'import',
      created_at: m.at && !Number.isNaN(Date.parse(m.at)) ? m.at : now,
    })
    counts.memories++
  }

  return { thoughts, relationships, layouts, memories, artifacts, counts }
}
