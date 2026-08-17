// Ten skies. Each one teaches exactly one thing and then asks for it back.
//
// They are written as recipes, not as coordinates: what is in the pot, how
// heavy it is, and which skin it is behind. Two facts hold every one of them
// together, and the tests check both rather than trusting this comment:
//
//   • **Everything must add up.** Every drop has to reach the core wearing the
//     core's colour, so the mass-weighted mean of the whole level *is* the
//     target. A level that does not balance cannot be finished, however
//     cleverly it is played.
//
//   • **Par is not a guess.** It is what the solver finds, breadth-first, and
//     it is therefore the real shortest line rather than the author's best.
import type { Level } from './rules'

/** Two parts red to one of yellow — the colour of a low sun. */
const EMBER = [2 / 3, 1 / 3, 0] as const
/** All three in equal measure, which is what a pot ends up as. */
const SLATE = [1 / 3, 1 / 3, 1 / 3] as const

export const LEVELS: readonly Level[] = [
  {
    id: 1,
    name: 'First Light',
    note: 'Red and yellow make orange. Drag one drop into the other, then into the core.',
    cap: 2,
    target: 'orange',
    drops: [{ color: 'red' }, { color: 'yellow' }],
  },
  {
    id: 2,
    name: 'Two At A Time',
    note: 'A drop can only hold so much before its skin gives out. Two, here.',
    cap: 2,
    target: 'green',
    drops: [{ color: 'blue' }, { color: 'yellow' }, { color: 'blue' }, { color: 'yellow' }],
  },
  {
    id: 3,
    name: 'Ember',
    note: 'Size counts as much as colour. Two parts red to one of yellow.',
    cap: 3,
    target: EMBER,
    drops: [
      { color: 'red', mass: 2 },
      { color: 'yellow' },
      { color: 'red', mass: 2 },
      { color: 'yellow' },
    ],
  },
  {
    id: 4,
    name: 'Skin',
    note: 'Some drops are held. A small enough one squeezes out through the skin.',
    cap: 2,
    target: 'green',
    membranes: [{ id: 'a', pore: 1 }],
    drops: [{ color: 'yellow' }, { color: 'blue', where: 'a' }],
  },
  {
    id: 5,
    name: 'The Pore',
    note: 'What you join inside a skin still has to fit back through it.',
    cap: 4,
    target: 'orange',
    membranes: [{ id: 'a', pore: 1 }],
    drops: [
      { color: 'yellow' },
      { color: 'yellow' },
      { color: 'red', where: 'a' },
      { color: 'red', where: 'a' },
    ],
  },
  {
    id: 6,
    name: 'Two Rooms',
    note: 'Nothing crosses a skin. Blend where you stand, then travel.',
    cap: 3,
    target: 'green',
    membranes: [
      { id: 'a', pore: 2 },
      { id: 'b', pore: 2 },
    ],
    drops: [
      { color: 'blue', where: 'a' },
      { color: 'yellow', where: 'a' },
      { color: 'blue', where: 'b' },
      { color: 'yellow', where: 'b' },
    ],
  },
  {
    id: 7,
    name: 'Branch',
    note: 'A skin inside a skin. Out of the inner one only ever means into the outer.',
    cap: 4,
    target: 'violet',
    membranes: [
      { id: 'a', pore: 3 },
      { id: 'b', parent: 'a', pore: 2 },
    ],
    drops: [
      { color: 'red', where: 'a' },
      { color: 'blue', where: 'a' },
      { color: 'red', where: 'b' },
      { color: 'blue', where: 'b' },
    ],
  },
  {
    id: 8,
    name: 'Slate',
    note: 'All three, in equal measure. Nothing else is this colour.',
    cap: 3,
    target: SLATE,
    drops: [
      { color: 'red' },
      { color: 'yellow' },
      { color: 'blue' },
      { color: 'red' },
      { color: 'yellow' },
      { color: 'blue' },
    ],
  },
  {
    id: 9,
    name: 'Held Apart',
    note: 'The reds one side, the blues the other, and two loose in the sky.',
    cap: 4,
    target: 'violet',
    membranes: [
      { id: 'a', pore: 2 },
      { id: 'b', pore: 2 },
    ],
    drops: [
      { color: 'red' },
      { color: 'blue' },
      { color: 'red', where: 'a' },
      { color: 'red', where: 'a' },
      { color: 'blue', where: 'b' },
      { color: 'blue', where: 'b' },
    ],
  },
  {
    id: 10,
    name: 'One Colour',
    note: 'Everything you have learned, in one sky. Take your time.',
    cap: 3,
    target: SLATE,
    membranes: [
      { id: 'a', pore: 1 },
      { id: 'b', parent: 'a', pore: 2 },
    ],
    drops: [
      { color: 'red' },
      { color: 'yellow' },
      { color: 'blue' },
      { color: 'red', where: 'a' },
      { color: 'yellow', where: 'b' },
      { color: 'blue', where: 'b' },
    ],
  },
]

export const levelById = (id: number) => LEVELS.find((l) => l.id === id) ?? LEVELS[0]
