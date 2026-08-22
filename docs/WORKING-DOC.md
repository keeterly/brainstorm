# Brainstorm — working document

*Written 22 August 2026, against commit `eb7b99f`. Everything in sections 1–8 is
a statement of fact checkable against a file path or a command, and the paths
are given. Section 9 onward is opinion and is marked as such.*

**Purpose of this document.** Brainstorm has one user. The question on the table
is what is missing before it can have more. Sections 1–8 describe what exists so
that somebody with no history here can reason about it; section 9 is my own read
on the gaps, written to be argued with rather than believed.

---

## 1. What it is, who it is for, and the three principles

Brainstorm is a standalone **AI Thinking OS**: a PWA where you dump ideas, the
app organises them into groups, an agent turns a group into a real plan, and
then either you or the agent does the work.

It was built for and by **Keeter Ly**, who runs VENIA, a two-person luxury
fashion label in Los Angeles. It is used today as an installed PWA on an iPhone
15 Pro (393×852). It has never had a second user.

The three principles the whole app is measured against, in the owner's words:

1. **Help you visualize your ideas.**
2. **Help you build an action plan to do them.**
3. **Action on them so you get them done, either manually or with the power
   of AI.**

And the owner's own description of the loop the app exists to serve:

> "I jot down ideas and organize them by thought bubbles. Then when I want to
> work on them I focus on the group and check off what I can."

Four moves — **jot, group, open, tick**. Those principles are not decoration:
each has an end-to-end browser test suite named after it (`e2e/visualize.spec.ts`,
`e2e/plan.spec.ts`, `e2e/do.spec.ts`), and `e2e/journey.spec.ts` walks the loop.

Scale: 179 commits, ~46,400 lines across `src`/`shared`/`netlify`/`e2e`.

---

## 2. The two tabs

The whole app is two tabs in a floating glass pill
(`src/components/TabBar.tsx`), plus three screens off to the side.

### Ideas — "the sky"

`/` → `src/features/sky/SkyPage.tsx`. A dark water world where every thought is
a floating bubble ("drop"), and a group is a bigger bubble ("pool") that holds
others. It is one continuous place, not a list.

The gestures:

| Gesture | What it does |
| --- | --- |
| **Hold open water** | Opens the writing sheet. The one gesture the app teaches out loud, because it is the only one you could not guess. |
| **Tap a group** | Goes *inside* it — everything else recedes and the members lay out on a ring. |
| **Tap it again** | Opens the group's page: the list of what is inside, or "the plan" if it has one. |
| **Tap open water** | Comes back out, one level at a time. |
| **Drag one drop onto another** | Makes a group. |
| **Hold a bubble, slide, release** | The action moons (rename, colour, share, put away). |
| **Drag a drop upward past the line** | Finished. Downward, past the waterline: let go. |

Permanent chrome in the sky: **⌕ find** (top-left), **◴ memory** beside it,
**☁ resting thoughts** and **✦ tidy** (top-right), a **"what to do next" bar**
at the foot of the glass, and a **✎ pen**.

### Roadmap — "what you are doing"

`/roadmap` → `src/features/roadmap/RoadmapPage.tsx`. Added in August 2026. The
same graph read against a **week**: this week by day, then "after that", then
"not yet" for what did not fit. Each step carries the reason it exists, how big
it is, what it waits on, and which idea it came from.

It is a **view**, not a second model of the work — that distinction is load
bearing and section 4 explains why.

### The three side screens

`/memory` (what the app has learned about you, plus full-text search), and
behind a ⚙ from there: `/settings`, `/runs` (every AI call, with cost), and
`/import` (one-time import from the legacy VENIA app). None of them are in the
tab bar; memory is reached by the ◴ icon in the sky's corner.

Dead routes that redirect to `/`: `/collect`, `/think`, `/brain`, `/focus`,
`/thought/:id` (which rewrites to open that thought in the sky).

---

## 3. Architecture

Three layers, kept strictly apart:

```
UI        src/features, src/components   React views; no AI orchestration, no SQL
Domain    src/domain, src/store          pure logic + the in-memory graph
Engine    shared/ai, netlify/functions   AI actions, provider isolation, run logging
```

**The sky is imperative, and this is the single most important structural fact
about the codebase.** `src/features/sky/SkyPage.tsx` is ~8,600 lines. The React
component is a ~165-line static DOM skeleton; everything else runs inside one
`mountSky()` closure driven by `requestAnimationFrame`, addressing elements by
`data-sky="…"` attributes. There is a physics simulation in there: springs,
separation, a breath, a camera.

