// IndexedDB snapshot of the graph — lets the PWA open offline with data.
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type {
  Memory,
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
  artifacts: ResearchArtifact[]
  profile: Profile | null
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
