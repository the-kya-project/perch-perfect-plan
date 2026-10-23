-- Gift memberships, sold on the website through Stripe Checkout. Additive only.
--
-- A gift is a promise, like a founding claim: redeeming one records who it
-- belongs to and writes no entitlement. The launch build turns each redeemed
-- gift into twelve months of access starting at launch (plan 'flock_year'
-- becomes a Flock entitlement, 'app_premium_year' an 'app_premium' one; see
-- 20261020180000_flock_foundation.sql).
--
-- Who writes what:
--   * Purchases are recorded only by the Stripe webhook, through
--     record_gift_purchase(), which only the service role may call. Nothing a
--     browser sends ever creates a row.
--   * Refunds are marked by the same webhook, also as the service role.
--   * Redemption goes through redeem_gift(code), a SECURITY DEFINER function
--     behind a SECURITY INVOKER wrapper (the foundation's pattern).
--
-- The daily job that sends dated recipient emails is scheduled by the next
-- migration, gift_emails_cron.
--
-- Conventions as in the Flock foundation: search_path = '' on every function,
-- EXECUTE revoked from PUBLIC and anon then granted back where needed, and the
-- table's default anon/authenticated grants revoked first.


-- 1) Configuration -------------------------------------------------------------

-- Double-giving days: a purchase made on one of these dates (in Indianapolis)
-- sends 40% to rescue and conservation instead of 20%. Giving Tuesday 2026 is
-- the first; add more dates here.
create or replace function private.double_giving_days()
returns date[]
language sql
immutable
set search_path = ''
as $$
  select array['2026-12-01'::date];
$$;

create or replace function private.gift_giving_rate(p_purchased_at timestamptz)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when (p_purchased_at at time zone 'America/Indiana/Indianapolis')::date = any (private.double_giving_days())
      then 0.40
    else 0.20
  end::numeric;
$$;

revoke all on function private.double_giving_days() from public, anon;
revoke all on function private.gift_giving_rate(timestamptz) from public, anon;
grant execute on function private.double_giving_days() to authenticated, service_role;
grant execute on function private.gift_giving_rate(timestamptz) to authenticated, service_role;


-- 2) Purchases -------------------------------------------------------------------

