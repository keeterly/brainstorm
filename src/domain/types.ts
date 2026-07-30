// Core graph entities — mirror of the Supabase schema (0001_init.sql).

export const THOUGHT_TYPES = [
  'note',
  'idea',
  'task',
  'action',
  'question',
  'problem',
  'goal',
  'decision',
  'reference',
  'constraint',
  'inspiration',
  'concept',
] as const
export type ThoughtType = (typeof THOUGHT_TYPES)[number]

export const THOUGHT_STATUSES = ['open', 'done', 'snoozed', 'archived'] as const
export type ThoughtStatus = (typeof THOUGHT_STATUSES)[number]

export const BUCKETS = ['now', 'next', 'later', 'waiting'] as const
export type Bucket = (typeof BUCKETS)[number]

export const REL_TYPES = [
  'relates_to',
  'depends_on',
  'contradicts',
  'supports',
  'inspired_by',
  'blocks',
  'part_of',
  'evolved_into',
  'duplicates',
  'answers',
] as const
export type RelType = (typeof REL_TYPES)[number]

export interface Thought {
  id: string
  user_id: string
  raw_content: string
  title: string | null
  summary: string | null
  type: ThoughtType
  status: ThoughtStatus
  bucket: Bucket | null
  source: 'text' | 'voice' | 'import' | 'ai'
  confidence: number | null
  urgency: number | null
  importance: number | null
  effort: number | null
  due_date: string | null // YYYY-MM-DD
  snooze_until: string | null // YYYY-MM-DD
  project_id: string | null
  image_path: string | null
  extra: Record<string, unknown>
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Relationship {
  id: string
  user_id: string
  from_id: string
  to_id: string
  type: RelType
  created_by: 'user' | 'ai'
  agent_run_id: string | null
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  intent: string | null
  status: 'active' | 'paused' | 'done' | 'archived'
  created_at: string
  updated_at: string
}

export interface Layout {
  user_id: string
  scope: string // 'brain' | `project:${id}` | `thought:${id}`
  positions: Record<string, { x: number; y: number }>
  updated_at: string
}

export interface RoadmapPhaseAction {
  thought_id: string
  title: string
}
export interface RoadmapPhase {
  title: string
  why: string
  milestones: string[]
  actions: RoadmapPhaseAction[]
  risks: string[]
}
export interface Roadmap {
  id: string
  user_id: string
  goal_thought_id: string
  title: string
  phases: RoadmapPhase[]
  status: 'active' | 'archived'
  agent_run_id: string | null
  created_at: string
  updated_at: string
}

export interface ResearchArtifact {
  id: string
  user_id: string
  thought_id: string
  title: string
  content_md: string
  sources: { title: string; url: string }[]
  agent_run_id: string | null
  created_at: string
}

export interface Memory {
  id: string
  user_id: string
  content: string
  source: 'manual' | 'distilled' | 'import' | 'learned'
  created_at: string
  /** preference · constraint · pattern · fact · person · tool · goal */
  kind?: string | null
  /** how often it has proved worth having; never below 1 */
  strength?: number | null
  /** when it was last actually leaned on, which beats when it was written */
  last_used_at?: string | null
  updated_at?: string | null
  /** archived, not deleted: the agent corrects, it does not erase */
  archived_at?: string | null
  superseded_by?: string | null
  /** what it came out of, for the trail */
  origin?: Record<string, unknown> | null
}

/** One decision about the memory: what changed, and the reason given for it. */
export interface MemoryEvent {
  id: string
  user_id: string
  memory_id: string | null
  op: 'add' | 'update' | 'archive' | 'reinforce' | 'edit' | 'delete'
  before: string | null
  after: string | null
  why: string | null
  agent_run_id: string | null
  created_at: string
}

export interface AgentRun {
  id: string
  user_id: string
  action: string
  action_version: number
  status: 'running' | 'succeeded' | 'failed' | 'invalid_output'
  model: string | null
  input: unknown
  output: unknown
  error: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  latency_ms: number | null
  created_at: string
  finished_at: string | null
}

export interface Profile {
  id: string
  display_name: string | null
  settings: {
    autonomy?: 'suggest' | 'organize'
    recommended_action?: { id: string; why: string; at: string } | null
    [k: string]: unknown
  }
  created_at: string
}