What that buys: a genuinely fluid 60fps world that feels like a place.

What it costs, honestly:

- **Nothing in it can be imported or unit tested.** For a long time the only
  handle on it was `src/styles/css.test.ts`, which reads the file *as a string*
  and asserts on its source text — 200+ assertions pinning decisions along with
  the reason for them, so a silent revert fails loudly. That is a real technique
  and it works, but it cannot see whether a control is painted underneath
  something else.
- That gap is why the Playwright suite (`e2e/`) was built in August 2026. It
  found three defects on its first run.
- Any change inside that file is a change to a system with no seams.

Per-area size, for orientation:

| Area | Lines | Files |
| --- | --- | --- |
| `src/features/sky` | 18,225 | 47 |
| `src/domain` | 4,201 | 35 |
| `netlify/functions` | 3,352 | 19 |
| `shared/ai` | 3,007 | 22 |
| `e2e` | 2,020 | 7 |
| `src/features/roadmap` | 1,502 | 9 |
| `src/features/memory` | 1,278 | 5 |
| `src/ai` | 1,047 | 9 |

**Sync** is server-authoritative with optimistic UI. On login the full graph
hydrates a zustand store (`src/store/graph.ts`) and snapshots to IndexedDB.
Mutations apply in memory immediately and write through `src/lib/outbox.ts`;
failures queue and replay on reconnect, last-write-wins by `updated_at`. No
CRDT, no realtime channels — a deliberate choice for one user on a few devices.

---

## 4. The data model

`src/domain/types.ts`, mirroring `supabase/migrations/0001_init.sql`.

**Everything captured is a `thought`** — one table, with a `type` column:
`note, idea, task, action, question, problem, goal, decision, reference,
constraint, inspiration, concept`. Status is `open | done | snoozed | archived`.
The fields that matter downstream: `effort` (1–5), `due_date`, `snooze_until`,
`completed_at`, `summary`, `image_path`, and `extra jsonb`.

**One `relationships` edge table** with a `type`: `relates_to, depends_on,
contradicts, supports, inspired_by, blocks, part_of, evolved_into, duplicates,
answers`. In practice three carry the weight:

- **`part_of`** — nesting. `from_id` is the child, `to_id` the parent. This is
  the only hierarchy; "group", "goal" and "pool" are all just a thought with
  `part_of` children.
- **`depends_on` / `blocks`** — order. Treated everywhere as two spellings of
  one fact (`src/domain/plan.ts`).

There is **no separate model of a plan, a group or a roadmap.** A drop and a
pool are a rendering distinction computed from whether a thought has children.
This is deliberate and hard-won: an earlier version had a `roadmaps` table
holding phases, a second parallel record of the work that nothing could tick and
that drifted from reality within a week. It was deleted. The table still exists
and is still read so old rows export, but **nothing writes it**
(`src/store/graph.ts:44-51`). Same for the `bucket` column.

### The `extra` jsonb convention

Small facts live on `extra` rather than in new columns. The flags in use:

| Key | Written by | Means |
| --- | --- | --- |
| `canDraft` | `rain` | the model's own judgement that it could write a first version of this step |
| `drafted_at`, `draft_done` | `draft` | it has been written |
| `answers`, `answered_at`, `answer_settled` | you / `answer` | what you told it, and what it concluded |
| `looked_at` | `look` | a reference wall has been read |
| `rained_at`, `missing` | `rain` | a group has been planned, and what it lacked |
| `kept` | you | ready to plan |
| `img`, `full` | capture | a photograph's thumbnail and full data URL |
| `rank` | drag-reorder | fractional ordering (`src/domain/rank.ts`) |
| `pursuing_since` | you | this group is on the roadmap |
| `day` | you | this step was moved to a specific day |
| `wasType`, `like`, `rose_from`, `rose_at` | various | provenance |

### Migrations and RLS

Seven, in `supabase/migrations/`:

