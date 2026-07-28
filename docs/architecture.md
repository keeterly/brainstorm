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

M1 actions: `classify_thought`, `summarize`, `clarify_question`, `find_related`, `to_goal`,
`make_mind_map`, `generate_roadmap` (streamed), `prioritize`, `distill_memory`.

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
