-- Three things the Supabase advisors have been reporting since the first
-- audit, none of which changes what any row means or who can see it.

-- ---------- 1. auth.uid() once per query, not once per row ----------
--
-- Every policy is `user_id = auth.uid()`, and Postgres re-evaluates that call
-- for every row it tests. Wrapped in a scalar sub-select it becomes an
-- InitPlan: evaluated once and reused. Identical semantics — the same function,
-- the same value, the same rows — and the whole of the difference is how many
-- times it is called.
--
-- It matters here more than the advisory implies. Opening the app pulls up to
-- 5,000 thoughts and 20,000 relationships in one hydrate, and every one of
-- those rows is currently paying for its own call.
--
-- `alter policy` rather than drop-and-create: there is no instant in the middle
-- where the table has no policy on it.
alter policy "own thoughts"            on public.thoughts           using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own relationships"       on public.relationships      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own layouts"             on public.layouts            using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own memories"            on public.memories           using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own memory events"       on public.memory_events      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own runs"                on public.agent_runs         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own research"            on public.research_artifacts using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own roadmaps"            on public.roadmaps           using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own projects"            on public.projects           using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own archives"            on public.import_archives    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own push subscriptions"  on public.push_subscriptions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- profiles keys on its own id rather than a user_id column
alter policy "own profile"             on public.profiles           using (id = (select auth.uid()))      with check (id = (select auth.uid()));

-- ---------- 2. a trigger function that is not an endpoint ----------
--
-- `handle_new_user` runs `security definer` because it has to: it writes a
-- profile row for a user who does not have one yet. But `execute` on functions
-- in an exposed schema is granted to `anon` and `authenticated` by default, so
-- it is also reachable at `/rest/v1/rpc/handle_new_user` by anybody at all.
--
-- Nothing calls it that way. It is attached to `on_auth_user_created`, an
-- after-insert trigger on `auth.users`, and a trigger executes as the table's
-- owner rather than as whoever is connected — so revoking this cannot affect
-- sign-up. Verified by grep before writing: no `.rpc(` call anywhere in the
-- app names it, or names anything.
--
-- FROM PUBLIC, not from `anon, authenticated`. `execute` is granted to PUBLIC
-- by default and those two roles inherit it from there rather than holding a
-- grant of their own, so naming them is a no-op that reports success and
-- changes nothing — which is what the first attempt at this did, and the
-- advisor went on warning until it was pointed at the grant that exists. The
-- owner keeps execute regardless, an owner's rights not being a grant.
revoke execute on function public.handle_new_user() from public;

-- ---------- 3. covering indexes for the foreign keys that carry volume ----------
--
-- Only the ones on tables that actually grow. An index is not free — it is
-- paid for on every write — so `projects`, `roadmaps` and `import_archives`
-- are deliberately left alone: they hold single-digit row counts and always
-- will. `relationships` is the one that matters, and it matters most when a
-- thought is deleted and the cascade has to find every edge touching it.
create index if not exists relationships_from_id_idx      on public.relationships (from_id);
create index if not exists relationships_to_id_idx        on public.relationships (to_id);
create index if not exists memory_events_memory_id_idx    on public.memory_events (memory_id);
create index if not exists memory_events_agent_run_id_idx on public.memory_events (agent_run_id);
create index if not exists research_artifacts_thought_idx on public.research_artifacts (thought_id);
