# Importing from VENIA OS Brainstorm

The old Brainstorm (inside VENIA OS) stores everything in one JSONB blob:
Supabase project “VENIA CC” → table `venia_workspace` → row `id = 'main'` → column `data`.

## Steps

1. In the Supabase dashboard for the old project, open Table Editor → `venia_workspace`,
   copy the `data` cell (the whole JSON), or export it via SQL:
   `select data from venia_workspace where id = 'main';`
2. In Brainstorm: **Settings → Import from VENIA** (or `/import`).
3. Paste the JSON (or upload a saved `.json` file) → **Preview import**.
4. Review the dry-run counts, then run the import.

## What maps where

| VENIA | Brainstorm |
| --- | --- |
| loose dump item | `note` thought (status, due, snooze, created date preserved) |
| item with children | `goal` thought + `action` steps via `part_of` edges (nesting preserved) |
| mind-map branches (`web.branches`) | `concept` themes between goal and steps |
| free map ideas (`web.extra`) | `idea` thoughts, `relates_to` the goal |
| map positions (`web.pos`, master map) | sky layouts (ids remapped) |
| Eni delegate briefs (`work.md`) | research artifacts on the thought |
| Eni memory | memory entries (source `import`) |
| plans, schedules, board, prefs | not modeled — kept verbatim in `import_archives` |

The original VENIA data is never modified. Importing twice duplicates thoughts — the wizard
warns if an archive already exists.
