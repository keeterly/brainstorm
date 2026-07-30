-- A background run has to survive the app being closed.
--
-- ⚡ runs for the best part of a minute in a background function, which has no
-- way to answer the client — the client names the run and watches the row. If
-- the phone locks, the tab is backgrounded long enough to be discarded, or the
-- page is refreshed, that watcher is gone. The work still finishes and still
-- writes its result here, and nothing ever picks it up: the user waited a
-- minute, came back, and the sky was exactly as they left it.
--
-- Resuming needs one thing the table could not express: whether a finished run
-- has already been folded into the graph. Without it, reopening the app would
-- apply the same research a second time and hand you every step twice — and
-- doing that bookkeeping in local storage would get it wrong the moment you
-- opened the app on a second device.

alter table public.agent_runs
  add column if not exists applied_at timestamptz;

comment on column public.agent_runs.applied_at is
  'When this run''s output was folded into the graph. Null on a finished run means it is still owed to the user, whichever device comes back for it first.';

-- Finding what is owed on load: the rows still running, and the rows that
-- finished while nobody was listening. Partial, because the settled-and-applied
-- rows are the overwhelming majority and are never the ones we are looking for.
create index if not exists agent_runs_unapplied_idx
  on public.agent_runs (user_id, created_at desc)
  where applied_at is null;
