-- Brainstorm — initial schema. One thoughts table holds every graph node type;
-- relationships is the single edge table. RLS everywhere: rows belong to their
-- creator, no cross-user access, no service-role dependency.

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  intent text,
  status text not null default 'active' check (status in ('active','paused','done','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
create policy "own projects" on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- thoughts ----------
create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  raw_content text not null,
  title text,
  summary text,
  type text not null default 'note' check (type in
    ('note','idea','task','action','question','problem','goal',
     'decision','reference','constraint','inspiration','concept')),
  status text not null default 'open' check (status in ('open','done','snoozed','archived')),
  bucket text check (bucket in ('now','next','later','waiting')),
  source text not null default 'text' check (source in ('text','voice','import','ai')),
  confidence real,
  urgency smallint,
  importance smallint,
  effort smallint,
  due_date date,
  snooze_until date,
  project_id uuid references public.projects (id) on delete set null,
  image_path text,
  extra jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index thoughts_user_status_idx on public.thoughts (user_id, status);
create index thoughts_user_type_idx on public.thoughts (user_id, type);
create index thoughts_user_bucket_idx on public.thoughts (user_id, bucket) where bucket is not null;
create index thoughts_user_project_idx on public.thoughts (user_id, project_id) where project_id is not null;

alter table public.thoughts enable row level security;
create policy "own thoughts" on public.thoughts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- relationships (typed edges between thoughts) ----------
create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_id uuid not null references public.thoughts (id) on delete cascade,
  to_id uuid not null references public.thoughts (id) on delete cascade,
  type text not null check (type in
    ('relates_to','depends_on','contradicts','supports','inspired_by',
     'blocks','part_of','evolved_into','duplicates','answers')),
  created_by text not null default 'user' check (created_by in ('user','ai')),
  agent_run_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, from_id, to_id, type),
  check (from_id <> to_id)
);

create index relationships_user_from_idx on public.relationships (user_id, from_id);
create index relationships_user_to_idx on public.relationships (user_id, to_id);

alter table public.relationships enable row level security;
create policy "own relationships" on public.relationships
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- layouts (Visual Brain node positions per scope) ----------
create table public.layouts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope text not null,
  positions jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);

alter table public.layouts enable row level security;
create policy "own layouts" on public.layouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- roadmaps ----------
create table public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_thought_id uuid not null references public.thoughts (id) on delete cascade,
  title text not null,
  phases jsonb not null,
  status text not null default 'active' check (status in ('active','archived')),
  agent_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index roadmaps_user_goal_idx on public.roadmaps (user_id, goal_thought_id);

alter table public.roadmaps enable row level security;
create policy "own roadmaps" on public.roadmaps
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- research_artifacts ----------
create table public.research_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  thought_id uuid not null references public.thoughts (id) on delete cascade,
  title text not null,
  content_md text not null,
  sources jsonb not null default '[]',
  agent_run_id uuid,
  created_at timestamptz not null default now()
);

create index research_user_thought_idx on public.research_artifacts (user_id, thought_id);

alter table public.research_artifacts enable row level security;
create policy "own research" on public.research_artifacts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- memories (transparent, editable AI memory) ----------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text not null,
  source text not null default 'manual' check (source in ('manual','distilled','import')),
  created_at timestamptz not null default now()
);

alter table public.memories enable row level security;
create policy "own memories" on public.memories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- agent_runs (AI work history: status, tokens, cost) ----------
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action text not null,
  action_version int not null default 1,
  status text not null default 'running' check (status in ('running','succeeded','failed','invalid_output')),
  model text,
  input jsonb,
  output jsonb,
  error text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,6),
  latency_ms int,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index agent_runs_user_created_idx on public.agent_runs (user_id, created_at desc);

alter table public.agent_runs enable row level security;
create policy "own runs" on public.agent_runs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- import_archives (raw legacy blobs, nothing lost) ----------
create table public.import_archives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blob jsonb not null,
  imported_at timestamptz not null default now()
);

alter table public.import_archives enable row level security;
create policy "own archives" on public.import_archives
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- storage: per-user attachments ----------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "own attachments read" on storage.objects
  for select using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own attachments write" on storage.objects
  for insert with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own attachments update" on storage.objects
  for update using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own attachments delete" on storage.objects
  for delete using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
