-- Inviting someone, and making the meter mean something first.
--
-- Two things, and the order matters: the caps have to be real before anybody
-- else is handed the URL, because until they are, an invite is a licence to
-- spend that nothing enforces.
--
-- What was wrong
-- --------------
-- `agent_runs` carried one policy, `own runs`, and it was `for all` — select,
-- insert, UPDATE and DELETE. The anon key ships in the client bundle by design,
-- so any signed-in person could call PostgREST directly:
--
--     DELETE /rest/v1/agent_runs?user_id=eq.<self>
--
-- The spend meter reads that table (see _lib/runs.ts), so deleting your own
-- rows resets your own daily cap. The $6/day ceiling was advisory.
--
-- And `cost_usd numeric(10,6)` had no CHECK. One row inserted at -999999 makes
-- `public.ai_spend_today()` return a negative number — and that function is
-- what backs AI_TOTAL_USD_CAP, the ceiling over *everyone* on the deployment.
-- One person could switch off the whole budget.

-- ---------- 1. the ledger only goes one way ----------

-- A cost is a cost. Nothing in the app ever writes a negative one; only an
-- attacker would want to.
alter table public.agent_runs
  add constraint agent_runs_cost_not_negative check (cost_usd is null or cost_usd >= 0);

drop policy if exists "own runs" on public.agent_runs;

-- Read your own. Unchanged — the AI activity page is built on this.
create policy "read own runs" on public.agent_runs
  for select using (user_id = (select auth.uid()));

-- Start your own. `with check` still pins user_id to you, so a run cannot be
-- filed against somebody else.
create policy "start own runs" on public.agent_runs
  for insert with check (user_id = (select auth.uid()));

/*
 * Finish your own, once.
 *
 * The app inserts a run with an *estimated* cost before the model answers and
 * corrects it on the way out — see finishRun in netlify/functions/_lib/runs.ts,
 * which PATCHes status to succeeded/failed/invalid_output along with the real
 * tokens and cost. That correction is legitimate and often lowers the number,
 * because the estimate carries a 1.1 safety margin. So "never decrease" would
 * have broken the ordinary path.
 *
 * What is not legitimate is touching a run that has already landed. `using`
 * tests the row as it stands, so this permits exactly one transition — out of
 * 'running' — and freezes the row after it. A finished run is history.
 */
create policy "finish own runs" on public.agent_runs
  for update
  using (user_id = (select auth.uid()) and status = 'running')
  with check (user_id = (select auth.uid()));

-- …and no delete policy at all. Nothing in the app deletes a run — grepped,
-- there is not one call site — and the only reason to want to is to forget
-- what you spent. The ledger is append-only now.

-- ---------- 2. invites ----------

/*
 * A code you can hand to somebody, instead of a redeploy.
 *
 * The allowlist that exists today is AI_ALLOWED_EMAILS, a comma-separated
 * Netlify environment variable. It works, and adding tester number four means
 * editing config and rebuilding the site — which is not something you do from
 * a phone while somebody is standing in front of you.
 *
 * A row instead. Minting one is a row, revoking one is a row, and the cap that
 * comes with it lives here rather than on the profile — because a profile is
 * something its owner can UPDATE, and a cap you can raise yourself is not a cap.
 */
create table public.invites (
  code text primary key,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- who you meant it for, in your own words. Never shown to them.
  note text,
  -- what this person may spend a day. Null means the deployment's own default.
  usd_cap numeric(10, 2) check (usd_cap is null or usd_cap >= 0),
  expires_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index invites_used_by_idx on public.invites (used_by);
create index invites_created_by_idx on public.invites (created_by);

alter table public.invites enable row level security;

-- Yours to manage, if you made it.
create policy "own invites" on public.invites
  for all using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

/*
 * …and readable by the person who redeemed it, so the server can look up their
 * cap using their own token. Select only: they may see what they were given and
 * cannot change it.
 */
create policy "read the invite i redeemed" on public.invites
  for select using (used_by = (select auth.uid()));

/*
 * Redeeming.
 *
 * `security definer` because the whole point is a write the caller is not
 * allowed to make: before redemption the row is not theirs by any policy, so
 * they cannot even see it to claim it. The function does the claim atomically
 * and tells them nothing about a code that does not work beyond that it does
 * not work — no distinction between wrong, expired and already used, because
 * that difference is only useful to somebody guessing.
 *
 * search_path is pinned, so nothing the caller can create shadows what this
 * resolves.
 */
create or replace function public.redeem_invite(code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  hit int;
begin
  if me is null then
    return false;
  end if;
  -- already in? redeeming twice is not an error, it is a refresh
  if exists (select 1 from public.invites i where i.used_by = me) then
    return true;
  end if;
  update public.invites i
     set used_by = me, used_at = now()
   where lower(i.code) = lower(trim(redeem_invite.code))
     and i.used_by is null
     and (i.expires_at is null or i.expires_at > now());
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

revoke execute on function public.redeem_invite(text) from public;
revoke execute on function public.redeem_invite(text) from anon;
grant execute on function public.redeem_invite(text) to authenticated;