| # | What it does |
| --- | --- |
| 0001 | The whole schema — `profiles`, `projects`, `thoughts`, `relationships`, `layouts`, `roadmaps`, `research_artifacts`, `memories`, `agent_runs`, `import_archives`. RLS on every table, plus four storage policies. |
| 0002 | `agent_runs.applied_at` — so a background run that finished while nobody watched folds into the graph exactly once. |
| 0003 | `push_subscriptions` (one row per device). |
| 0004 | `agent_runs.timings jsonb` — deliberately loose. |
| 0005 | Reshapes `memories` into mem0's shape (`kind`, `strength`, `last_used_at`, `superseded_by`), adds the `memory_events` audit table. |
| 0006 | Advisor cleanup: rewrites all 12 policies to `(select auth.uid())` so it evaluates once per query rather than once per row, plus five missing FK indexes. |
| 0007 | `public.ai_spend_today()` — a `security definer` function returning today's total spend across all users, so a global cap can exist without a service-role key. |

**RLS scopes every row to `auth.uid()`, and there is no service-role key
anywhere in the codebase.** Netlify functions write *as the user*, by forwarding
their JWT to PostgREST. This is a genuine strength and worth preserving.

---

## 5. The AI engine

`POST /api/ai` runs **named, versioned actions** — never free-form prompts.
Registry at `shared/ai/registry.ts`.

Each action is one file in `shared/ai/actions/`: a Zod input schema, a Zod
output schema, a prompt builder, and a model tier. The same schemas type the
client via `z.infer` and validate at runtime on the server.

**Structured output is a forced tool call** (`tool_choice: {type:'tool',
name:'emit'}` with the Zod schema converted to JSON Schema) — never
markdown-fence parsing. When an action is allowed to search, `tool_choice` goes
to `auto` and a second turn forces the emit, because a forced emit fires
immediately and never gets a chance to search.

Models (`shared/ai/pricing.ts`): **fast = `claude-haiku-4-5`, smart =
`claude-sonnet-5`.**

### The fifteen actions

| Action | v | Tier | Max tokens | Searches | Background | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| `classify_thought` | 1 | fast | 800 | — | — | type, title, summary, suggested due date for one capture |
| `absorb` | 1 | smart | 2000 | — | — | how pasted text *changes* what already exists |
| `organize` | 1 | smart | 8000 | — | — | a brain dump (or photo, or transcript) into drops and pools |
| `name_pool` | 1 | fast | 200 | — | — | 2–4 words for a new group |
| `cluster` | 1 | smart | 3000 | — | — | tidy a whole sky: join loose thoughts to pools |
| `deepen` | 1 | smart | 8000 | 4 | **yes** | research a goal and write the way through |
| `answer` | 3 | smart | 6000 | 3 | **yes** | answer a question with the actual figure, not the errand |
| `gauge` | 2 | fast | 400 | 0 | — | **pre-flight**: how deep does this ask need to go |
| `reshape` | 1 | smart | 4000 | — | — | the only action that can *subtract* |
| `draft` | 1 | smart | **9000** | 2 | **yes** | **the only action that produces a finished artifact** |
| `remember` | 1 | fast | 1200 | 0 | — | the memory reconciler (add/update/archive/noop) |
| `rain` | 1 | smart | 2000 | 0 | — | a group → real steps, each with a reason, an effort, dependencies, and `canDraft` |
| `evaporate` | 1 | fast | 700 | 0 | — | at most one follow-up when something is finished |
| `look` | 1 | smart | 1400 | 0 | — | read *across* a wall of reference images |
| `find_like` | 2 | smart | 3000 | 3 | **yes** | more pictures like this one |

`gauge` is worth understanding: it runs first, cheaply, and decides how many
searches the real action gets (`known: 0, light: 2, deep: 5`) and roughly how
long to promise. It exists because ⚡ used to spend the same minute on
everything.

### How a result reaches the graph

Every AI feature is a `*Flow.ts` file in `src/features/sky/`, and the shape is
invariant:

```
xThought(id, opts)          gathers context from the store, calls runAction, then →
applyX(id, output, runId)   pure-of-network: mutates the graph, calls markApplied
```

The split exists so a **background run can be landed later, by a page that never
started it**. `draft`, `deepen`, `answer` and `find_like` are `background: true`:
they POST to `/.netlify/functions/ai-background`, the client generates the run id
up front, and the row in `agent_runs` is inserted *before* the work starts so
there is always something to watch.

When you come back, `collectOwed()` (`SkyPage.tsx:6305`) finds unclaimed runs
from the last 15 minutes and lands them. `markApplied` holds two locks — an
IndexedDB list and a durable `applied_at` column — so a result cannot land twice
across devices. `notifyUser` does a compare-and-swap on `notified_at` so two
devices cannot both announce it. Push deep-links to `/?brief=<id>`.

