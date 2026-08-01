-- One number, for the ceiling over everybody.
--
-- The per-user daily cap is the one everybody reaches for and it bounds
-- nothing: ten testers at six dollars a day is sixty dollars a day, and the cap
-- did its job every single time. Handing the app to people on their own phones
-- needs a *total*, and a total cannot be computed by any of them — RLS means a
-- user's own token sees only their own runs, which is the whole point of it.
--
-- The usual answer is a service-role key on the server. There is no
-- service-role key anywhere in this app and there is not going to be one: it
-- would be a credential that bypasses every policy in the database, sitting in
-- an environment variable, so that a spend cap could add up a column.
--
-- This is the small version of the same thing. `security definer` lets the
-- function read past RLS; the function returns one number and has no arguments,
-- so there is nothing to steer it with. What a signed-in person can learn from
-- it is how many dollars everybody spent today — not who, not on what, not how
-- many people there are. For a private app with a guest list that is a fair
-- trade for a ceiling that actually holds.
create or replace function public.ai_spend_today()
returns numeric
language sql
security definer
-- pinned, so nothing a caller can create shadows what this resolves
set search_path = public, pg_temp
stable
as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from public.agent_runs
  where created_at >= date_trunc('day', now() at time zone 'utc');
$$;

-- FROM PUBLIC, not from anon and authenticated by name. `execute` is granted to
-- PUBLIC by default and those roles inherit it from there rather than holding a
-- grant of their own, so naming them is a no-op that reports success and
-- changes nothing — which is exactly what the first attempt at this did on
-- handle_new_user in 0006, and the advisor went on warning until it was pointed
-- at the grant that actually exists.
revoke execute on function public.ai_spend_today() from public;
grant execute on function public.ai_spend_today() to authenticated;

-- …and from anon, which is the mirror image of the lesson in 0006.
--
-- There, revoking from `anon, authenticated` by name was the no-op and
-- revoking from PUBLIC was the fix, because those roles inherited the grant
-- rather than holding one. Here it is the other way round: Supabase ships an
-- `alter default privileges` rule that grants execute on new functions in
-- `public` to anon and authenticated *directly*, so the revoke above left anon
-- holding a grant of its own. Checked with information_schema both times
-- rather than assumed — a signed-out visitor must not be able to read what
-- everybody spent today.
revoke execute on function public.ai_spend_today() from anon;
