// The World Engine (lite) — the environment is state made visible.
// Fog is uncertainty: loose thoughts and open questions thicken it; structure
// (clouds, connections) thins it. Light is clarity: it breaks through as
// actions are generated and completed. Pure functions; the Atmosphere
// component lerps toward these targets slowly, like weather.
import type { Relationship, Thought } from '@/domain/types'

export interface WorldState {
  fog: number // 0..1
  light: number // 0..1
}

export interface WorldInput {
  thoughts: Thought[]
  relationships: Relationship[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function isCloudType(t: Thought): boolean {
  return t.type === 'goal' || t.type === 'concept'
}

/** Thoughts that float as droplets: open, not clouds, not inside a cloud. */
export function looseDroplets(thoughts: Thought[], relationships: Relationship[]): Thought[] {
  const hasParent = new Set(relationships.filter((r) => r.type === 'part_of').map((r) => r.from_id))
  return thoughts.filter((t) => t.status === 'open' && !isCloudType(t) && !hasParent.has(t.id))
}

export function computeWorld(input: WorldInput): WorldState {
  const { thoughts, relationships } = input
  const open = thoughts.filter((t) => t.status === 'open')
  const loose = looseDroplets(thoughts, relationships)
  const questions = loose.filter((t) => t.type === 'question').length
  const clouds = open.filter(isCloudType).length
  const connections = relationships.length
  const doneRecent = thoughts.filter(
    (t) =>
      t.status === 'done' &&
      t.completed_at &&
      Date.now() - new Date(t.completed_at).getTime() < 72 * 3600 * 1000,
  ).length
  const openActions = open.filter((t) => t.type === 'action' || t.type === 'task').length

  const fog = clamp(
    0.2 +
      Math.min(0.32, loose.length * 0.045) +
      (loose.length ? (questions / loose.length) * 0.3 : 0) -
      clouds * 0.07 -
      Math.min(0.15, connections * 0.01),
    0.12,
    0.85,
  )
  const light = clamp(
    0.08 + doneRecent * 0.13 + clouds * 0.04 + Math.min(0.12, openActions * 0.015),
    0.06,
    0.85,
  )
  return { fog, light }
}
