# Brainstorm — AI Thinking OS

Brainstorm turns scattered thoughts into connected ideas, visual maps, realistic plans, and the
next meaningful action. It is built for people whose ideas do not begin as organized tasks.

The core loop: **Capture → Understand → Connect → Visualize → Prioritize → Act.**

## Stack

- **React 18 + TypeScript + Vite** SPA, installable PWA (offline shell + local snapshot)
- **Supabase** — auth (magic link), Postgres thought graph with RLS, storage
- **Netlify** — static hosting + serverless functions
- **AI Action Engine** — named, versioned, Zod-validated actions served by `/api/ai`
  (`netlify/functions/ai.ts`); Anthropic behind a provider interface, key never leaves the server

## Local development

```bash
npm install
cp .env.example .env       # fill in Supabase URL + anon key
npm run dev                # UI only — AI actions need `netlify dev`
```

For the AI endpoint locally, use the Netlify CLI so functions run too:

```bash
npm i -g netlify-cli
netlify dev                # serves Vite + /api/ai with your .env
```

Database: create a Supabase project, then apply **every** file in
`supabase/migrations/` in order (`supabase db push`, or paste them into the SQL editor one
after another). There are nine, and `0001_init.sql` alone is not enough. The last three are
the ones that stop a guest list being decorative: `0007` creates the function behind the
global spend cap, `0008` makes the run ledger append-only and adds the invite table, and
`0009` is what makes an invite mean anything — without it, anybody signed in can mint
themselves a code and redeem it on the same screen.

`0009` seeds `app_owners` with the oldest account in `auth.users`, which is you if you
applied it after signing in and nobody if you applied it before. Nobody can mint until
there is a row, and there is no way to add one through the API on purpose — put yourself
there from the SQL editor:

```sql
insert into public.app_owners (id)
select id from auth.users where email = 'you@example.com';
```

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm test` | Vitest — domain logic, schemas, importer, `/api/ai`, and the source pins in `src/styles/css.test.ts` |
| `npm run test:watch` | the same, watching |
| `npm run test:e2e` | builds a demo bundle and drives it in real Chromium (Playwright). No API key or network needed. |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run lint` | ESLint over `src shared netlify e2e` |

Two traps worth knowing before you touch anything: **`tsc --noEmit` compiles nothing here**
(the root tsconfig is `"files": []` plus project references) — the real check is
`npx tsc -b --force`. And **there is no prettier config**, so running `npx prettier --write`
reformats whole files and breaks a few hundred source-pin assertions.

## Deploy (Netlify)

1. Create a Netlify site from this repo (`netlify.toml` is preconfigured).
2. Set environment variables. **Required:** `ANTHROPIC_API_KEY` (mark it secret),
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. **Set the spend controls before the URL leaves your hands.** All of them are optional and
   all of them default to wide open: with none set, anybody who signs up may spend your API
   budget, and there is no ceiling over the day. See `.env.example` for what each does —
   `AI_ALLOWED_EMAILS`, `AI_OWNER_EMAILS`, `AI_GUEST_USD_CAP`, `AI_TOTAL_USD_CAP`, and
   `AI_INVITES` if you want to hand out codes instead of editing config per tester.
   None of these bound the month; only a spend limit in the Anthropic Console does, and it
   is the one ceiling that does not depend on this app's own code being right.
4. Optional, for push notifications — all four, or none: `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and the client-side `VITE_VAPID_PUBLIC_KEY`, which
   must match the public one. Push is simply unavailable if they are unset.
5. Optional: `ALLOWED_ORIGINS`, needed for `localhost` during development.
6. In Supabase Auth settings, add the site URL to allowed redirect URLs, and turn on leaked
   password protection while you are there.

## Docs

- `docs/WORKING-DOC.md` — **start here.** The whole app in one document: what it is, how it
  works, what is tested, and an explicit assessment of what is missing before it can ship.
- `docs/architecture.md` — layers, data model, AI engine design
- `docs/positioning.md` — where this sits against the market (July 2026)
- `docs/import.md` — one-time import from VENIA OS Brainstorm
- `docs/vision-v2.md` — the original design brief. Historical; kept for provenance.
