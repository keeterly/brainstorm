// The rules, entire. Three moves, five refusals, and a state you can put back.
//
// Everything the game knows how to do is here, as pure functions over a plain
// value. The board on screen is a picture of this; it never decides anything.
// Which means the solver plays exactly the game the player plays, undo is one
// value going back, and a level can be proved winnable before anyone ships it.
//
// Two numbers do all the work, and they pull against each other:
//
//   **the cap** — no drop may hold more than this, so you cannot simply pour
//   the whole sky into one ball and hand it over;
//
//   **the takes** — the core opens only so many times, so you cannot hand it
//   over a drop at a time either.
//
// Between them sits the only question the game ever asks: these two drops of
// the same colour — one big one, or two small ones going to two different
// places? Neither number is interesting alone. Together they are the game.
import { blend, HUE, same, type Hue, type HueName } from './color'

export interface Drop {
  id: string
  color: Hue
  mass: number
  /** the membrane it is inside, or null for open sky */
  where: string | null
}

/**
 * A skin around some drops. Nothing gets in; a drop gets out when it is small
 * enough to squeeze through — which is what makes a membrane a puzzle rather
 * than a wall. Membranes nest, and a drop leaving one lands in the one outside
 * it, so a deep level is a set of small problems in a fixed order.
 */
export interface Membrane {
  id: string
  parent: string | null
  /** the largest a drop may be and still pass out */
  pore: number
}

export interface Level {
  id: number
  name: string
  /** the one line shown as the level opens */
  note: string
  /** the most any one drop can hold before its skin gives out */
  cap: number
  /** how many times the core will open */
  takes: number
  /** the colour of the core, and so the colour every drop must arrive as */
  target: HueName | Hue
  membranes?: readonly { id: string; parent?: string; pore: number }[]
  drops: readonly { color: HueName | Hue; mass?: number; where?: string }[]
}

export interface State {
  drops: readonly Drop[]
  membranes: readonly Membrane[]
  /** what the core has taken in so far */
  core: number
  /** how many times it will still open */
  takes: number
  moves: number
}

export type Move =
  | { kind: 'merge'; from: string; into: string }
  | { kind: 'pass'; id: string }
  | { kind: 'join'; id: string }

export const hue = (c: HueName | Hue): Hue => (typeof c === 'string' ? HUE[c] : c)

export function initial(level: Level): State {
  return {
    drops: level.drops.map((d, i) => ({
      id: `d${i}`,
      color: hue(d.color),
      mass: d.mass ?? 1,
      where: d.where ?? null,
    })),
    membranes: (level.membranes ?? []).map((m) => ({
      id: m.id,
      parent: m.parent ?? null,
      pore: m.pore,
    })),
    core: 0,
    takes: level.takes,
    moves: 0,
  }
}

export const dropOf = (s: State, id: string) => s.drops.find((d) => d.id === id) ?? null

/** Everything a level starts with, which is what the core must end up holding. */
export const totalMass = (level: Level) => level.drops.reduce((n, d) => n + (d.mass ?? 1), 0)

/**
 * Why a move cannot be made, in the words the drop itself would use — or null
 * when it can. The view says these out loud; nothing is ever silently ignored.
 */
export function refuse(s: State, level: Level, m: Move): string | null {
  if (m.kind === 'merge') {
    const a = dropOf(s, m.from)
    const b = dropOf(s, m.into)
    if (!a || !b || a.id === b.id) return 'nothing to join'
    if (a.where !== b.where) return 'not through the skin'
    if (a.mass + b.mass > level.cap + 1e-9) return `too much for one drop — ${level.cap} is the most`
    return null
  }
  if (m.kind === 'pass') {
    const d = dropOf(s, m.id)
    if (!d) return 'nothing there'
    if (d.where === null) return 'already in open sky'
    const skin = s.membranes.find((x) => x.id === d.where)
    if (!skin) return 'nothing there'
    if (d.mass > skin.pore + 1e-9) return `too big to pass — ${skin.pore} gets through`
    return null
  }
  const d = dropOf(s, m.id)
  if (!d) return 'nothing there'
  if (d.where !== null) return 'still behind a skin'
  if (!same(d.color, hue(level.target))) return 'not the core’s colour'
  if (s.takes <= 0) return 'the core will not open again'
  return null
}

export const legal = (s: State, level: Level, m: Move) => refuse(s, level, m) === null

/**
 * The move, done. A new state — the old one is untouched and is what undo
 * hands back.
 *
 * A merge keeps the id of the drop that was standing still, so on screen the
 * one you dragged is the one that disappears into the other. Every id that
 * survives keeps its place in the world, and nothing has to be re-laid-out.
 */
export function apply(s: State, level: Level, m: Move): State {
  if (refuse(s, level, m)) return s
  if (m.kind === 'merge') {
    const a = dropOf(s, m.from)!
    const b = dropOf(s, m.into)!
    const merged: Drop = {
      id: b.id,
      color: blend(a.color, b.color),
      mass: a.mass + b.mass,
      where: b.where,
    }
    return {
      ...s,
      drops: s.drops.filter((d) => d.id !== a.id).map((d) => (d.id === b.id ? merged : d)),
      moves: s.moves + 1,
    }
  }
  if (m.kind === 'pass') {
    const d = dropOf(s, m.id)!
    const skin = s.membranes.find((x) => x.id === d.where)!
    const drops = s.drops.map((x) => (x.id === d.id ? { ...x, where: skin.parent } : x))
    return { ...s, drops, membranes: shed(drops, s.membranes), moves: s.moves + 1 }
  }
  const d = dropOf(s, m.id)!
  return {
    ...s,
    drops: s.drops.filter((x) => x.id !== d.id),
    core: s.core + d.mass,
    takes: s.takes - 1,
    moves: s.moves + 1,
  }
}

/** A skin with nothing left inside it has nothing left to do. */
function shed(drops: readonly Drop[], membranes: readonly Membrane[]): Membrane[] {
  const holds = (id: string): boolean =>
    drops.some((d) => d.where === id) || membranes.some((m) => m.parent === id && holds(m.id))
  return membranes.filter((m) => holds(m.id))
}

export const won = (s: State) => s.drops.length === 0

/** Every move that could be made right now, for the solver and for the hint. */
export function moves(s: State, level: Level): Move[] {
  const out: Move[] = []
  for (const d of s.drops) {
    const join: Move = { kind: 'join', id: d.id }
    if (legal(s, level, join)) out.push(join)
    const pass: Move = { kind: 'pass', id: d.id }
    if (legal(s, level, pass)) out.push(pass)
  }
  for (let i = 0; i < s.drops.length; i++) {
    for (let j = i + 1; j < s.drops.length; j++) {
      const m: Move = { kind: 'merge', from: s.drops[i].id, into: s.drops[j].id }
      if (legal(s, level, m)) out.push(m)
    }
  }
  return out
}
