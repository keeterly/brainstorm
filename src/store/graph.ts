// The in-memory graph — single source of truth for the UI.
// Server-authoritative with optimistic writes: every mutation updates this
// store immediately and write-throughs to Supabase via the outbox.
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { write, flush } from '@/lib/outbox'
import { saveSnapshot, loadSnapshot } from '@/lib/idb'
import type {
  Bucket,
  Memory,
  MemoryEvent,
  Profile,
  Relationship,
  RelType,
  ResearchArtifact,
  Roadmap,
  Thought,
  ThoughtStatus,
  ThoughtType,
} from '@/domain/types'

export interface NewThought {
  id?: string
  raw_content: string
  title?: string | null
  summary?: string | null
  type?: ThoughtType
  source?: Thought['source']
  due_date?: string | null
  project_id?: string | null
  effort?: number | null
  bucket?: Bucket | null
  extra?: Record<string, unknown>
  created_at?: string
}

interface GraphState {
  userId: string | null
  hydrated: boolean
  offline: boolean
  thoughts: Thought[]
  relationships: Relationship[]
  roadmaps: Roadmap[]
  /** Everything, believed and archived. Readers that feed a prompt use live(). */
  memories: Memory[]
  memoryEvents: MemoryEvent[]
  artifacts: ResearchArtifact[]
  profile: Profile | null
  layouts: Record<string, Record<string, { x: number; y: number }>>

  hydrate(userId: string): Promise<void>
  reset(): void

  addThought(t: NewThought): Thought
  updateThought(id: string, patch: Partial<Thought>): void
  deleteThought(id: string): void
  toggleDone(id: string): void

  addRelationship(fromId: string, toId: string, type: RelType, createdBy?: 'user' | 'ai', agentRunId?: string | null): Relationship | null
  updateRelationship(id: string, type: RelType): void
  deleteRelationship(id: string): void

  addMemory(content: string, source?: Memory['source'], extra?: Partial<Memory>): Memory
  updateMemory(id: string, content: string): void
  deleteMemory(id: string): void
  /** Correct one in place, keeping its id, its strength and its history. */
  reviseMemory(id: string, patch: Partial<Memory>): void
  /** Stop believing it. Archived rather than erased — the trail is the point. */
  archiveMemory(id: string, supersededBy?: string | null): void
  /** These were used and nothing contradicted them. Persisted at most hourly. */
  reinforceMemories(ids: string[]): void
  /** One line in the record of how it came to believe something. */
  noteMemory(e: Omit<MemoryEvent, 'id' | 'user_id' | 'created_at'>): void

  addRoadmap(r: Omit<Roadmap, 'user_id' | 'created_at' | 'updated_at'>): void
  addArtifact(a: Omit<ResearchArtifact, 'user_id' | 'created_at'>): void

  saveLayout(scope: string, positions: Record<string, { x: number; y: number }>): void
  updateProfileSettings(patch: Record<string, unknown>): void
  setBucket(id: string, bucket: Bucket | null): void
}

let snapshotTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSnapshot(get: () => GraphState) {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(() => {
    const s = get()
    if (!s.userId) return
    void saveSnapshot({
      userId: s.userId,
      thoughts: s.thoughts,
      relationships: s.relationships,
      roadmaps: s.roadmaps,
      memories: s.memories,
      memoryEvents: s.memoryEvents,
      artifacts: s.artifacts,
      profile: s.profile,
      layouts: s.layouts,
      savedAt: new Date().toISOString(),
    })
  }, 800)
}

function nowISO() {
  return new Date().toISOString()
}

