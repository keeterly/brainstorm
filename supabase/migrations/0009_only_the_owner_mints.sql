-- The guest list has to actually hold.
--
-- 0008 built the invite: a row you mint, a code you read down a phone line, a
-- dollar cap that rides along with it. Everything about redeeming works. What
-- it does not do — which is the entire point of the thing — is keep anybody
-- out.
--
-- What was wrong
-- --------------
-- `invites` carried one policy, `own invites`, and it was `for all` scoped to
-- `created_by = auth.uid()`. That reads like a restriction and is not one on
-- INSERT: `created_by` *defaults* to `auth.uid()`, so a stranger satisfies it
-- by definition. `authenticated` also held INSERT, UPDATE, DELETE and TRUNCATE
-- on the table, and the anon key ships in the client bundle by design. So:
--
--   1. make an account — auth is open, and it stays open on purpose
--   2. open Settings, tap "mint a code"
--   3. paste that code into the redeem box on the same screen
--
-- …and `letIn` (netlify/functions/_lib/who.ts) accepts any live invite, so
-- that is full AI on somebody else's Anthropic key. With `AI_INVITES=1` set,
-- the gate was ceremony.
--
-- The fix is not a cleverer policy. It is that "who may mint" is a fact the
-- database has to hold, because RLS cannot read a Netlify environment
-- variable — and a cap somebody can hand themselves is not a cap.

-- ---------- 1. who owns this deployment ----------

/*
 * One row per person who may hand out access. Not a role, not a claim on the
 * JWT, not a column on `profiles` — `profiles` is `for all` to its owner, so
 * an `is_owner` flag kept there is a flag its subject can set.
 *
 * Nothing writes to this through the API. It is changed the way it is seeded:
 * by somebody with the database in front of them.
 */
create table public.app_owners (
  id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.app_owners enable row level security;

/*
 * You may look yourself up, and that is all.
 *
 * `id = auth.uid()` rather than a blanket read, so the answer to "am I an
 * owner?" is a row or no row, and the list of who else is one is not a thing
 * the client can enumerate. The settings page needs the first answer; nobody
 * needs the second.
 */
create policy "am i an owner" on public.app_owners
  for select using (id = (select auth.uid()));

-- …and no insert, update or delete policy at all. Belt and braces: the table
-- privileges go too, so this is refused before RLS is even consulted.
revoke all on public.app_owners from anon, authenticated;
grant select on public.app_owners to authenticated;

/*
 * Seeded with the account that has been here longest.
 *
 * Expressed as a query rather than a pasted uuid so the file is the same file
 * on any deployment. On a fresh database with nobody signed up yet this
 * inserts nothing, and nobody can mint until a row is put here by hand — which
 * is the right way for this to fail. See the README.
 */
insert into public.app_owners (id)
select id from auth.users order by created_at limit 1
on conflict do nothing;

-- ---------- 2. only an owner mints ----------

drop policy if exists "own invites" on public.invites;

-- Yours to look at, if you made it.
create policy "read my own invites" on public.invites
  for select using (created_by = (select auth.uid()));

/*
 * …and yours to make, only if you are the one handing out access.
 *
 * Both halves matter. `created_by = auth.uid()` stops an owner filing an
 * invite under somebody else's name; the `app_owners` test is the one that
 * actually shuts the door. RLS on `app_owners` applies inside this subquery
 * too, which is fine and is in fact the point: a non-owner sees no row there,
 * so `exists` is false, so the insert is refused.
 */
create policy "only an owner mints" on public.invites
  for insert with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.id = (select auth.uid()))
  );

/*
 * Revoking is deleting, and it stays available to whoever minted it —
 * including for a code already in use. Deleting a used invite does not delete
 * that person's account or their thoughts; it takes away the AI, which is the
 * only thing the code ever granted.
 */
create policy "revoke my own invites" on public.invites
  for delete using (created_by = (select auth.uid()));

/*
 * …and no update policy, deliberately.
 *
 * Nothing in the app edits an invite. `redeem_invite` writes `used_by` and
 * `used_at`, and it is `security definer`, so it does not need the caller to
 * hold UPDATE — which is what makes taking the privilege away free. Without
 * this, a tester could PATCH their own `usd_cap` upward, and every ceiling
 * below the Anthropic Console's would have been advisory.
 */
revoke update, truncate, references, trigger on public.invites from authenticated;

-- anon never had a legitimate reason to touch this table: every path through
-- it needs a signed-in uid, and a policy that can never pass is a worse
-- defence than a privilege that was never granted.
revoke all on public.invites from anon;
