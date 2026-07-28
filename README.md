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

Database: create a Supabase project, then apply `supabase/migrations/0001_init.sql`
(SQL editor or `supabase db push`).

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm test` | Vitest (domain logic, schemas, importer, `/api/ai` function) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run lint` | ESLint |

## Deploy (Netlify)

1. Create a Netlify site from this repo (`netlify.toml` is preconfigured).
2. Set environment variables: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally `ALLOWED_ORIGINS`.
3. In Supabase Auth settings, add the site URL to allowed redirect URLs.

## Docs

- `docs/architecture.md` — layers, data model, AI engine design
- `docs/import.md` — one-time import from VENIA OS Brainstorm