export const useGraph = create<GraphState>((set, get) => ({
  userId: null,
  hydrated: false,
  offline: false,
  thoughts: [],
  relationships: [],
  roadmaps: [],
  memories: [],
  memoryEvents: [],
  artifacts: [],
  profile: null,
  layouts: {},

  async hydrate(userId) {
    set({ userId })
    try {
      // Send what is owed before asking what is there. The other way round —
      // read the server, overwrite the store, *then* flush — means the fresh
      // server rows momentarily replace edits that have not landed yet, and
      // the snapshot written straight afterwards captures the graph without
      // them. Harmless in the happy case, and the exact shape of a lost edit
      // in every other one.
      await flush()
      const [th, re, rm, me, ev, ar, pr, la] = await Promise.all([
        supabase.from('thoughts').select('*').order('created_at', { ascending: false }).limit(5000),
        supabase.from('relationships').select('*').limit(20000),
        supabase.from('roadmaps').select('*'),
        supabase.from('memories').select('*').order('created_at'),
        supabase.from('memory_events').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('research_artifacts').select('*'),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('layouts').select('*'),
      ])
      // Every one of them, not just the thoughts.
      //
      // Only `th.error` was checked, so a relationships query that failed on
      // its own gave you `hydrated: true, offline: false` with an empty edge
      // set — every pool in the sky dissolved, nothing read as blocked, the
      // Current showed no dependencies — and `scheduleSnapshot` then wrote
      // that blank graph over the good local copy. A partial answer is not an
      // answer; fall through to the snapshot like any other failure.
      const bad = [th, re, rm, me, ev, ar, pr, la].find((r) => r.error)
      if (bad?.error) throw bad.error
      const layouts: GraphState['layouts'] = {}
      for (const row of la.data ?? []) layouts[row.scope] = row.positions
      set({
        thoughts: (th.data ?? []) as Thought[],
        relationships: (re.data ?? []) as Relationship[],
        roadmaps: (rm.data ?? []) as Roadmap[],
        memories: (me.data ?? []) as Memory[],
        memoryEvents: (ev.data ?? []) as MemoryEvent[],
        artifacts: (ar.data ?? []) as ResearchArtifact[],
        profile: (pr.data ?? null) as Profile | null,
        layouts,
        hydrated: true,
        offline: false,
      })
      scheduleSnapshot(get)
    } catch {
      // Offline (or server unreachable): open from the local snapshot.
      const snap = await loadSnapshot(userId)
      if (snap) {
        set({
          thoughts: snap.thoughts,
          relationships: snap.relationships,
          roadmaps: snap.roadmaps,
          memories: snap.memories,
          // Both of these used to be dropped on the floor. Without `layouts`
          // the sky reshuffled itself and then saved the reshuffle; without
          // `memoryEvents` the Memory page's record of what it changed its
          // mind about was silently empty — the one section whose whole point
          // is that it must never be invisible.
          memoryEvents: snap.memoryEvents ?? [],
          layouts: snap.layouts ?? {},
          artifacts: snap.artifacts,
          profile: snap.profile,
          hydrated: true,
          offline: true,
        })
      } else {
        set({ hydrated: true, offline: true })
      }
    }
  },

  reset() {
    set({
      userId: null,
      hydrated: false,
      offline: false,
      thoughts: [],
      relationships: [],
      roadmaps: [],
      memories: [],
      memoryEvents: [],
      artifacts: [],
      profile: null,
      layouts: {},
    })
  },

  addThought(input) {
    const userId = get().userId ?? ''
    const t: Thought = {
      id: input.id ?? crypto.randomUUID(),
      user_id: userId,
      raw_content: input.raw_content,
      title: input.title ?? null,
      summary: input.summary ?? null,
      type: input.type ?? 'note',
      status: 'open',
      bucket: input.bucket ?? null,
      source: input.source ?? 'text',
      confidence: null,
      urgency: null,
      importance: null,
      effort: input.effort ?? null,
      due_date: input.due_date ?? null,
      snooze_until: null,
      project_id: input.project_id ?? null,
      image_path: null,
      extra: input.extra ?? {},
      created_at: input.created_at ?? nowISO(),
      updated_at: nowISO(),
      completed_at: null,
    }
    set((s) => ({ thoughts: [t, ...s.thoughts] }))
    void write({ table: 'thoughts', op: 'insert', payload: t as unknown as Record<string, unknown> })
    scheduleSnapshot(get)
    return t
  },

  updateThought(id, patch) {
    const updated_at = nowISO()
    set((s) => ({
      thoughts: s.thoughts.map((t) => (t.id === id ? { ...t, ...patch, updated_at } : t)),
    }))
    void write({
      table: 'thoughts',
      op: 'update',
      pk: { id },
      payload: { ...patch, updated_at } as Record<string, unknown>,
    })
    scheduleSnapshot(get)
  },

  deleteThought(id) {
    set((s) => ({
      thoughts: s.thoughts.filter((t) => t.id !== id),
      relationships: s.relationships.filter((r) => r.from_id !== id && r.to_id !== id),
    }))
    void write({ table: 'thoughts', op: 'delete', pk: { id } })
    scheduleSnapshot(get)
  },

  toggleDone(id) {
    const t = get().thoughts.find((x) => x.id === id)
    if (!t) return
    const done = t.status !== 'done'
    get().updateThought(id, {
      status: (done ? 'done' : 'open') as ThoughtStatus,
      completed_at: done ? nowISO() : null,
    })
  },

  addRelationship(fromId, toId, type, createdBy = 'user', agentRunId = null) {
    if (fromId === toId) return null
    const exists = get().relationships.some(
      (r) => r.from_id === fromId && r.to_id === toId && r.type === type,
    )
    if (exists) return null
    const r: Relationship = {
      id: crypto.randomUUID(),
      user_id: get().userId ?? '',
      from_id: fromId,
      to_id: toId,
      type,
      created_by: createdBy,
      agent_run_id: agentRunId,
      created_at: nowISO(),
    }
    set((s) => ({ relationships: [...s.relationships, r] }))
    void write({ table: 'relationships', op: 'insert', payload: r as unknown as Record<string, unknown> })
    scheduleSnapshot(get)
    return r
  },

  updateRelationship(id, type) {
    set((s) => ({
      relationships: s.relationships.map((r) => (r.id === id ? { ...r, type } : r)),
    }))
    void write({ table: 'relationships', op: 'update', pk: { id }, payload: { type } })
    scheduleSnapshot(get)
  },

  deleteRelationship(id) {
    set((s) => ({ relationships: s.relationships.filter((r) => r.id !== id) }))
    void write({ table: 'relationships', op: 'delete', pk: { id } })
    scheduleSnapshot(get)
  },

  addMemory(content, source = 'manual', extra) {
    const m: Memory = {
      id: crypto.randomUUID(),
      user_id: get().userId ?? '',
      content,
      source,
      created_at: nowISO(),
      kind: extra?.kind ?? null,
      strength: extra?.strength ?? 1,
      last_used_at: null,
      updated_at: null,
      archived_at: null,
      superseded_by: null,
      origin: extra?.origin ?? null,
    }
    set((s) => ({ memories: [...s.memories, m] }))
    void write({ table: 'memories', op: 'insert', payload: m as unknown as Record<string, unknown> })
    scheduleSnapshot(get)
    return m
  },

  updateMemory(id, content) {
    const updated_at = nowISO()
    set((s) => ({ memories: s.memories.map((m) => (m.id === id ? { ...m, content, updated_at } : m)) }))
    void write({ table: 'memories', op: 'update', pk: { id }, payload: { content, updated_at } })
    scheduleSnapshot(get)
  },

  reviseMemory(id, patch) {
    const updated_at = nowISO()
    set((s) => ({ memories: s.memories.map((m) => (m.id === id ? { ...m, ...patch, updated_at } : m)) }))
    void write({
      table: 'memories',
      op: 'update',
      pk: { id },
      payload: { ...patch, updated_at } as Record<string, unknown>,
    })
    scheduleSnapshot(get)
  },

  archiveMemory(id, supersededBy = null) {
    const archived_at = nowISO()
    set((s) => ({
      memories: s.memories.map((m) =>
        m.id === id ? { ...m, archived_at, superseded_by: supersededBy, updated_at: archived_at } : m,
      ),
    }))
    void write({
      table: 'memories',
      op: 'update',
      pk: { id },
      payload: { archived_at, superseded_by: supersededBy, updated_at: archived_at },
    })
    scheduleSnapshot(get)
  },

  /**
   * It came along on a prompt and nothing contradicted it.
   *
   * Local state moves every time, because the ranker should see the new
   * strength on the very next call. The write does not: `last_used_at` to the
   * minute is worth nothing, and persisting eight rows on every action would
   * roughly double what this app writes. Once an hour per memory is plenty to
   * tell a fact that earns its place from one that has ridden along unread
   * since March.
   */
  reinforceMemories(ids) {
    if (!ids.length) return
    const at = nowISO()
    const cutoff = Date.now() - 3600_000
    const persist: string[] = []
    set((s) => ({
      memories: s.memories.map((m) => {
        if (!ids.includes(m.id) || m.archived_at) return m
        const last = m.last_used_at ? Date.parse(m.last_used_at) : 0
        const strength = (m.strength ?? 1) + 1
        if (!(last > cutoff)) persist.push(m.id)
        return { ...m, strength, last_used_at: at }
      }),
    }))
    for (const id of persist) {
      const m = get().memories.find((x) => x.id === id)
      if (!m) continue
      void write({ table: 'memories', op: 'update', pk: { id }, payload: { strength: m.strength, last_used_at: at } })
    }
    if (persist.length) scheduleSnapshot(get)
  },

  noteMemory(e) {
    const row: MemoryEvent = {
      ...e,
      id: crypto.randomUUID(),
      user_id: get().userId ?? '',
      created_at: nowISO(),
    }
    set((s) => ({ memoryEvents: [row, ...s.memoryEvents].slice(0, 500) }))
    void write({ table: 'memory_events', op: 'insert', payload: row as unknown as Record<string, unknown> })
  },

  deleteMemory(id) {
    // Yours to erase, unlike the agent's archive. The event survives the row —
    // memory_id falls to null and `before` keeps the words — so a memory you
    // threw away cannot quietly come back a week later with no sign it ever
    // went, which is the failure that makes a memory feature untrustworthy.
    const gone = get().memories.find((m) => m.id === id)
    if (gone) get().noteMemory({ memory_id: id, op: 'delete', before: gone.content, after: null, why: null, agent_run_id: null })
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }))
    void write({ table: 'memories', op: 'delete', pk: { id } })
    scheduleSnapshot(get)
  },

  addRoadmap(r) {
    const full: Roadmap = {
      ...r,
      user_id: get().userId ?? '',
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    set((s) => ({
      roadmaps: [
        full,
        ...s.roadmaps.map((x) =>
          x.goal_thought_id === full.goal_thought_id && x.status === 'active'
            ? { ...x, status: 'archived' as const }
            : x,
        ),
      ],
    }))
    // Archive any previous active roadmap for the same goal, then insert.
    const prev = get().roadmaps.filter(
      (x) => x.goal_thought_id === full.goal_thought_id && x.id !== full.id && x.status === 'archived',
    )
    for (const p of prev) {
      void write({ table: 'roadmaps', op: 'update', pk: { id: p.id }, payload: { status: 'archived' } })
    }
    void write({ table: 'roadmaps', op: 'insert', payload: full as unknown as Record<string, unknown> })
    scheduleSnapshot(get)
  },

  addArtifact(a) {
    const full: ResearchArtifact = { ...a, user_id: get().userId ?? '', created_at: nowISO() }
    set((s) => ({ artifacts: [full, ...s.artifacts] }))
    void write({ table: 'research_artifacts', op: 'insert', payload: full as unknown as Record<string, unknown> })
    scheduleSnapshot(get)
  },

  saveLayout(scope, positions) {
    set((s) => ({ layouts: { ...s.layouts, [scope]: positions } }))
    void write({
      table: 'layouts',
      op: 'upsert',
      payload: {
        user_id: get().userId,
        scope,
        positions,
        updated_at: nowISO(),
      },
    })
  },

  updateProfileSettings(patch) {
    const p = get().profile
    if (!p) return
    const settings = { ...p.settings, ...patch }
    set({ profile: { ...p, settings } })
    void write({ table: 'profiles', op: 'update', pk: { id: p.id }, payload: { settings } })
    scheduleSnapshot(get)
  },

  setBucket(id, bucket) {
    get().updateThought(id, { bucket })
  },
}))
