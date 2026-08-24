/*
 * The brief, drawn instead of written.
 *
 * `deepen` — the action behind `work it` — comes back with a weighted DAG:
 * steps in the order they should be done, each with an effort of one to five,
 * and a `dependsOn` list wherever order genuinely matters. `applyDeepen` turns
 * every one of those into a real thought with real `depends_on` edges.
 *
 * And then the brief page threw all of it away. The output was flattened into
 * a markdown string that mentioned neither the effort nor the dependencies, and
 * the page re-parsed that string back into paragraphs. The app built a graph,
 * wrote sentences about it, and showed you the sentences. Up to nine kilobytes
 * of them, with no clamp anywhere, over a single hairline rule.
 *
 * This works out where the pieces go so they can be drawn instead. It reads the
 * live graph rather than the frozen string, which is why ticking a step now
 * changes the picture — the old brief was a photograph of what the model said,
 * for ever.
 *
 * Two facts from `deepen`'s own prompt decide the shape:
 *
 *   "steps: the actual sequence, first thing first"   — order always means something
 *   "use dependsOn ... where order genuinely matters" — edges are sparse
 *
 * So the sequence is the spine and the dependencies are branches off it. That
 * is what keeps this from ever coming out as a heap: with no edges at all it is
 * still a clean ordered flow, which is no worse than the numbered list it
 * replaces and already shows the effort the list never did.
 *
 * Everything here is a pure function over ids. No DOM, no physics, no layout
 * library, and nothing that needs a browser to test — which matters in a repo
 * where the sky's physics is the one thing that cannot be checked properly.
 */

/** One step, as the map needs to know it. */
export interface MapNode {
  id: string
  /** where it sits in the sequence, from 0 */
  at: number
  /** the ids this one waits on — only those that are also on the map */
  after: string[]
  /** true when something it waits on is still open */
  blocked: boolean
}

/** A line to draw between two nodes. */
export interface MapEdge {
  from: string
  to: string
  /**
   * `spine` is one step to the next in sequence — the backbone, drawn faint.
   * `branch` is a real dependency that the sequence does not already say, drawn
   * stronger. A `dependsOn` pointing at the immediately preceding step is not a
   * branch: the spine already carries it, and drawing both puts two lines down
   * the same gap.
   */
  kind: 'spine' | 'branch'
}

export interface BriefMap {
  nodes: MapNode[]
  edges: MapEdge[]
  /** how many real dependencies there are, over and above the sequence */
  branches: number
}

/**
 * Lay a brief's steps out.
 *
 * `order` is the sequence, already sorted by whoever knows the order — the page
 * passes `branchesOf`, which is `part_of` order. `deps` maps a step to what it
 * waits on, exactly as `waitingOn` returns it.
 *
 * Defensive about its input on purpose. This draws model output that has been
 * through a database, and every one of these has a way of happening:
 *
 *   - an edge to an id that is not on the map (the step was put away, or the
 *     model referenced a tempId it never emitted)
 *   - a step that depends on itself
 *   - a cycle, which a naive walk would follow for ever
 *   - the same dependency listed twice
 *
 * None of them may hang the page or draw a line to nowhere.
 */
export function briefMap(order: string[], deps: Map<string, string[]>, blocked?: Set<string>): BriefMap {
  // …only the ones actually being drawn. An edge whose other end is not here is
  // not a fact about this picture.
  const here = new Map<string, number>()
  order.forEach((id, i) => {
    // a duplicate id would give one node two positions and two spine lines; the
    // first place it appears is the one that counts
    if (!here.has(id)) here.set(id, i)
  })
  const ids = [...here.keys()]

  const nodes: MapNode[] = ids.map((id) => {
    const at = here.get(id) as number
    const seen = new Set<string>()
    const after: string[] = []
    for (const on of deps.get(id) ?? []) {
      if (on === id) continue // a step cannot wait on itself
      if (!here.has(on)) continue // not on this map
      if (seen.has(on)) continue // said twice
      seen.add(on)
      after.push(on)
    }
    return { id, at, after, blocked: blocked?.has(id) ?? false }
  })

  const edges: MapEdge[] = []
  // the spine: each step to the next, in order
  for (let i = 1; i < ids.length; i++) edges.push({ from: ids[i - 1], to: ids[i], kind: 'spine' })

  /*
   * …and the branches.
   *
   * A dependency is only worth a line of its own when the spine does not
   * already say it. Waiting on the step immediately before you is what the
   * sequence means, so drawing that as a branch lays a second line down the
   * same gap and makes every plan look tangled.
   *
   * A dependency pointing *forward* is a cycle in the making — the model
   * occasionally emits one — and it is drawn like any other branch. Nothing
   * here walks the graph, so a cycle costs a line, not a hang. That is the
   * whole reason this is expressed as pairs rather than as a traversal.
   */
  for (const n of nodes) {
    for (const on of n.after) {
      const from = here.get(on) as number
      if (from === n.at - 1) continue // the spine already carries it
      edges.push({ from: on, to: n.id, kind: 'branch' })
    }
  }

  return { nodes, edges, branches: edges.filter((e) => e.kind === 'branch').length }
}

/**
 * Is this worth drawing as a map at all?
 *
 * One step is not a picture, it is a sentence. Below this the page keeps the
 * list it always had — the point was never to draw something, it was to stop
 * making you read a paragraph to find out what to do.
 */
export function worthDrawing(m: BriefMap): boolean {
  return m.nodes.length >= 2
}
