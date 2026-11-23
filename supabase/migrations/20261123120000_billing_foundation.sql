-- Billing foundation (backlog 1.14), switched off.
--
-- What paid Flock membership needs in the database, from
-- docs/flock/payments-plan.md section c ("Additive schema for billing"):
--   * billing_customers: which Stripe customer is which account;
--   * billing_events: every webhook event received, once (idempotency and
--     audit; ids and types only, never content);
--   * entitlements gains product_id, will_renew and cancel_at_period_end;
--   * founding_claims gains released_at (no card by the end of the free
--     season; written later by the end-of-season job) and forfeited_at (a paid
--     founding membership that ended);
--   * the service-role functions the Stripe billing webhook writes through.
--
-- Additive only: new tables, new nullable or defaulted columns, new functions.
-- Nothing existing changes, and nothing here runs until BILLING_ENABLED is on
-- in Vercel and a test-mode Stripe subscription exists. App users get no
-- access to the new tables and can't execute the new functions; their own
-- entitlement rows stay readable exactly as before (the new columns included).
--
-- A Stripe row is keyed on (source 'stripe', external_ref = subscription id),
-- the existing unique index entitlements_source_external_ref_key. Its plan
-- comes from the price: Founding $15/month → founding, Regular $30/month →
-- monthly, Regular $300/year → annual. is_flock_member() already reads it:
-- active/trialing = access; past_due/canceled = access until
-- current_period_end. Free-season rows (source 'free_season') are never read,
-- converted or touched here.
--
-- Pinned by supabase/checks/billing_checks.sql and npm run test:billing.

