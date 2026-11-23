-- Kya's Crew and its sponsored rescue-adopter seat (backlog 1.15), switched off.
--
-- Spec: docs/flock/payments-plan.md, item 6d of the payments build:
--   * plans crew_monthly ($45 a month) and crew_annual ($444 a year);
--   * counted by is_flock_member() like any Flock plan (it already counts every
--     plan but app_premium, so it doesn't change);
--   * 25% giving (20% for every other membership), recorded on the row;
--   * each Crew member sponsors six months for a new rescue adopter, counted in
--     crew_sponsorships, which rescue partner codes (1.16) draw from;
--   * an admin view of seats sponsored and used;
--   * no trial (the checkout never asks Stripe for one: billing.ts).
--
-- What changes on an existing table: the entitlements plan check gains the two
-- Crew values, and entitlements gains a nullable giving_rate. Brittany's
-- approval is needed for the check change (the item's "Needs Brittany"). No
-- existing row changes: the check only widens, and the new column starts null.
-- billing_record_stripe_subscription (1.14, unused while BILLING_ENABLED is off)
-- is replaced with the same signature.
--
-- Nothing here runs until BILLING_ENABLED is on in Vercel and a test-mode
-- Stripe Crew price exists (STRIPE_PRICE_CREW_MONTHLY, STRIPE_PRICE_CREW_YEARLY).
-- App users get no access to the new tables and can't execute the new
-- functions.
--
-- Pinned by supabase/checks/crew_checks.sql and npm run test:billing.

-- ── The two Crew plans ────────────────────────────────────────────────────
alter table public.entitlements drop constraint if exists entitlements_plan_check;
alter table public.entitlements
  add constraint entitlements_plan_check
  check (plan in ('founding', 'monthly', 'annual', 'app_premium', 'chapter_lead', 'comp', 'crew_monthly', 'crew_annual'));

-- ── Giving, recorded on each paid row ─────────────────────────────────────
-- Like gift_purchases.giving_rate: the share of what the member pays (less
-- refunds) that goes to rescue and conservation partners. Written by the
-- billing webhook; null on every row it doesn't write.
alter table public.entitlements add column if not exists giving_rate numeric(3, 2)
  check (giving_rate is null or (giving_rate >= 0 and giving_rate <= 1));

create or replace function private.membership_giving_rate(p_plan text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_plan in ('crew_monthly', 'crew_annual') then 0.25 else 0.20 end::numeric(3, 2);
$$;
revoke all on function private.membership_giving_rate(text) from public, anon, authenticated;
grant execute on function private.membership_giving_rate(text) to service_role;

-- ── Sponsored seats ───────────────────────────────────────────────────────
-- One row per Crew subscription, added the first time it's recorded as active
-- (its first payment went through) and never again for that subscription. A
-- seat stays when the sponsor's membership ends or their account is deleted:
-- it was paid for.
create table if not exists public.crew_sponsorships (
  id               uuid primary key default gen_random_uuid(),
  sponsor_user_id  uuid references auth.users (id) on delete set null,
  entitlement_id   uuid references public.entitlements (id) on delete set null,
  subscription_ref text not null unique,
  months           smallint not null default 6 check (months > 0),
  sponsored_at     timestamptz not null default now()
);
create index if not exists crew_sponsorships_sponsor_idx on public.crew_sponsorships (sponsor_user_id);
create index if not exists crew_sponsorships_entitlement_idx on public.crew_sponsorships (entitlement_id);

alter table public.crew_sponsorships enable row level security;
revoke all on public.crew_sponsorships from anon, authenticated;
grant select, insert, update, delete on public.crew_sponsorships to service_role;

-- Seats given to rescue adopters. Nothing writes here yet: rescue partner
-- codes (1.16) add a row when an admin approves a redemption. An adopter gets
-- in even with no seat left, so uses can outnumber seats.
create table if not exists public.crew_seat_uses (
  id              uuid primary key default gen_random_uuid(),
  adopter_user_id uuid references auth.users (id) on delete set null,
  months          smallint not null default 6 check (months > 0),
  used_at         timestamptz not null default now()
);
create index if not exists crew_seat_uses_adopter_idx on public.crew_seat_uses (adopter_user_id);

alter table public.crew_seat_uses enable row level security;
revoke all on public.crew_seat_uses from anon, authenticated;
grant select, insert, update, delete on public.crew_seat_uses to service_role;

-- ── A Stripe subscription → its entitlement row (1.14, now with Crew) ─────
-- Same as 20261123180000_billing_foundation.sql, plus: the Crew plans are
-- accepted, every row records its giving rate, and a Crew subscription's
-- first active record adds its sponsored seat.
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
  if p_plan is null or p_plan not in ('founding', 'monthly', 'annual', 'crew_monthly', 'crew_annual') then
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
     cancel_at_period_end, will_renew, starts_at, giving_rate)
  values
    (p_user_id, p_plan, p_status, 'stripe', p_subscription_id, p_current_period_end, p_product_id,
     coalesce(p_cancel_at_period_end, false), p_will_renew, now(), private.membership_giving_rate(p_plan))
  on conflict (source, external_ref) where external_ref is not null do update set
    plan                 = excluded.plan,
    status               = excluded.status,
    current_period_end   = excluded.current_period_end,
    product_id           = excluded.product_id,
    cancel_at_period_end = excluded.cancel_at_period_end,
    will_renew           = excluded.will_renew,
    giving_rate          = excluded.giving_rate
  returning e.id into v_id;

  if p_plan = 'founding' and p_status = 'canceled' then
    update public.founding_claims set forfeited_at = coalesce(forfeited_at, now()) where id = v_claim;
  end if;

  if p_plan in ('crew_monthly', 'crew_annual') and p_status = 'active' then
    insert into public.crew_sponsorships (sponsor_user_id, entitlement_id, subscription_ref)
    values (p_user_id, v_id, p_subscription_id)
    on conflict (subscription_ref) do nothing;
  end if;

  return v_id;
end;
$$;
revoke all on function public.billing_record_stripe_subscription(uuid, text, text, text, text, text, timestamptz, boolean, boolean) from public, anon, authenticated;
grant execute on function public.billing_record_stripe_subscription(uuid, text, text, text, text, text, timestamptz, boolean, boolean) to service_role;

-- ── Admin view: seats sponsored and used ──────────────────────────────────
-- Admins only (assert_entitlement_admin). Available can go below zero: rescue
-- adopters still get in when no seat is left, and admins see a warning.
create or replace function private.crew_sponsorship_summary_admin()
returns table (crew_members bigint, sponsored bigint, used bigint, available bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  return query
    select
      (select count(distinct e.user_id) from public.entitlements e
        where e.plan in ('crew_monthly', 'crew_annual')
          and private.entitlement_grants_now(e.starts_at, e.status, e.current_period_end)),
      (select count(*) from public.crew_sponsorships),
      (select count(*) from public.crew_seat_uses),
      (select count(*) from public.crew_sponsorships) - (select count(*) from public.crew_seat_uses);
end;
$$;

-- Each seat, newest first: when it was sponsored, by which Crew plan, and
-- whether the sponsor is still a Crew member. No names or emails.
create or replace function private.crew_sponsorships_admin()
returns table (sponsored_at timestamptz, months smallint, plan text, sponsor_still_crew boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  return query
    select s.sponsored_at, s.months, e.plan,
      coalesce(e.plan in ('crew_monthly', 'crew_annual')
        and private.entitlement_grants_now(e.starts_at, e.status, e.current_period_end), false)
    from public.crew_sponsorships s
    left join public.entitlements e on e.id = s.entitlement_id
    order by s.sponsored_at desc;
end;
$$;

revoke all on function private.crew_sponsorship_summary_admin() from public, anon;
revoke all on function private.crew_sponsorships_admin() from public, anon;
grant execute on function private.crew_sponsorship_summary_admin() to authenticated, service_role;
grant execute on function private.crew_sponsorships_admin() to authenticated, service_role;

create or replace function public.admin_crew_sponsorship_summary()
returns table (crew_members bigint, sponsored bigint, used bigint, available bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.crew_sponsorship_summary_admin();
$$;

create or replace function public.admin_crew_sponsorships()
returns table (sponsored_at timestamptz, months smallint, plan text, sponsor_still_crew boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.crew_sponsorships_admin();
$$;

revoke all on function public.admin_crew_sponsorship_summary() from public, anon;
revoke all on function public.admin_crew_sponsorships() from public, anon;
grant execute on function public.admin_crew_sponsorship_summary() to authenticated, service_role;
grant execute on function public.admin_crew_sponsorships() to authenticated, service_role;
