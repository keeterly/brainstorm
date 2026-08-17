# Blend

A sky full of coloured drops, and one core in the middle of it. Join every drop to the core until
the sky is one colour.

The home page **is** the game — no menu to get through, no splash to sit behind. It opens in the sky
it left you in.

<p>
  <img src="docs/first-light.png" width="240" alt="The first level: a red drop and a yellow one, an orange core between them" />
  <img src="docs/the-pore.png" width="240" alt="Two red drops held behind a membrane whose pore passes only one" />
  <img src="docs/branch.png" width="240" alt="A membrane nested inside another membrane" />
</p>

## How it plays

Drag one drop into another and they blend, the way a child mixes paint: **red + yellow = orange**,
**yellow + blue = green**, **red + blue = violet**, all three = ink. And **red + red = red** — the
same colour, twice the drop. Drag a drop into the core when it is the core's colour, and it goes
home.

Two numbers decide everything, and they pull in opposite directions:

| | |
| --- | --- |
| **The cap** — no drop may hold more than N | So you cannot pour the whole sky into one ball and hand it over. |
| **The arrivals** — the core opens only K times | So you cannot hand it over one drop at a time either. |

Between them sits the only question the game ever asks: *these two reds — one big one, or one each
into two different blends?* Put them together and you have committed both to a single destination.
Keep them apart and each can carry a different partner home. Which is right depends on how much the
cap will let you carry and how many times the core will open, and getting it wrong is how a sky is
lost.

A third rule builds the walls:

| | |
| --- | --- |
| **Some drops are held** | A membrane lets nothing in, and lets a drop out only if it is small enough for the pore. Membranes nest, so a deep sky is several small problems in a fixed order. |

Colours only ever grow — nothing here takes a primary back out — so an orange that meets a blue is
ink for good. That is the whole risk in the game, and it is legible at a glance.

Nothing is ever lost: undo goes back a move, and when a sky has no way home left it says so rather
than letting you play on into a wall. The hint is a real one — it is the next move on a genuinely
shortest line, found by the same solver that proves the levels are winnable in the first place.

<p>
  <img src="docs/one-colour.png" width="240" alt="The last level: a membrane inside a membrane, three loose drops, a slate core" />
  <img src="docs/skies.png" width="240" alt="The ten skies" />
</p>

## Where it came from

The drops, the glass they are made of, the waists they draw between each other as they come into
reach, and the rings the world sends out when you touch it are all carried over from
[Brainstorm](https://github.com/keeterly/brainstorm)'s sky — the same geometry files, the same
imperfection (nothing here is a true circle), the same materials. The membranes are that app's
**group and branch** mechanism turned into barriers: a group is a skin, a branch is a skin inside a
skin, and the pore is what a group will let out of itself.

## The shape of the code

Everything the game *is* lives in four small files that never mention a pixel:

| File | What |
| --- | --- |
| `src/game/color.ts` | A colour is the *set* of primaries in it, so blending is set union: commutative, associative, idempotent, and nameable. Seven colours, no decimals. |
| `src/game/rules.ts` | Three moves, five refusals, one immutable state. Undo is the previous value. |
| `src/game/levels.ts` | Ten skies, written as recipes. |
| `src/game/solve.ts` | Plays the real game breadth-first. Proves levels winnable, computes par, powers the hint and the "no way home" warning. |

Everything else — `src/play/` — is the picture. It can never change the game; a gesture it
understands ends in one of those three moves being offered upward, and it draws whatever comes back.

## Running it

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # rules, colour, levels, layout — 80 tests
npm run build      # typecheck + production build to dist/
```

Two more, which need a build being served (`npm run build && npm run preview`):

```bash
npm run shots      # photograph the game at phone size, into shots/
node tools/play.mjs  # play it with a real thumb in a real browser, and fail loudly
node tools/icons.mjs # redraw the app icons out of the game's own materials
```

### Tests worth knowing about

- **Every level adds up, is winnable, and its par is real.** Between them the drops must carry every
  primary the core is made of and none it is not; the solver has to find a line; that line is
  replayed through the rules; and par is what it found. No hand-written par can drift.
- **The arrivals are exact.** `total ≤ cap × arrivals`, or the sky cannot be emptied — and
  `total > cap × (arrivals − 1)`, or it could have been done in fewer, which would make the number a
  suggestion rather than a rule.
- **Every level can be lost inside two moves.** A sky with no wrong answer is not a puzzle, so the
  suite plays each one and checks there is a way to ruin it. (Level 1 is exempt: it is the tutorial
  and has exactly one line through it.)
- **Layout is finite on four sizes of glass.** A NaN radius does not throw; it silently piles every
  drop in the top-left corner and draws no skins at all. That bug happened, once.

## Installing it

It ships a web manifest and the icons, so on a phone "Add to Home Screen" gives it its own icon, no
browser chrome, and the whole screen. It is a static site — `dist/` on any host will do.
