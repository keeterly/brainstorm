// Ten skies. Each one teaches exactly one thing and then asks for it back.
//
// They are written as recipes — what is in the pot, how heavy it is, which
// skin it is behind — and three facts hold every one of them together. The
// tests check all three rather than trusting this comment:
//
//   • **Everything must add up.** Every drop reaches the core wearing the
//     core's colour, so between them the drops have to carry every primary the
//     core is made of, and nothing it is not.
//
//   • **The takes are exact.** `total ≤ cap × takes` or the sky cannot be
//     emptied; `total > cap × (takes − 1)` or it could have been done in fewer,
//     which would make the number a suggestion. So the sky always arrives in
//     exactly that many drops — and which drops those are is the puzzle.
//
//   • **Par is not a guess.** It is what the solver finds, breadth-first.
import type { Level } from './rules'

export const LEVELS: readonly Level[] = [
  {
    id: 1,
    name: 'First Light',
    note: 'Red and yellow make orange. Drag one drop into the other, then into the core.',
    cap: 2,
    takes: 1,
    target: 'orange',
    drops: [{ color: 'red' }, { color: 'yellow' }],
  },
  {
    id: 2,
    name: 'Two At A Time',
    note: 'No drop may hold more than two — so the core will have to open twice.',
    cap: 2,
    takes: 2,
    target: 'green',
    drops: [{ color: 'blue' }, { color: 'yellow' }, { color: 'blue' }, { color: 'yellow' }],
  },
  {
    id: 3,
    name: 'Same And Same',
    note: 'Two reds make a bigger red. Six drops, two arrivals: some of them must double up.',
    cap: 3,
    takes: 2,
    target: 'orange',
    drops: [
      { color: 'red' },
      { color: 'red' },
      { color: 'red' },
      { color: 'yellow' },
      { color: 'yellow' },
      { color: 'yellow' },
    ],
  },
  {
    id: 4,
    name: 'Skin',
    note: 'Some drops are held. Nothing gets in — but what is inside can blend and leave.',
    cap: 2,
    takes: 2,
    target: 'green',
    membranes: [{ id: 'a', pore: 2 }],
    drops: [
      { color: 'yellow' },
      { color: 'blue' },
      { color: 'yellow', where: 'a' },
      { color: 'blue', where: 'a' },
    ],
  },
  {
    id: 5,
    name: 'The Pore',
    note: 'This skin passes one at a time. Join the reds in there and they never come out.',
    cap: 2,
    takes: 2,
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
    note: 'Reds one side, blues the other. Two reds joined in there can only ever go one place.',
    cap: 3,
    takes: 2,
    target: 'violet',
    membranes: [
      { id: 'a', pore: 2 },
      { id: 'b', pore: 2 },
    ],
    drops: [
      { color: 'red', where: 'a' },
      { color: 'red', where: 'a' },
      { color: 'blue', where: 'b' },
      { color: 'blue', where: 'b' },
    ],
  },
  {
    id: 7,
    name: 'Branch',
    note: 'A skin inside a skin. Out of the inner one only ever means into the outer.',
    cap: 3,
    takes: 2,
    target: 'violet',
    membranes: [
      { id: 'a', pore: 2 },
      { id: 'b', parent: 'a', pore: 2 },
    ],
    drops: [
      { color: 'blue' },
      { color: 'red', where: 'a' },
      { color: 'red', where: 'b' },
      { color: 'blue', where: 'b' },
    ],
  },
  {
    id: 8,
    name: 'Ink',
    note: 'All three at once. Every arrival needs a red, a yellow and a blue in it.',
    cap: 3,
    takes: 2,
    target: 'ink',
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
    name: 'Weight',
    note: 'Colour is half of it. Read the sizes: the big red does not go with the big blue.',
    cap: 3,
    takes: 2,
    target: 'violet',
    drops: [
      { color: 'red', mass: 2 },
      { color: 'blue' },
      { color: 'red' },
      { color: 'blue', mass: 2 },
    ],
  },
  {
    id: 10,
    name: 'One Colour',
    note: 'Everything you have learned, in one sky. Take your time.',
    cap: 4,
    takes: 2,
    target: 'ink',
    membranes: [
      { id: 'a', pore: 2 },
      { id: 'b', parent: 'a', pore: 2 },
    ],
    drops: [
      { color: 'red' },
      { color: 'yellow' },
      { color: 'blue' },
      { color: 'yellow' },
      { color: 'red', where: 'a' },
      { color: 'blue', where: 'a' },
      { color: 'yellow', where: 'b' },
      { color: 'blue', where: 'b' },
    ],
  },
]

export const levelById = (id: number) => LEVELS.find((l) => l.id === id) ?? LEVELS[0]
