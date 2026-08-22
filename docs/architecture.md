# Architecture

Brainstorm is a standalone AI Thinking OS. Three layers, kept strictly apart:

```
UI (src/features, src/components)      React views; no AI orchestration, no SQL
Domain + store (src/domain, src/store) pure logic + the in-memory graph
Engine (shared/ai, netlify/functions)  AI actions, provider isolation, run logging
```

## Data model — a thought graph, not folders

Everything captured is a **thought** (one table, `type` column: note, idea, task, action,
question, problem, goal, decision, reference, constraint, inspiration, concept). Typed
**relationships** connect thoughts (`relates_to`, `depends_on`, `contradicts`, `part_of`, …).
Goals are thoughts; their steps are `action` thoughts joined by `part_of` edges; roadmaps
reference real action thoughts so plan views always show live status. `layouts` stores Visual
Brain node positions per scope. `agent_runs` records every AI call (status, tokens, cost,
latency) and powers the user-visible run history. RLS scopes every row to `auth.uid()`;
there is **no service-role key anywhere** — the AI function writes as the user by forwarding
their JWT.

## Sync — deliberately simple

Server-authoritative + optimistic UI. On login the full graph hydrates a zustand store and
snapshots to IndexedDB. Mutations apply in memory immediately and write through
`src/lib/outbox.ts`; failures queue and replay on reconnect (last-write-wins by `updated_at`).
Offline: the app opens from the snapshot, capture keeps working, AI is visibly paused.
No CRDT, no realtime channels — one user on a few devices does not need them yet.

## AI Action Engine

`POST /api/ai` runs **named, versioned actions** — never free-form prompts:

- Each action (`shared/ai/actions/*.ts`) = Zod input schema + Zod output schema + prompt
  builder + model tier. The same schemas type the client (`z.infer`) and validate at runtime
  on the server.
- Structured output is a **forced tool call** (`tool_choice: emit` with the Zod schema as
  JSON Schema) — no markdown-fence parsing, ever.
- Prompts reference thoughts as `[id] title — summary`; outputs return **ids** (or `tempId`s
  for proposed nodes). The model never round-trips free text that must be re-matched.
- Validation failure → one repair retry (the model sees its own output + the Zod errors) →
  otherwise the run is marked `invalid_output` and the UI offers retry.
- Transport: one retry on 429/5xx. Actions that cannot finish inside a request (`deepen`,
  `answer`, `draft`) are marked `background: true` and run in a background function; the page
  names the run and watches the `agent_runs` row for it.
- Every upstream call is bounded by an `AbortSignal` well inside the background function's
  wall, so a stalled connection surfaces as a failed run rather than a spinner with no exit.
- The transport retry keeps the images. Dropping them turned a rate limit into a confident
  answer about a picture the model could not see, which validates and is written as correct.
- The schema-repair retry is skipped after `max_tokens`: re-asking with a *longer* prompt
  against the same ceiling fails the same way for twice the tokens.
- Every run inserts an `agent_runs` row (running → succeeded/failed/invalid_output) with
  token counts, search count, and cost from `shared/ai/pricing.ts` — which prices searching,
  the part of the bill that dominates a deep run and was not being counted at all. A daily
  per-user cap (`DAILY_RUN_CAP`, one definition) guards spend. A run that never comes back is
  marked failed by the page watching it, rather than sitting at `running` for ever.
- The provider is isolated behind `LLMProvider` (`netlify/functions/_lib/provider.ts`);
  swapping vendors means one new class.

Actions, fifteen (`shared/ai/registry.ts` is the list of record): `classify_thought`,
`absorb`, `organize`, `name_pool`, `cluster`, `gauge`, `deepen`, `answer`, `draft`, `rain`,
`evaporate`, `reshape`, `remember`, `look`, `find_like`.

Six were retired together: `summarize`, `clarify_question`, `find_related`, `to_goal`,
`make_mind_map` and `generate_roadmap`. Two more went later with the Current screen —
`notice` and `prioritize`; see Prioritization below. Two were added: `look`, which reads
*across* a wall of reference images, and `find_like`, which fetches more pictures like one
you already have. Four served one screen — a thought detail page
reachable from a single link, behind a fold, in a list of finished work — and the sky had
already replaced each of them: `to_goal` happens by dragging things together, `find_related`
is the kinship threading, `clarify_question` is the ask moon, and `generate_roadmap` is
`rain` plus `deepen`, which produce real thoughts instead of a second parallel model of what
work is. The other two had no caller at all. The `roadmaps` table is still read (existing
rows still export); nothing writes new ones.

**Closing the loop.** Ticking the last thing under a goal used to leave the goal open with
nothing in it — an orphan drop in the sky, and no moment anywhere in the app where you had
completed something. It is now offered, never taken: `emptiedGroup` notices, you say yes. And
`evaporate` runs once on the back of that, reading what the finishing made possible against
what is still open, returning **at most one** droplet as a real thought — usually none, which
is the discipline of the whole action. Something that hands you a fresh task every time you
tick one off is a treadmill, not a cycle.

