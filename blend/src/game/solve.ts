// A machine that plays the game properly, used for three honest purposes:
// proving a level can be finished before it ships, working out its par, and
// telling a stuck player the one move that still leads somewhere.
//
// It plays through `rules.ts` and nothing else — the same moves, the same
// refusals — so a level it cannot finish is a level nobody can finish.
import { apply, initial, moves, won, type Level, type Move, type State } from './rules'

/**
 * Two states are the same state when they hold the same drops in the same
 * places, whatever those drops are called. Names are an accident of which
 * order things were poured in; the position is what a player can see.
 */
export function key(s: State): string {
  return (
    s.drops
      .map((d) => `${d.where ?? '~'}:${d.color}@${d.mass.toFixed(3)}`)
      .sort()
      .join('|') +
    // …and how many times the core will still open, which two otherwise
    // identical skies can disagree about
    `#${s.takes}`
  )
}

export interface Found {
  /** the shortest line to one colour */
  line: Move[]
  /** how many states it had to look at, so a runaway level is visible */
  seen: number
}

/**
 * The shortest way to finish from here, or null when there is none.
 *
 * Breadth-first, so the first finish found is the shortest one — which is what
 * makes it usable as par. The cap is a guard rail rather than a limit anyone
 * should be hitting: levels in this game are small on purpose, and one that
 * blows through it is a level that has stopped being a puzzle.
 */
export function solve(from: State, level: Level, cap = 120_000): Found | null {
  if (won(from)) return { line: [], seen: 0 }
  const seen = new Set<string>([key(from)])
  let edge: { s: State; line: Move[] }[] = [{ s: from, line: [] }]
  let count = 1
  while (edge.length && count < cap) {
    const next: { s: State; line: Move[] }[] = []
    for (const node of edge) {
      for (const m of moves(node.s, level)) {
        const s = apply(node.s, level, m)
        const k = key(s)
        if (seen.has(k)) continue
        seen.add(k)
        count++
        const line = [...node.line, m]
        if (won(s)) return { line, seen: count }
        if (count < cap) next.push({ s, line })
      }
    }
    edge = next
  }
  return null
}

export const solvable = (s: State, level: Level) => solve(s, level) !== null

/** The fewest moves a level can be finished in. Cached — levels never change. */
const pars = new Map<number, number>()
export function par(level: Level): number {
  const had = pars.get(level.id)
  if (had !== undefined) return had
  const found = solve(initial(level), level)
  const n = found ? found.line.length : 0
  pars.set(level.id, n)
  return n
}

/** The next move on some shortest line home, or null when there is none left. */
export function hint(s: State, level: Level): Move | null {
  const found = solve(s, level)
  return found && found.line.length ? found.line[0] : null
}