-- ── billing_customers ──────────────────────────────────────────────────────
create table if not exists public.billing_customers (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
revoke all on public.billing_customers from anon, authenticated;
grant select, insert, update, delete on public.billing_customers to service_role;

-- ── billing_events ─────────────────────────────────────────────────────────
create table if not exists public.billing_events (
  id           bigint generated always as identity primary key,
  provider     text not null check (provider in ('stripe', 'apple', 'google')),
  event_id     text not null,
  event_type   text not null,
  -- The subscription, invoice or session the event was about (an id only).
  object_id    text,
  received_at  timestamptz not null default now(),
  -- Null until the event has been handled. A failed attempt leaves it null so
  -- the provider's retry handles it again.
  processed_at timestamptz,
  outcome      text,
  unique (provider, event_id)
);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;
grant select, insert, update, delete on public.billing_events to service_role;

-- ── New columns ────────────────────────────────────────────────────────────
alter table public.entitlements add column if not exists product_id text;
alter table public.entitlements add column if not exists will_renew boolean;
alter table public.entitlements add column if not exists cancel_at_period_end boolean not null default false;

alter table public.founding_claims add column if not exists released_at timestamptz;
alter table public.founding_claims add column if not exists forfeited_at timestamptz;

-- ── Founding price: who still has it ──────────────────────────────────────
-- A founder keeps the $15 price while their claim is neither released (no
-- card by the free season's end) nor forfeited (a paid founding membership
-- that ended). The card step offers it only when this is true.
create or replace function private.billing_founding_price_open(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.founding_claims c
    where c.user_id = p_user_id
      and c.released_at is null
      and c.forfeited_at is null
  );
$$;
revoke all on function private.billing_founding_price_open(uuid) from public, anon, authenticated;

create or replace function public.billing_founding_price_open(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.billing_founding_price_open(p_user_id); $$;
revoke all on function public.billing_founding_price_open(uuid) from public, anon, authenticated;
grant execute on function public.billing_founding_price_open(uuid) to service_role;
grant usage on schema private to service_role;
grant execute on function private.billing_founding_price_open(uuid) to service_role;

-- ── Webhook events: claim once, finish once ────────────────────────────────
-- Returns true when the event still needs handling: it's new, or an earlier
-- delivery failed before finishing. Handling is itself safe to repeat (the
-- webhook re-reads the subscription from Stripe and writes the row from that),
-- so two deliveries racing each other do no harm.
create or replace function public.billing_claim_event(p_provider text, p_event_id text, p_event_type text, p_object_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.billing_events (provider, event_id, event_type, object_id)
  values (p_provider, p_event_id, p_event_type, p_object_id)
  on conflict (provider, event_id) do nothing;
  return exists (
    select 1 from public.billing_events
    where provider = p_provider and event_id = p_event_id and processed_at is null
  );
end;
$$;
revoke all on function public.billing_claim_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.billing_claim_event(text, text, text, text) to service_role;

create or replace function public.billing_finish_event(p_provider text, p_event_id text, p_outcome text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.billing_events
  set processed_at = coalesce(processed_at, now()), outcome = left(p_outcome, 200)
  where provider = p_provider and event_id = p_event_id;
$$;
revoke all on function public.billing_finish_event(text, text, text) from public, anon, authenticated;
grant execute on function public.billing_finish_event(text, text, text) to service_role;

-- ── A Stripe subscription → its entitlement row ───────────────────────────
-- Called by the webhook with what it just re-read from Stripe, so event order
-- never matters. One row per subscription; the account it belongs to never
-- changes. The founding price needs a founding claim. When a founding
-- membership actually ends (status canceled), the claim's founding price is
-- forfeited for good (payments-plan decision h8): turning off auto-renew alone
-- leaves status active with cancel_at_period_end, so it forfeits nothing.
create or replace function public.billing_record_stripe_subscription(
  p_user_id              uuid,
  p_customer_id          text,
  p_subscription_id      text,
  p_plan                 text,
  p_status               text,
  p_product_id           text,
  p_current_period_end   timestamptz,
  p_cancel_at_period_end boolean,
  p_will_renew           boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_claim uuid;
  v_owner uuid;
begin
  if p_user_id is null or coalesce(p_customer_id, '') = '' or coalesce(p_subscription_id, '') = '' then
    raise exception 'billing: user, customer and subscription are required';
  end if;
  if p_plan is null or p_plan not in ('founding', 'monthly', 'annual') then
    raise exception 'billing: unknown plan %', p_plan;
  end if;
  if p_status is null or p_status not in ('active', 'trialing', 'past_due', 'canceled') then
    raise exception 'billing: unknown status %', p_status;
  end if;

  select user_id into v_owner from public.billing_customers where stripe_customer_id = p_customer_id;
  if v_owner is null then
    insert into public.billing_customers (user_id, stripe_customer_id) values (p_user_id, p_customer_id);
  elsif v_owner <> p_user_id then
    raise exception 'billing: customer belongs to another account';
  end if;

  select user_id into v_owner from public.entitlements
  where source = 'stripe' and external_ref = p_subscription_id;
  if v_owner is not null and v_owner <> p_user_id then
    raise exception 'billing: subscription belongs to another account';
  end if;

  if p_plan = 'founding' then
    select id into v_claim from public.founding_claims where user_id = p_user_id;
    if v_claim is null then
      raise exception 'billing: founding price without a founding claim';
    end if;
  end if;

  insert into public.entitlements as e
    (user_id, plan, status, source, external_ref, current_period_end, product_id,
     cancel_at_period_end, will_renew, founding_claim_id, starts_at)
  values
    (p_user_id, p_plan, p_status, 'stripe', p_subscription_id, p_current_period_end, p_product_id,
     coalesce(p_cancel_at_period_end, false), p_will_renew, v_claim, now())
  on conflict (source, external_ref) where external_ref is not null do update set
    plan                 = excluded.plan,
    status               = excluded.status,
    current_period_end   = excluded.current_period_end,
    product_id           = excluded.product_id,
    cancel_at_period_end = excluded.cancel_at_period_end,
    will_renew           = excluded.will_renew,
    founding_claim_id    = excluded.founding_claim_id
  returning e.id into v_id;

  if p_plan = 'founding' and p_status = 'canceled' then
    update public.founding_claims set forfeited_at = coalesce(forfeited_at, now()) where id = v_claim;
  end if;

  return v_id;
end;
$$;
revoke all on function public.billing_record_stripe_subscription(uuid, text, text, text, text, text, timestamptz, boolean, boolean) from public, anon, authenticated;
grant execute on function public.billing_record_stripe_subscription(uuid, text, text, text, text, text, timestamptz, boolean, boolean) to service_role;
