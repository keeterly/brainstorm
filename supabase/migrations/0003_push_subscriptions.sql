-- Where to reach you when the app is not open.
--
-- ⚡ already runs somewhere your phone is not: a background function that
-- carries on through a lock, a switched app, or a closed tab. The gap was never
-- the work — it was that finishing made no sound, so the only way to learn the
-- agent had come back was to open the app and look.
--
-- A push subscription is a URL the browser's own push service gave us, plus the
-- two keys needed to encrypt a message that only this device can open. We never
-- see the message in transit and neither does the push service.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- the push service's address for this one browser on this one device
  endpoint text not null,
  -- the device's public key and auth secret, for payload encryption
  p256dh text not null,
  auth text not null,
  -- so a person with four of these can tell which is which before deleting one
  label text,
  created_at timestamptz not null default now(),
  -- when we last managed to deliver: a subscription that has never worked is
  -- worth retiring, and one that starts failing has been revoked
  last_ok_at timestamptz,
  -- the push service said this endpoint is gone; keep the row briefly so the
  -- UI can explain why notifications stopped rather than silently losing them
  gone_at timestamptz,

  -- one row per device. Re-subscribing on a device that already has one should
  -- refresh its keys, not accumulate duplicates and send four notifications.
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id)
  where gone_at is null;

alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Which runs have already been announced. Without it, every device that comes
-- back and finds an unclaimed run would send its own notification for it, and
-- resuming a watch would announce a result the user was told about an hour ago.
alter table public.agent_runs
  add column if not exists notified_at timestamptz;

comment on column public.agent_runs.notified_at is
  'When a notification for this run was sent. Set once, by whoever sends it first.';
