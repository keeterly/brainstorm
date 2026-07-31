// Where a row you are dragging would land.
//
// The list is drawn flat and means a tree: every line carries how far in it is,
// and its parent is whichever line above it sits one shallower. Dragging is
// therefore two questions at once — how far down, and how far in — and this
// answers both from a pointer position, so the pointer handling in the page has
// no geometry in it and this has no events in it.
//
// The rules are the ones every outliner has settled on, and they exist to make
// the illegal positions unreachable rather than to reject them afterwards:
//
//   * You may go one level deeper than the row above the gap, and no deeper.
//     A row cannot be a child of something two levels up that it is not under.
//   * You may not go shallower than the row *below* the gap, or you would leave
//     that row parented to something that is no longer above it.
//   * A row takes its own descendants with it, so none of them can be a
//     landing place — dropping a branch inside itself is the one move that
//     makes a piece of the tree unreachable from its own root.
/**
 * As far in as a row is allowed to go.
 *
 * Not an arbitrary limit: `branchesOf` stops walking here, so anything past it
 * is not drawn on the page at all. If the drag could reach one level further
 * than the list can show, the reward for nesting something that deep would be
 * watching it disappear — the exact failure that showing the tree was meant to
 * end. One number, read by the walk and by the drag.
 */
export const MAX_DEPTH = 6

export interface Line {
  id: string
  /** 0 for a direct member of the group whose page this is */
  depth: number
  /** middle of the row on screen, for deciding which gap the finger is in */
  mid: number
}

export interface Drop {
  /** what it becomes part of */
  parent: string
  /** the sibling it sits after, or null for first */
  after: string | null
  /** how far in it would be, for drawing the mark */
  depth: number
  /** the gap it would go into, counting gaps in the list without the dragged branch */
  gap: number
}

/** A row and everything under it travel together. */
export function branchOf(lines: readonly Line[], id: string): Line[] {
  const i = lines.findIndex((l) => l.id === id)
  if (i < 0) return []
  let end = i + 1
  while (end < lines.length && lines[end].depth > lines[i].depth) end++
  return lines.slice(i, end)
}

/**
 * Where the row would land, given where the finger is.
 *
 * `dx` is how far sideways it has been dragged from where it started; `indent`
 * is what one level is worth in pixels. Returns null only when the id is not in
 * the list.
 */
export function dropAt(
  lines: readonly Line[],
  dragId: string,
  y: number,
  dx: number,
  indent: number,
  groupId: string,
): Drop | null {
  const moving = branchOf(lines, dragId)
  if (!moving.length) return null
  const held = new Set(moving.map((l) => l.id))
  const rest = lines.filter((l) => !held.has(l.id))

  // the gap the finger is in: how many of the remaining rows it has passed
  let gap = 0
  while (gap < rest.length && y > rest[gap].mid) gap++

  const above = rest[gap - 1]
  const below = rest[gap]
  // one deeper than what is above the gap, and never shallower than what is
  // below it — the second rule is the one people forget, and without it
  // dragging left past a child leaves that child pointing at a row that is no
  // longer its parent
  const deepest = Math.min(above ? above.depth + 1 : 0, MAX_DEPTH)
  const shallowest = below ? below.depth : 0
  // a valid tree never has the row below a gap deeper than one past the row
  // above it, so these two always bracket rather than cross
  const wanted = moving[0].depth + Math.round(dx / indent)
  const depth = Math.min(deepest, Math.max(shallowest, wanted))

  // the parent is the nearest row above the gap that sits one shallower, and
  // the previous sibling is the nearest one at the same depth — walking back
  // until the tree gets shallower than we are, which is where this branch began
  let parent = groupId
  let after: string | null = null
  for (let i = gap - 1; i >= 0; i--) {
    const l = rest[i]
    if (l.depth === depth && after === null) after = l.id
    if (l.depth < depth) {
      parent = l.id
      break
    }
  }
  if (depth === 0) parent = groupId
  return { parent, after, depth, gap }
}