create table if not exists public.gift_purchases (
  id                         uuid primary key default gen_random_uuid(),
  created_at                 timestamptz not null default now(),
  -- When Stripe completed the payment (the webhook event's time). Decides the
  -- giving rate.
  purchased_at               timestamptz not null default now(),
  plan                       text not null check (plan in ('flock_year', 'app_premium_year')),
  buyer_email                text not null,
  buyer_name                 text,
  recipient_name             text not null check (char_length(btrim(recipient_name)) between 1 and 80),
  recipient_email            text,
  message                    text check (message is null or char_length(message) <= 300),
  send_on                    date,
  amount_paid_cents          integer not null check (amount_paid_cents >= 0),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id   text,
  promo_code                 text,
  giving_rate                numeric(3, 2) not null default 0.20 check (giving_rate >= 0 and giving_rate <= 1),
  -- KYA-XXXX-XXXX from 2-9 and A-Z without I and O, so nothing reads as 0/O or 1/I.
  gift_code                  text not null unique
    check (gift_code ~ '^KYA-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
  status                     text not null default 'paid' check (status in ('paid', 'redeemed', 'refunded')),
  redeemed_by                uuid references auth.users (id) on delete set null,
  redeemed_at                timestamptz,
  refunded_at                timestamptz,
  -- Email bookkeeping. Each is claimed before sending, so a webhook delivered
  -- twice or a cron overlapping a webhook sends once.
  buyer_emailed_at           timestamptz,
  recipient_emailed_at       timestamptz,
  -- Emailing the recipient means both an address and a date; sending to
  -- yourself means neither.
  constraint gift_purchases_delivery check ((recipient_email is null) = (send_on is null)),
  constraint gift_purchases_redeemed check (status <> 'redeemed' or (redeemed_by is not null and redeemed_at is not null))
);

create index if not exists gift_purchases_payment_intent_idx on public.gift_purchases (stripe_payment_intent_id);
create index if not exists gift_purchases_redeemed_by_idx on public.gift_purchases (redeemed_by);
create index if not exists gift_purchases_due_idx on public.gift_purchases (send_on)
  where recipient_email is not null and recipient_emailed_at is null;

alter table public.gift_purchases enable row level security;
revoke all on public.gift_purchases from anon, authenticated;
grant select on public.gift_purchases to authenticated;

-- No public reads. A signed-in person sees the gifts they redeemed; admins see
-- every gift. No write policy: the service role and redeem_gift() write.
drop policy if exists "gift_purchases read" on public.gift_purchases;
create policy "gift_purchases read" on public.gift_purchases
  for select to authenticated
  using (
    redeemed_by = (select auth.uid())
    or private.is_admin((select auth.uid()))
  );


-- 3) Recording a purchase (webhook only) ---------------------------------------

create or replace function private.new_gift_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- 32 symbols
  b    bytea;
  s    text;
  code text;
begin
  loop
    b := extensions.gen_random_bytes(8);
    s := '';
    -- 256 is a multiple of 32, so every symbol is equally likely.
    for i in 0..7 loop
      s := s || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    code := 'KYA-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
    exit when not exists (select 1 from public.gift_purchases where gift_code = code);
  end loop;
  return code;
end;
$$;

revoke all on function private.new_gift_code() from public, anon, authenticated;
grant execute on function private.new_gift_code() to service_role;

-- Idempotent on the Checkout session: a second delivery of the same event
-- returns the existing row with created = false and changes nothing.
create or replace function public.record_gift_purchase(
  p_checkout_session_id text,
  p_payment_intent_id   text,
  p_plan                text,
  p_buyer_email         text,
  p_buyer_name          text,
  p_recipient_name      text,
  p_recipient_email     text,
  p_message             text,
  p_send_on             date,
  p_amount_paid_cents   integer,
  p_promo_code          text,
  p_purchased_at        timestamptz
)
returns table (id uuid, gift_code text, created boolean)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id   uuid;
  v_code text;
begin
  insert into public.gift_purchases (
    purchased_at, plan, buyer_email, buyer_name, recipient_name, recipient_email,
    message, send_on, amount_paid_cents, stripe_checkout_session_id,
    stripe_payment_intent_id, promo_code, giving_rate, gift_code
  )
  values (
    p_purchased_at, p_plan, lower(btrim(p_buyer_email)), nullif(btrim(p_buyer_name), ''),
    btrim(p_recipient_name), nullif(lower(btrim(p_recipient_email)), ''),
    nullif(btrim(p_message), ''), p_send_on, p_amount_paid_cents, p_checkout_session_id,
    p_payment_intent_id, nullif(btrim(p_promo_code), ''),
    private.gift_giving_rate(p_purchased_at), private.new_gift_code()
  )
  on conflict (stripe_checkout_session_id) do nothing
  returning gift_purchases.id, gift_purchases.gift_code into v_id, v_code;

  if v_id is not null then
    return query select v_id, v_code, true;
  else
    return query
      select g.id, g.gift_code, false
      from public.gift_purchases g
      where g.stripe_checkout_session_id = p_checkout_session_id;
  end if;
end;
$$;

revoke all on function public.record_gift_purchase(text, text, text, text, text, text, text, text, date, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_gift_purchase(text, text, text, text, text, text, text, text, date, integer, text, timestamptz)
  to service_role;


-- 4) Redeeming -------------------------------------------------------------------

-- Every attempt, for the rate limit. In `private`, so it is never exposed.
create table if not exists private.gift_redeem_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists gift_redeem_attempts_user_idx
  on private.gift_redeem_attempts (user_id, attempted_at);

revoke all on private.gift_redeem_attempts from public, anon, authenticated;

-- Returns a status instead of raising, so the failed attempt it records is
-- kept. Unknown, refunded and already-redeemed codes all return the same
-- 'invalid' so a code's state can't be probed. More than 10 failed attempts in
-- an hour returns 'rate_limited' without looking at the code at all.
create or replace function private.redeem_gift(p_code text)
returns table (ok boolean, plan text, reason text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_clean text;
  v_code  text;
  v_id    uuid;
  v_plan  text;
begin
  if v_user is null then
    return query select false, null::text, 'not_signed_in'::text;
    return;
  end if;

  if (select count(*) from private.gift_redeem_attempts a
      where a.user_id = v_user and not a.succeeded
        and a.attempted_at > now() - interval '1 hour') >= 10 then
    return query select false, null::text, 'rate_limited'::text;
    return;
  end if;

  -- Accept the code however it was typed: any case, spaces, dashes, with or
  -- without the KYA prefix.
  v_clean := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_clean like 'KYA%' then
    v_clean := substr(v_clean, 4);
  end if;
  if v_clean ~ '^[2-9A-HJ-NP-Z]{8}$' then
    v_code := 'KYA-' || substr(v_clean, 1, 4) || '-' || substr(v_clean, 5, 4);

    select g.id, g.plan into v_id, v_plan
    from public.gift_purchases g
    where g.gift_code = v_code and g.status = 'paid' and g.redeemed_by is null
    for update;
  end if;

  if v_id is null then
    insert into private.gift_redeem_attempts (user_id, succeeded) values (v_user, false);
    return query select false, null::text, 'invalid'::text;
    return;
  end if;

  update public.gift_purchases
  set status = 'redeemed', redeemed_by = v_user, redeemed_at = now()
  where id = v_id;

  insert into private.gift_redeem_attempts (user_id, succeeded) values (v_user, true);
  return query select true, v_plan, null::text;
end;
$$;

revoke all on function private.redeem_gift(text) from public, anon;
grant execute on function private.redeem_gift(text) to authenticated, service_role;

create or replace function public.redeem_gift(p_code text)
returns table (ok boolean, plan text, reason text)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.redeem_gift(p_code);
$$;

revoke all on function public.redeem_gift(text) from public, anon;
grant execute on function public.redeem_gift(text) to authenticated, service_role;
