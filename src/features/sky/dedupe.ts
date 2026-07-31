import { useGraph } from '@/store/graph'
/**
 * What is already hanging under this, folded flat for comparison.
 *
 * Both `deepen` and `rain` are told what is already there and asked not to
 * repeat it, and both are handed the answer straight into `addThought` with
 * nothing checking. Run ⚡ on the same goal twice — or once, and then have a
 * background run collected a second time — and the same five steps arrive
 * again underneath the first five. There is no undo for that and no way to
 * tell which copy is which; you delete them one at a time.
 *
 * A prompt is a request. This is the guard.
 */
export function alreadyThere(subjectId: string): Set<string> {
  const s = useGraph.getState()
  const flat = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return new Set(
    s.relationships
      .filter((r) => r.type === 'part_of' && r.to_id === subjectId)
      .map((r) => s.thoughts.find((t) => t.id === r.from_id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => flat(t.title || t.raw_content)),
  )
}

/** The same flattening, so a caller can ask about one title. */
export function sameAs(set: Set<string>, title: string): boolean {
  return set.has(title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
}
