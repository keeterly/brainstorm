// IndexedDB snapshot of the graph — lets the PWA open offline with data.
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type {
  Memory,
  MemoryEvent,
  Profile,
  Relationship,
  ResearchArtifact,
  Roadmap,
  Thought,
} from '@/domain/types'

export interface GraphSnapshot {
  userId: string
  thoughts: Thought[]
  relationships: Relationship[]
  roadmaps: Roadmap[]
  memories: Memory[]
  /** How it came to believe things. Optional: snapshots written before this. */
  memoryEvents?: MemoryEvent[]
  artifacts: ResearchArtifact[]
  profile: Profile | null
  /**
   * Where you put everything.
   *
   * Left out of the snapshot until now, which meant opening the app offline
   * restored `{}` — so the sky re-randomised every drop, and the first time
   * anything settled it wrote that scrambled arrangement back over the real
   * one. An hour of placing things by hand, undone by one launch on a plane.
   */
  layouts?: Record<string, Record<string, { x: number; y: number }>>
  savedAt: string
}

const KEY = 'brainstorm-snapshot-v1'

export async function saveSnapshot(s: GraphSnapshot): Promise<void> {
  try {
    await idbSet(KEY, s)
  } catch {
    /* storage full or private mode — snapshot is best-effort */
  }
}

export async function loadSnapshot(userId: string): Promise<GraphSnapshot | null> {
  try {
    const s = (await idbGet(KEY)) as GraphSnapshot | undefined
    return s && s.userId === userId ? s : null
  } catch {
    return null
  }
}

export async function clearSnapshot(): Promise<void> {
  try {
    await idbDel(KEY)
  } catch {
    /* ignore */
  }
}