This is the part of the app I would trust most.

### The spend gate

`netlify/functions/_lib/runs.ts:151` — `allowRun()` is the whole decision, with
four distinct refusals: **403** not on the guest list, **503** the meter cannot
be read (**fails closed**), **429** over the dollar cap, **429** over the run
cap. A run is charged its *estimate* at birth and corrected at death, so an
in-flight or never-returning run still counts.

Hard-coded: `DAILY_USD_CAP = 6`, `DAILY_RUN_CAP = 400`.

---

## 6. The roadmap, in detail

Three pure domain modules do the thinking, all unit tested:

**`src/domain/plan.ts`** — `waitingOn` (who is blocked by whom), `hasPlan` (is
this a plan or just a pile), `planOrder` (a stable, cycle-safe topological
sort), `orderTree`, `effortDots`.

**`src/domain/schedule.ts`** — the new part.

- `weeklyCapacity(thoughts, today)` reads how much you get through in a week off
  `completed_at`, which every tick writes. The **median of the weeks you
  actually worked** over a trailing six, the current week excluded because half
  a week is not evidence about a whole one. Below two worked weeks it returns a
  default of 8 and says it is guessing. An unsized step counts as 2.
- `placeWork(...)` puts steps on days under three rules, in the order they win:
  1. **Nothing before the thing it waits on.**
  2. **A deadline that has not passed beats capacity** — an overfull day you can
     see is a decision; a deadline quietly pushed past is the app losing your
     work. A deadline that has *already* passed gets no such claim and flows
     normally, or a month of slippage lands on one morning.
  3. **Otherwise plan order, until the day is full** — a day holds a fifth of
     the week. Weekends are left empty. Nothing that does not fit is dropped; it
     comes back as "not yet".

