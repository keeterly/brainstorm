# Brainstorm — Vision v2.0: A Living Cognitive Operating System

Master design brief (July 2026). Supersedes the aesthetic direction in earlier docs;
the data/engine architecture in `architecture.md` remains the foundation.

## Product definition

Brainstorm is a **Thinking OS** — not notes, not tasks, not chat. It transforms messy
thoughts into meaningful action through an adaptive visual environment. The goal is not
organization; it is **clarity**. The interface is a place, not software.

Positioning: Notion = Information OS · Figma = Design OS · Linear = Product OS ·
**Brainstorm = Thinking OS.**

## The water cycle IS the operating system

```
Thought → Droplet → Condensation → Cloud → Saturation → Rain → Current → Evaporation → New Thought

The two edges of the sky are the two verdicts. **Up is finished** — the thing has
done its work, it evaporates, and what it becomes is the weather you think under
(the light in `world/engine.ts` is drawn from recently-finished work, and
`evaporate` fires from exactly this moment). **Down is let go** — it sinks, and
the deep keeps it, recoverable but out of sight.

That second edge is the one that was missing. Saying no is the commonest verdict
anyone has about their own ideas, and until it was a gesture it lived on a button
behind a fold, three taps in — so the graph held everything you finished and
almost nothing you rejected, and a preference is far easier to read off refusals
than off acceptances.
```

Water physics govern every interaction: thoughts rise, ideas condense, themes float,
understanding precipitates, actions flow, learning evaporates, memory remains.
Nothing is filed. Everything cycles.

## Navigation (product language)

| Surface | Replaces | Is |
| --- | --- | --- |
| **Sky** | inbox/capture + projects/board | the world itself: hold anywhere and write, and what you write lands where you were standing. Droplets, clouds, relationships. Collect and Think were two screens onto this one thing; both redirect here. |
| **Current** | tasks/today | only today's meaningful flow |
| **Memory** | archive/settings-adjacent | everything learned (ocean) |

## The three engines (build these, not screens)

1. **Thinking Engine** — captures, classifies, connects, reasons.
   *Exists today:* `shared/ai/` action registry + `/api/ai` — classify, organize, cluster,
   gauge, deepen, answer, draft, rain, reshape, notice, prioritize, remember — over the
   thought graph. (`find_related`, `make_mind_map` and `generate_roadmap` were retired: the
   sky's kinship threading, `cluster` and `rain` do that work on real thoughts.)
2. **World Engine** — generates the adaptive atmosphere from semantic tokens. *New.*
   Never hardcode themes; derive the environment:
   ```
   Project Context → AI Understanding → Mood Extraction → Visual Tokens → World Generator → Adaptive Environment
   ```
   World token shape (replaces "theme"):
   ```json
   { "atmosphere": "reflective", "weather": "mist", "light": "dusk",
     "energy": "calm", "motion": "slow", "material": "glass",
     "palette": "editorial_neutral", "density": 0.25, "depth": 0.8 }
   ```
3. **Interaction Engine** — decides what the user sees, the ONE question to ask,
   and the single most meaningful next action. *Partially exists:* prioritize +
   recommended-next + the sky's third moon, which reads a leaf on its own terms —
   `answer it` for a question, `do it` for something makeable, `work it` for anything
   needing research. Must become the governing layer.

Every future module (Marketing, Product, Fashion…) is another expression of these
three engines — never a bolted-on feature.

## Cognitive climates (thinking state ≠ project world)

Exploration (bright, open) · Deep Work (quiet, heavy) · Momentum (warm, faster) ·
Reflection (sunset, slow) · Decision (still, sharp) · **Uncertainty (fog, low visibility)**.
The environment evolves slowly, like weather — never an instant switch.

## Motion language (every animation has meaning)

Ripple = thought entered · Mist = AI thinking · Condensation = connections forming ·
Rain = actions generated · Evaporation = learning retained · Wind = new information ·
Sunlight = breakthrough.

**North star:** watching a recording with the UI hidden, you can still tell when an idea
was captured, when understanding emerged, when action began, and when work completed —
from the environment alone.

## Interaction principles

- AI asks **one good question**, never ten. ("What feeling should people leave with?")
- Invisible intelligence: rarely chat; quietly observe, suggest, connect, clarify.
- Progressive disclosure; one next step; reduce decisions, never add them.
- Thoughtforms physically evolve: small → growing → connecting → cloud → saturated → raining.

## Visual direction: Editorial (production direction)

Curated, luxurious typography, generous spacing, cinematic motion — Awwwards / COS /
Apple keynote / Gentle Monster / museum exhibition. Glass, soft gradients, painterly
light, very few buttons. Never: dashboard, enterprise, cyberpunk, game HUD, neumorphism.
Prototype references also explored: Liquid Glass, Painterly, Ink & Paper, Dreamscape.

## Prototype state (living reference)

The interactive reference implementation lives as the session artifact
("Brainstorm — Thought Bubbles", cognitive-os-v3): water capture, seeded expansion,
AI condensation with mist, saturation → rain → the current, one-drop focus view,
ocean memory, and a lite world engine (fog = uncertainty, light = clarity) whose
atmosphere drifts with the state of thinking. Port its interaction model into
`src/features/brain/` when productionizing.

## Migration notes for the production app

- Rename surfaces: Capture→Collect, Brain→Think, Focus→Current (+ Memory view over
  `memories` + completed thoughts). Data model unchanged.
- World Engine: new `src/world/` — tokens computed from graph state (and later AI mood
  extraction via a `world_tokens` action), rendered as layered atmosphere (CSS
  custom properties + canvas water), slow-lerped.
- Interaction Engine: elevate the third moon + `prioritize` into a single
  "what should the user see/do next" service; surface exactly one question or one action.
