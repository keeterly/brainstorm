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
  memories: Memory[]
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

  addMemory(content: string, source?: Memory['source']): Memory
  updateMemory(id: string, content: string): void
  deleteMemory(id: string): void

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
      artifacts: s.artifacts,
      profile: s.profile,
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
  artifacts: [],
  profile: null,
  layouts: {},

  async hydrate(userId) {
    set({ userId })
    try {
      const [th, re, rm, me, ar, pr, la] = await Promise.all([
        supabase.from('thoughts').select('*').order('created_at', { ascending: false }).limit(5000),
        supabase.from('relationships').select('*').limit(20000),
        supabase.from('roadmaps').select('*'),
        supabase.from('memories').select('*').order('created_at'),
        supabase.from('research_artifacts').select('*'),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('layouts').select('*'),
      ])
      if (th.error) throw th.error
      const layouts: GraphState['layouts'] = {}
      for (const row of la.data ?? []) layouts[row.scope] = row.positions
      set({
        thoughts: (th.data ?? []) as Thought[],
        relationships: (re.data ?? []) as Relationship[],
        roadmaps: (rm.data ?? []) as Roadmap[],
        memories: (me.data ?? []) as Memory[],
        artifacts: (ar.data ?? []) as ResearchArtifact[],
        profile: (pr.data ?? null) as Profile | null,
        layouts,
        hydrated: true,
        offline: false,
      })
      scheduleSnapshot(get)
      void flush()
    } catch {
      // Offline (or server unreachable): open from the local snapshot.
      const snap = await loadSnapshot(userId)
      if (snap) {
        set({
          thoughts: snap.thoughts,
          relationships: snap.relationships,
          roadmaps: snap.roadmaps,
          memories: snap.memories,
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
      bucket: null,
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

  addMemory(content, source = 'manual') {
    const m: Memory = {
      id: crypto.randomUUID(),
      user_id: get().userId ?? '',
      content,
      source,
      created_at: nowISO(),
    }
    set((s) => ({ memories: [...s.memories, m] }))
    void write({ table: 'memories', op: 'insert', payload: m as unknown as Record<string, unknown> })
    scheduleSnapshot(get)
    return m
  },

  updateMemory(id, content) {
    set((s) => ({ memories: s.memories.map((m) => (m.id === id ? { ...m, content } : m)) }))
    void write({ table: 'memories', op: 'update', pk: { id }, payload: { content } })
    scheduleSnapshot(get)
  },

  deleteMemory(id) {
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