**The funnel.** A thought becomes an idea; ideas gather into a cloud; `rain` condenses the
cloud into real actions *under* it; and each of those leaves is then read by the sky's third
moon on its own terms — `answer it` for a question, `do it` for something makeable (`draft`),
`work it` for anything needing research (`deepen`). Everything an action produces lands as
thoughts in the graph, never as prose the rest of the app cannot reach.

## Memory

mem0's shape, built on our own Postgres rather than rented — no embedding vendor, no third
API key, nothing about how the user thinks leaving the stack.

**Extract → reconcile.** One door: `learn()` in `src/ai/memoryFlow.ts`. Everything that
might teach the app something — a capture, a pasted bio, the `learned` list off a `deepen`,
`answer`, `draft` or `rain` run — goes through it. It recalls what is already believed
nearby and hands both to the `remember` action, which returns one op per decision:
`add` · `update` (same belief, better stated — in place, keeping the id, the strength and
the trail) · `archive` (directly contradicted; archived, never deleted) · `noop` (already
known, and by far the commonest). Before this, seven call sites each pushed facts and deduped
on exact lowercased strings, so memory could only grow.

**Retrieve by relevance.** `src/domain/recall.ts`, pure and unit-tested. Every prompt used to
carry the first sixty memories in creation order. Now `buildCtx` ranks on four signals — word
overlap with the ask, *standing* (a constraint or a preference holds regardless of what is
being asked; a fact about one supplier does not), reinforcement, and when it was last
actually leaned on — and sends at most twelve. Ranking runs on the client over the set it
already holds, so recall works offline.

**Reinforce.** Whatever gets carried gets a point and a `last_used_at`. Local state moves
every time; the write is throttled to once an hour per memory.

**Show the trail.** `memory_events` records every decision with before/after and the model's
own reason. The Memory tab groups live memories by kind, shows how load-bearing each one is,
and has a *What it changed its mind about* section — because something that can quietly
revise what it knows about you, with no way to see that it did, is not something you would
let near what it knows about you.

## The sky

No graph library, and no canvas. Absolutely-positioned HTML drops over one SVG edge layer
inside a single pan/zoom transform (`src/features/sky/SkyPage.tsx`) — an imperative render
engine mounted by a thin React shell, which returns its own cleanup. Position and drags live
in refs and mutate styles directly; React re-renders nothing during a gesture. Edges are real
`relationships` rows styled by type. Unpositioned drops get a radial default; dragged
positions persist (debounced) to `layouts` per scope, and now survive an offline launch.

There is no separate detail screen. `/thought/:id` redirects to `/?open=<id>`, which focuses
the drop and opens its page in the world — the same page every other route into a thought
opens.

## Prioritization

**No model is involved, and there is no second opinion.** There used to be: a `prioritize`
action refined buckets, picked one recommended action, and denormalized it into
`profiles.settings` so a Home and a Focus screen could render it instantly. All three of
those things are gone — the screens with the Current, the action with them, and the
denormalized field with the `bucket` column it fed.

What is left is deterministic, unit-tested and offline:

- `src/domain/prioritize-prepass.ts` — unmet `depends_on`/`blocks` ⇒ waiting, future snooze
  hidden, sort by due date then age.
- `src/domain/plan.ts` — `waitingOn`, `hasPlan`, `planOrder` (a stable, cycle-safe
  topological sort), `orderTree`.
- `src/domain/next-action.ts` — a six-rule ladder (overdue, due today, holding up the most
  other work, due soonest, smallest, oldest) where the rule that fired *is* the reason
  shown.

## The roadmap

The second tab, added August 2026 (`src/features/roadmap/`). It is a **view** of the same
graph read against a week, and it writes no new kind of record — the mistake
`generate_roadmap` made and the reason it was deleted.

- `src/domain/schedule.ts` — `weeklyCapacity` learns how much a week holds from
  `completed_at`, which every tick already writes: the median of the weeks you actually
  worked, current week excluded, defaulting to 8 and saying so until it has seen two.
  `placeWork` lays steps on days under three rules in priority order — nothing before what
  it waits on; a deadline that has not passed beats capacity; otherwise plan order until the
  day is full.
- `src/features/roadmap/gather.ts` — what is on it: root goals you have marked
  (`extra.pursuing_since`), leaves only, and only `action`/`task`, which is the same rule
  every drop's own page states out loud.
- `src/features/roadmap/doAllFlow.ts` — the batch. `canDraft`, the model's own judgement
  written by `rain`, decides what the agent will offer to do; approved runs go serially
  through `draft`, capped at six.

The sky's "what to do next" bar quotes the roadmap rather than holding its own opinion, and
falls back to `next-action.ts` only when there is no plan yet. One answer, shown twice.

## Failure posture

Brainstorm stays fully usable with `/api/ai` down: hold the sky and write, drag things
together, tick things off — capture never blocks on AI. Every AI surface has loading /
error+retry / partial-apply states, and says what it did rather than reporting success.

Writes are durable. Mutations land in the store immediately and go out through an offline
queue (`src/lib/outbox.ts`) that retries by default, gives up only on errors that provably
cannot succeed, and parks anything hopeless where the banner can offer to try again. `offline`
clears on its own — on `online`, on coming back to the app, and on a slow tick — because iOS
gives none of the three reliably.