**`src/features/roadmap/gather.ts`** — what is on the roadmap at all. Root goals
only, leaves only (a sub-group is a heading, not an afternoon), and only things
the app itself calls work: `type === 'action' || 'task'`, the same rule
`prioritizePrepass` uses and the same one every drop's page states out loud
("something to do · it can come up as your next step" / "a note · it will not
come up as a next step"). Filtered to what you marked as pursuing, falling back
to everything-with-a-plan until you have marked anything.

**The batch** (`src/features/roadmap/doAllFlow.ts`). `canAgentDo`
(`src/domain/doable.ts`) is the model's own `canDraft`, plus being a leaf, plus
being under something. The card says *"I can write 2 of the 7 on your roadmap
now — the other 5 need you."* On approval it runs `draft` **serially, capped at
six**: `draft` is the most expensive action against a $6 daily cap, and
`pendingRuns` only reads eight unclaimed runs. A refusal stops the batch and
names itself; two failures in a row also stop it, because one real refusal
("everyone's AI budget for today is used up") is a word too long for the app's
phrasebook and arrives as a generic line.

**The agent never ticks your list.** It offers; you decide.

---

## 7. Deployment and configuration

**Build**: `npm run build` = `tsc -b && vite build` → `dist/`. Netlify builds
from Git; there is no deploy workflow in CI, on purpose.

**CI** (`.github/workflows/ci.yml`), on push to `main` and all PRs: `npm ci` →
`lint` → `test` → `build` → `playwright install chromium` → `test:e2e`.
**Green on all three of the most recent commits, Playwright included.**

**Scripts**: `dev`, `build`, `preview`, `test`, `test:watch`, `lint`,
`test:e2e` (`VITE_DEMO=1 vite build --outDir e2e/.build && vitest run --config
vitest.e2e.config.ts`).

**Netlify** (`netlify.toml`): SPA fallback, `X-Frame-Options: SAMEORIGIN`,
`nosniff`, `strict-origin-when-cross-origin`, and `no-store` on `/index.html`
and `/sw.js`. Functions bundle with esbuild and self-route via
`export const config = { path }` — except `ai-background`, which deliberately
keeps its default `/.netlify/functions/` URL because a custom path risks
silently demoting it to a normal function with a 10-second timeout.

**Service worker**: `vite-plugin-pwa` with `injectManifest` and
**`injectRegister: null`** — registration is hand-rolled in `src/lib/sw.ts`
because the injected bare `register()` pinned running apps to their
first-loaded version.

### Every environment variable

**Client** (baked into the bundle at build time):

| Var | Required | What |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | **yes** | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | **yes** | publishable anon key; RLS is the boundary |
| `VITE_VAPID_PUBLIC_KEY` | no | push subscription key; empty ⇒ push simply unavailable |
| `VITE_DEMO` | no | `'1'` = seeded local-only world, no persistence. Test only. |

**Server** (Netlify functions):

| Var | Required | What |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | **yes** | the model key. Server-only, never in the bundle. |
| `SUPABASE_URL` | **yes** | for JWT verification and PostgREST |
| `SUPABASE_ANON_KEY` | **yes** | `apikey` header; functions act as the user |
| `ALLOWED_ORIGINS` | no | origin allowlist for `/api/*`; needed for localhost |
| `VAPID_PUBLIC_KEY` | no | must match the client one |
| `VAPID_PRIVATE_KEY` | no | signs push messages; secret |
| `VAPID_SUBJECT` | no | defaults to `mailto:hello@veniacollection.com` |
| `AI_ALLOWED_EMAILS` | **see below** | guest list. **Unset ⇒ anybody who signs up may spend your API budget.** |
| `AI_OWNER_EMAILS` | no | who gets the full daily cap |
| `AI_GUEST_USD_CAP` | no | smaller per-day cap for everybody else |
| `AI_TOTAL_USD_CAP` | no | the ceiling over everybody; needs migration 0007 |

`URL` and `DEPLOY_PRIME_URL` are Netlify-injected and auto-added to the origin
allowlist.

---

## 8. What is tested

**1,177 unit tests across 73 files** (`npm test`, jsdom). The domain is tested
properly because it is pure: `plan`, `schedule`, `doable`, `next-action`,
`prioritize-prepass`, `rank`, `capture`, `parse-nl-date`, `human-date`,
`question`, `find`, `kinship`, every AI action's schemas, every Netlify
function's gate.

**`src/styles/css.test.ts`** is a special case: 200+ assertions that read
`SkyPage.tsx` and the CSS **as source text**, pinning decisions together with
the reasoning. It is how an untestable 8,600-line closure is defended.

**60 end-to-end tests across five Playwright suites**, driving the real app in a
real Chromium at 393×852, against a demo build with **no API key and no
network** (AI answers come from canned fixtures in `src/lib/demo.ts`, validated
against their real schemas by `src/lib/demo-output.test.ts`):

| Suite | Tests | For |
| --- | --- | --- |
| `journey.spec.ts` | 11 | jot → group → open → tick. Should never be allowed to fail. |
| `roadmap.spec.ts` | 23 | the second tab, pursuing, moving, the batch, and that the two tabs agree |
| `visualize.spec.ts` | 10 | principle 1 — legibility, reachability, nothing off the glass |
| `plan.spec.ts` | 10 | principle 2 — ⚡ produces a real plan that survives into the DOM |
| `do.spec.ts` | 6 | principle 3 — the agent writes something and hands it back |

`e2e/harness.ts` is worth reading before touching any of it: every helper
documents a trap that cost real time (waiting for the sky to settle *and* the
camera to stop; pages that animate for half a second after `.on` lands; tapping
by coordinates so occlusion is caught).

### Two standing traps

- **`tsc --noEmit` compiles nothing in this repo** (`"files": []` plus project
  references). The real check is **`npx tsc -b --force`**.
- **There is no prettier config.** Running `npx prettier --write` reformats whole
  files and breaks ~250 source-pin assertions. Do not run it.

---
---

# — Everything above is fact. Everything below is my opinion. —

*Sections 9–12 are Claude's assessment, written to be argued with. If you are a
second reader: please challenge these rather than assuming they are complete or
correctly ranked. The three items marked **verified** were checked against the
live database or by running the code, not inferred from reading it.*

---

## 9. What I think is missing, ranked

### Tier 1 — I would not send the URL to a stranger without these

**9.1 The AI spend cap is not a cap. — verified against the live database.**

`agent_runs` has exactly one RLS policy, `own runs`, and it is `for all` —
SELECT, INSERT, **UPDATE** and **DELETE**. The anon key ships in the client
bundle by design, so any signed-in user can call PostgREST directly and
`DELETE /rest/v1/agent_runs?user_id=eq.<self>`. The spend meter
(`_lib/runs.ts:103`) then reads zero and the daily cap resets.

Worse: `cost_usd numeric(10,6)` has **no CHECK constraint** — I confirmed the
only check on that table is on `status`. A single row inserted with
`cost_usd: -999999` makes `public.ai_spend_today()` return a negative number,
and that function backs `AI_TOTAL_USD_CAP` — the ceiling **over every user on
the deployment**. One user can switch off everybody's budget.

The code around this is careful — the meter deliberately fails closed when it
cannot be read. That does not help when the meter is writable by the party being
metered.

*What I would do:* one migration. Split the policy into `for select` and
`for insert` only; add `check (cost_usd >= 0)`; have the function finish runs
through a `security definer` RPC rather than a client-visible UPDATE. This is
small and it is the difference between a cap and a suggestion.

**9.2 Every safety default is off, and the exposure is real money.**

`_lib/who.ts:44` — an unset `AI_ALLOWED_EMAILS` means **anyone who signs up may
spend**. Unset `AI_OWNER_EMAILS` means everybody gets the full cap. Unset
`AI_TOTAL_USD_CAP` means no global ceiling at all. With `DAILY_USD_CAP = 6`,
fifty users is $300/day — and that is the ceiling, not the estimate.

There is also no billing of any kind: no plan, no Stripe, nothing connecting a
user to a cost. That is a business-model gap, not a bug, but it is the same
number.

*What I would do:* set `AI_TOTAL_USD_CAP` and `AI_GUEST_USD_CAP` today, before
the URL goes anywhere. They already work; they are simply off.

**9.3 There is no way to add a user except editing an env var and redeploying.**

`AI_ALLOWED_EMAILS` is a comma-separated string in Netlify config. Adding user
#51 means editing it and rebuilding the site. And the failure is invisible from
the inside: a new person signs up successfully, sees the entire app, taps ⚡, and
is told *"This account is not on the list for AI actions"* with no path forward.
Nothing on first run warns them.

**9.4 No account deletion, and the export silently loses data. — verified by
reading the code path.**

There is no delete-account control anywhere; `SettingsPage` has exactly one
destructive action, Sign out. The database side is ready (everything cascades
from `auth.users`), so this is a missing button and a small function.

The export is worse than missing, because it looks complete.
`src/domain/export-markdown.ts` builds `childIds` from every `part_of` edge and
excludes all of them from the loose-thoughts list — but only walks parents where
`type === 'goal'`. **Any child of a non-goal parent is in neither list and does
not appear in the file at all.** You reach that state in one gesture: open a
plain note, type into "add something to this", and `addTo` creates a task under
a note that nothing ever promotes. The export also truncates every entry to
80–120 characters and drops everything archived — which is the "put away" bin
the UI tells you is recoverable.

*What I would do:* add a raw JSON export beside the markdown one. The markdown
is a nice artifact; it is not a backup, and right now it is the only thing
offered under a heading that says everything.

**9.5 No privacy policy, no terms, no support contact.** Zero hits across `src`,
`public` and `index.html`. The app sends the user's private thinking to Anthropic
and stores it in Supabase, and there is no page that says so.

### Tier 2 — Survivable for an invited iPhone beta, embarrassing beyond it

**9.6 The main surface is unreachable by keyboard.** Drops are built with
`innerHTML` and have no `role`, no `tabindex`, no accessible name. There is
exactly one `tabIndex` in the entire app, and **no Escape handler anywhere** —
`.sky-page` is `role="dialog"` with no `aria-modal`, no focus trap, and only a
small × to close it. Pinch-zoom is blocked document-wide, including on the
text-heavy Settings and Memory pages, which is a WCAG 1.4.4 failure. To be fair,
`prefers-reduced-motion` is handled thoroughly and `aria-label` coverage on
controls is good; the gap is specifically *reaching* things.

**9.7 There is no desktop or tablet layout at all.** Not one width media query
exists in the codebase — every `@media` is `prefers-reduced-motion` or
`prefers-color-scheme`. On a 1440px browser the physics spreads across the whole
viewport and "hold for 420ms" becomes a mouse press-and-hold nobody will guess.
This is a phone app that happens to be reachable from a desktop browser, and
right now it does not say so.

**9.8 First run is several seconds of a wordmark, then a gesture nobody is
taught.** Signed out, the opening holds for 2.4s before the sign-in form is
visible. A brand-new account with no thoughts waits ~3.8s on every launch. Then
the hold-to-write gesture — the only way into the app — is taught by a toast
that fires *after* your first capture, stored in a one-shot localStorage key. A
playtester once spent ten minutes looking for it; the comment recording that is
still in the source. There is also no install prompt, though the whole design
assumes standalone mode and push *requires* it on iOS.

**9.9 Two devices never converge while online. — verified.** `retryHydrate` is
gated on `s.offline`, and there is no Realtime subscription anywhere. Once a
session is hydrated it never reads from the server again for the life of that
session — and on an installed iOS PWA that gets resumed rather than relaunched,
that is days. Most writes are field-level patches so they merge, but
`saveLayout` upserts the whole positions map, so two devices will clobber each
other's arrangement wholesale.

**9.10 Smaller ones worth knowing:** the importer is one person's one-time VENIA
migration, shipped in every user's Settings; deleting a memory is a hard row
delete with no confirm and no undo, in an app whose entire vocabulary is undo;
the outbox is not namespaced per user, so on a shared device one account's
queued writes are attempted under another's session; and `.limit(5000)` on
thoughts silently truncates and then writes the truncated graph over the local
snapshot.

### Tier 3 — Real, not urgent

`src/ai/useAction.ts` is dead code. The VAPID subject falls back to a
`veniacollection.com` address, so someone else's deployment mails your inbox.
External links open in the standalone PWA with no way back. No CSP, no HSTS.
`/api/preview` has no cost gate at all, unlike `/api/ai`. Stopword lists are
English-only with no signal when clustering degrades. The physics loop is O(n²)
over top-level drops — fine at 50, not at 500.

---

## 10. Deliberate, so please do not file these as bugs

- **No CRDT and no realtime.** A stated choice for one user on a few devices.
  It becomes wrong the moment 9.9 matters, but it was not an oversight.
- **The `roadmaps` table is read and never written.** It is the corpse of a
  feature that was deleted for good reason — it was a second parallel model of
  the work that nothing could tick. Old rows still export.
- **`SkyPage.tsx` is 8,600 lines.** Splitting it is not obviously an
  improvement; the physics, the camera and the paint are genuinely one system.
  The mitigation chosen was source-text pins plus a browser suite, not a
  refactor.
- **`public.ai_spend_today()` is `SECURITY DEFINER` and callable by
  authenticated users** — Supabase's advisor flags this. It is how a global
  spend cap works without introducing a service-role key, which is the bigger
  win. Worth writing down as a decision rather than leaving as an open warning.
- **The sky's framing does not hold every bubble flush inside the glass** —
  usually nothing is over, sometimes ~20px of a 64px drop for a second. The test
  asserts what matters (nothing more than half gone) and prints the real number
  every run.
- **Importing twice duplicates thoughts.** The wizard warns; there is no
  idempotency.

---

## 11. Only Keeter can do these

1. **Rotate `ANTHROPIC_API_KEY`** in the Anthropic Console and re-add it in
   Netlify **marked secret**.
2. **Set a monthly spend limit in the Anthropic Console.** This is the only
   ceiling that does not depend on the app's own code being correct — see 9.1.
3. **Enable leaked-password protection** in Supabase Auth (currently a live
   WARN advisory).
4. **Decide `AI_ALLOWED_EMAILS`**, and set `AI_TOTAL_USD_CAP` and
   `AI_GUEST_USD_CAP` before the URL goes anywhere.

---

## 12. Questions I would genuinely like a second opinion on

1. **Is the roadmap's "only `action`/`task` gets scheduled" rule right?** It
   makes the roadmap agree with what every drop's page already says, but it
   means anything captured as a plain thought needs one tap before it will
   schedule. Correct, or friction?
2. **Should the sky get a desktop layout, or should the app say "phone only"
   and mean it?** Building a real desktop layout for an 8,600-line physics
   simulation is a large piece of work. Detecting width and showing an honest
   "open this on your phone" screen is a day.
3. **Is per-user billing the right answer to 9.2, or is a small invited beta
   with a hard global cap the right shape for another six months?** The app has
   no business model wired in at all, and adding one is a different project from
   finishing this one.
4. **What is the minimum honest backup?** I would add a raw JSON export. Is that
   enough, or does shipping to other people mean real server-side backups and a
   restore path?
5. **How much does the 8,600-line file actually cost you?** Every gauntlet round
   so far has found real defects in it, and each fix has been surgical rather
   than structural. Is that sustainable, or is the next big feature the one that
   forces a refactor?
