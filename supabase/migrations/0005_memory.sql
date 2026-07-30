-- Memory that learns, rather than memory that accumulates.
--
-- What was here was a list of sentences with a created_at. Facts went in and
-- nothing ever came out: seven places in the app called addMemory(), each one
-- deduping against a lowercased set of the exact strings, so "Two-person team
-- in LA" and "We are two people, based in Los Angeles" were two memories, and
-- "Works best in the morning" survived forever after the mornings stopped
-- working. Every prompt then got the first sixty of them in creation order,
-- relevant or not, which is the other half of the problem: a memory that is
-- always present is worth about as much as one that is never present.
--
-- This is mem0's shape, built here rather than rented. Four things it needs
-- that a flat list cannot give:
--
--   kind      — what sort of thing this is. A standing preference is worth
--               more to almost any request than a one-off fact, and knowing
--               which is which is how retrieval ranks without embeddings.
--   strength  — how often it has proved worth having. Reinforcement: a memory
--               that keeps getting recalled and never contradicted rises;
--               everything starts at 1 and nothing decays to zero.
--   last_used_at — the other half of that. Used-recently beats
--               written-recently, because a fact you wrote in March and have
--               leaned on all year is not stale.
--   archived_at / superseded_by — nothing is deleted by the agent. When a
--               memory is corrected, the old one is archived and points at
--               what replaced it, so the trail of how it came to believe
--               something is still readable a year later.
--
-- Ranking happens on the client, over the set it already holds — a few hundred
-- short sentences, which is nothing to score in memory and means recall still
-- works with the plane in flight mode. The text index below is here for when
-- that stops being true.
--
-- No pgvector and no embeddings, deliberately: that means an embedding vendor,
-- a third API key, and every sentence about how this person works leaving the
-- stack. Lexical overlap plus kind plus reinforcement gets most of the way for
-- a corpus this size, and a vector column can sit beside these later without
-- changing a line of what reads them.

-- ---------- what a memory is now ----------

alter table public.memories add column if not exists kind text;
alter table public.memories add column if not exists strength int not null default 1;
alter table public.memories add column if not exists last_used_at timestamptz;
alter table public.memories add column if not exists updated_at timestamptz;
alter table public.memories add column if not exists archived_at timestamptz;
alter table public.memories add column if not exists superseded_by uuid references public.memories (id) on delete set null;
-- what it came out of: the thought, the run, the words you typed
alter table public.memories add column if not exists origin jsonb;

comment on column public.memories.kind is
  'preference | constraint | pattern | fact | person | tool | goal — how retrieval ranks it.';
comment on column public.memories.strength is
  'Reinforcement count. Rises when recalled and confirmed; never falls below 1.';
comment on column public.memories.superseded_by is
  'The memory that corrected this one. The agent archives, it never deletes.';

-- The kinds are advisory, not a check constraint: a model picking a seventh
-- word should not fail the write, it should just rank as an ordinary fact.

do $$
begin
  -- 'learned' joins manual | distilled | import: something the reconciler
  -- decided, rather than something a one-shot extraction dropped in.
  alter table public.memories drop constraint if exists memories_source_check;
  alter table public.memories add constraint memories_source_check
    check (source in ('manual', 'distilled', 'import', 'learned'));
end $$;

-- No view for "the live ones". A view over an RLS table runs with the definer's
-- rights unless told otherwise, and a second way into this table is a second
-- thing to get wrong; the client holds the whole set anyway — it needs the
-- archived rows to show what the agent changed its mind about — and filters
-- where it reads. The index below is what makes that cheap.

-- ---------- the index retrieval actually uses ----------

create index if not exists memories_search_idx
  on public.memories using gin (to_tsvector('english', content));

-- the common read: this user's live memories, strongest first
create index if not exists memories_user_live_idx
  on public.memories (user_id, archived_at, strength desc);

-- ---------- how it came to believe that ----------

-- One row per decision. This is the part that makes the Memory tab honest:
-- "it thinks you work best in the morning" is a claim, and "because you said so
-- on the 3rd, and it has held up eleven times since" is a reason.
create table if not exists public.memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- null once the memory itself is hard-deleted by the user; the trail survives
  memory_id uuid references public.memories (id) on delete set null,
  op text not null check (op in ('add', 'update', 'archive', 'reinforce', 'edit', 'delete')),
  -- what it said before and after, so a correction can be read at a glance
  before text,
  after text,
  -- the model's own sentence for why, in the user's language
  why text,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.memory_events enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memory_events') then
    create policy "own memory events" on public.memory_events
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

create index if not exists memory_events_memory_idx
  on public.memory_events (user_id, memory_id, created_at desc);
