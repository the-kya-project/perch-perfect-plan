-- Native push (APNs on iOS, FCM on Android).
--
-- `push_subscriptions` was Web-Push-shaped: endpoint + p256dh + auth, all NOT
-- NULL. A native device has none of those -- it has a single opaque device
-- token -- so those three become nullable and a `transport` discriminator says
-- which shape a row is. Existing rows are Web Push and keep working untouched.

alter table public.push_subscriptions
  add column if not exists transport text not null default 'webpush',
  add column if not exists token text;

alter table public.push_subscriptions
  alter column endpoint drop not null,
  alter column p256dh   drop not null,
  alter column auth     drop not null;

do $$ begin
  alter table public.push_subscriptions
    add constraint push_subscriptions_transport_check
    check (transport in ('webpush', 'apns', 'fcm'));
exception when duplicate_object then null; end $$;

-- Shape integrity. A webpush row is only sendable with all three Web Push
-- fields; a native row is only sendable with a device token. Enforcing it here
-- means the sender never has to defend against a half-written row.
do $$ begin
  alter table public.push_subscriptions
    add constraint push_subscriptions_shape_check
    check (
      (transport = 'webpush' and endpoint is not null and p256dh is not null and auth is not null)
      or (transport in ('apns', 'fcm') and token is not null)
    );
exception when duplicate_object then null; end $$;

-- One row per device token. Partial index: existing Web Push rows have a NULL
-- token and are unaffected. (The pre-existing UNIQUE on `endpoint` is likewise
-- unaffected -- Postgres permits many NULLs in a unique index, so native rows
-- with a NULL endpoint do not collide with each other.)
create unique index if not exists push_subscriptions_token_key
  on public.push_subscriptions (token)
  where token is not null;

comment on column public.push_subscriptions.transport is
  'webpush | apns | fcm -- which sender delivers to this row.';
comment on column public.push_subscriptions.token is
  'Native device token (APNs or FCM). NULL for Web Push rows.';
