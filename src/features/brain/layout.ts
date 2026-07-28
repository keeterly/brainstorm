// Default placement for nodes without a saved position: goals become hubs on a
// ring; their part_of members orbit them; loose thoughts fill an outer ring.
import type { Relationship, Thought } from '@/domain/types'

export const CANVAS = 4000
export const CENTER = CANVAS / 2

export interface Pos {
  x: number
  y: number
}

export function computeLayout(
  thoughts: Thought[],
  relationships: Relationship[],
  saved: Record<string, Pos>,
): Record<string, Pos> {
  const pos: Record<string, Pos> = {}
  const placed = (id: string) => saved[id] ?? pos[id]

  const parentOf = new Map<string, string>()
  for (const r of relationships) {
    if (r.type === 'part_of') parentOf.set(r.from_id, r.to_id)
  }

  const hubs = thoughts.filter((t) => t.type === 'goal' || t.type === 'concept')
  const hubRadius = Math.max(420, hubs.length * 90)
  hubs.forEach((h, i) => {
    if (placed(h.id)) return
    const a = (i / Math.max(hubs.length, 1)) * Math.PI * 2 - Math.PI / 2
    pos[h.id] = { x: CENTER + hubRadius * Math.cos(a), y: CENTER + hubRadius * Math.sin(a) }
  })

  // Members orbit their hub.
  const childCount = new Map<string, number>()
  for (const t of thoughts) {
    const hubId = parentOf.get(t.id)
    if (!hubId || placed(t.id)) continue
    const hubPos = saved[hubId] ?? pos[hubId]
    if (!hubPos) continue
    const n = childCount.get(hubId) ?? 0
    childCount.set(hubId, n + 1)
    const a = n * 0.9 - Math.PI / 2
    const r = 170 + Math.floor(n / 7) * 90
    pos[t.id] = { x: hubPos.x + r * Math.cos(a), y: hubPos.y + r * Math.sin(a) }
  }

  // Everything else: outer ring.
  const loose = thoughts.filter((t) => !placed(t.id))
  const outer = hubRadius + 500
  loose.forEach((t, i) => {
    const a = (i / Math.max(loose.length, 1)) * Math.PI * 2
    const jitter = (i % 3) * 60
    pos[t.id] = { x: CENTER + (outer + jitter) * Math.cos(a), y: CENTER + (outer + jitter) * Math.sin(a) }
  })

  return { ...pos, ...saved }
}
