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
- Transport: one retry on 429/5xx. Long actions (`generate_roadmap`) stream over SSE so
  Netlify's buffered-function window is never the ceiling.
- Every run inserts an `agent_runs` row (running → succeeded/failed/invalid_output) with
  token counts and cost from `shared/ai/pricing.ts`. A daily per-user cap guards spend.
- The provider is isolated behind `LLMProvider` (`netlify/functions/_lib/provider.ts`);
  swapping vendors means one new class.

Actions: `classify_thought`, `summarize`, `clarify_question`, `find_related`, `to_goal`,
`make_mind_map`, `generate_roadmap` (streamed), `prioritize`, `absorb`, `organize`,
`name_pool`, `cluster`, `gauge`, `deepen`, `answer`, `draft`, `reshape`, `notice`,
`remember`.

## Memory

mem0's shape, built on our own Postgres rather than rented — no embedding vendor, no third
API key, nothing about how the user thinks leaving the stack.

**Extract → reconcile.** One door: `learn()` in `src/ai/memoryFlow.ts`. Everything that
might teach the app something — a capture, a pasted bio, the `learned` list off a `deepen`,
`answer`, `draft` or `notice` run — goes through it. It recalls what is already believed
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

## Visual Brain

No graph library. Absolutely-positioned HTML nodes over one SVG edge layer inside a single
pan/zoom transform (`src/features/brain/BrainPage.tsx`) — the interaction model proven in the
original VENIA implementation, rebuilt in React. Viewport and drags live in refs and mutate
styles directly; React re-renders only on gesture end. Edges are real `relationships` rows
styled by type. Unpositioned nodes get a radial default layout (`layout.ts`); dragged
positions persist (debounced) to `layouts` per scope. An outline view renders the same graph
as an indented list.

## Prioritization

Two layers. A deterministic, unit-tested pre-pass (`src/domain/prioritize-prepass.ts`):
unmet `depends_on`/`blocks` ⇒ waiting, future snooze hidden, overdue ⇒ now, manual buckets
win. Then the `prioritize` action refines buckets and picks ONE recommended action with a
plain-language "why", denormalized into `profiles.settings` so Home/Focus render instantly.
Autonomy is user-controlled: *suggest only* shows a proposal card; *organize automatically*
applies it.

## Failure posture

Brainstorm stays fully usable with `/api/ai` down: manual type picker, manual edges, manual
lanes, capture never blocks on AI. Every AI surface has loading / error+retry / partial-apply
states (e.g. a mind map applies whatever validated and reports what was skipped).
