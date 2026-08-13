// The weather report — the environment's one quiet sentence. Always the
// single most useful thing; never a dashboard.
import type { Profile, Relationship, Thought } from '@/domain/types'
import { isCloudType, looseDroplets } from './engine'

export interface WeatherInput {
  thoughts: Thought[]
  relationships: Relationship[]
  profile: Profile | null
}

export function cloudMembers(cloud: Thought, thoughts: Thought[], relationships: Relationship[]): Thought[] {
  const byId = new Map(thoughts.map((t) => [t.id, t]))
  return relationships
    .filter((r) => r.type === 'part_of' && r.to_id === cloud.id)
    .map((r) => byId.get(r.from_id))
    .filter((t): t is Thought => !!t)
}

/** A cloud is saturated when it holds 3+ open member thoughts but no open actions yet. */
export function saturatedCloud(input: WeatherInput): Thought | null {
  const clouds = input.thoughts.filter((t) => t.status === 'open' && isCloudType(t))
  for (const c of clouds) {
    const members = cloudMembers(c, input.thoughts, input.relationships).filter((m) => m.status === 'open')
    const actions = members.filter((m) => m.type === 'action' || m.type === 'task')
    if (members.length >= 3 && actions.length === 0) return c
  }
  return null
}

export function weatherLine(input: WeatherInput): string {
  const { thoughts, relationships } = input
  const saturated = saturatedCloud(input)
  if (saturated) return `“${saturated.title || 'a cloud'}” is saturated — open it to rain`

  const loose = looseDroplets(thoughts, relationships)
  const clouds = thoughts.filter((t) => t.status === 'open' && isCloudType(t)).length
  const openActions = thoughts.filter(
    (t) => t.status === 'open' && (t.type === 'action' || t.type === 'task'),
  ).length
  if (openActions) return `${openActions} action${openActions === 1 ? '' : 's'} in the current — pick one, do only that`
  if (clouds) return `${loose.length} thought${loose.length === 1 ? '' : 's'} adrift · ${clouds} cloud${clouds === 1 ? '' : 's'} in the sky`
  if (loose.length > 1) return 'drag thoughts together — three make a cloud'
  if (loose.length === 1) return 'one thought on the water — expand it, or add more'
  return 'clear skies — what is on your mind?'
}
