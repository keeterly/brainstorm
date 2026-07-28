// The Interaction Engine (lite) — decides the ONE thing worth surfacing:
// a saturated cloud to rain, the chosen next action, or nothing. Surfaces
// consult this instead of inventing their own prompts.
import type { Profile, Relationship, Thought } from '@/domain/types'
import { saturatedCloud } from './weather'

export type NextBest =
  | { kind: 'rain'; cloud: Thought }
  | { kind: 'action'; thought: Thought; why: string }
  | { kind: 'none' }

export function nextBest(
  thoughts: Thought[],
  relationships: Relationship[],
  profile: Profile | null,
): NextBest {
  const cloud = saturatedCloud({ thoughts, relationships, profile })
  if (cloud) return { kind: 'rain', cloud }
  const rec = profile?.settings.recommended_action
  if (rec) {
    const t = thoughts.find((x) => x.id === rec.id && x.status === 'open')
    if (t) return { kind: 'action', thought: t, why: rec.why }
  }
  return { kind: 'none' }
}

/** How a thought falls as rain — its action phrasing (non-AI fallback; the
 *  full roadmap AI lives on the thought page). */
export function toAction(t: Thought): string {
  const s = (t.title || t.raw_content).replace(/\s+/g, ' ').trim()
  const bare = s.replace(/[.?!]$/, '')
  if (t.type === 'task' || t.type === 'action') return s[0].toUpperCase() + s.slice(1)
  if (t.type === 'question') return `Answer: ${s}`
  if (t.type === 'goal') return `Name the first step of “${bare}”`
  return `Spend 15 min exploring “${bare}”`
}
