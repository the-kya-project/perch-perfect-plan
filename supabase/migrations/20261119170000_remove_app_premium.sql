-- App premium is gone (decided Nov 19, 2026). The care app is free; the only
-- paid plans are the Flock and Kya's Crew (a Flock plan). Journeys now have two
-- levels:
--   free  - the 7 husbandry journeys, one custom journey at a time, private
--           only (public.journey_limits row 'free', unchanged)
--   flock - all 14 journeys, unlimited custom journeys, sharing and the
--           community (row 'flock'); Flock members and admins
--
-- What changes:
--   1. private.journey_tier() returns 'free' or 'flock' only. Every rule that
--      read "app premium or Flock" goes through it (journey_limits_for):
--      starting Flock-only templates, unlimited custom journeys, browsing
--      community journeys (journey_viewable), finisher tips and clip limits.
--      So those become Flock only with no other function redefined.
--   2. public.has_app_premium() and private.has_app_premium() are dropped:
--      journey_tier was the only caller, and the app never called the RPC.
--   3. Nothing can sell or grant app premium again. The plan values stay in
--      the check constraints (entitlements.plan 'app_premium',
--      gift_purchases.plan 'app_premium_year') because one refunded app premium
--      gift record uses one; new triggers refuse any new row, or any change,
--      that would set either value. The existing record is untouched.
--   4. The 'premium' row in public.journey_limits stays, unused (no tier maps
--      to it). journey_templates.tier keeps the stored value 'premium', which
--      now means "Flock only".
--
-- Not changed: free users' clip limits and every care-app table, policy and
-- function. Journeys stay switched off for everyone but admins
-- (journey_settings.audience). journey_start still raises "this journey comes
-- with app premium" internally; the app shows "This journey is only available
-- to Flock members."
--
-- No new tables, so no new RLS. Pinned by supabase/checks/journeys_checks.sql,
-- journeys_browse_checks.sql, journey_updates_checks.sql,
-- flock_entitlement_grants_checks.sql and flock_posts_checks.sql.

-- 1) Two levels.
create or replace function private.journey_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user_id is null then 'free'
    when private.is_flock_member(p_user_id) or private.is_admin(p_user_id) then 'flock'
    else 'free'
  end;
$$;

comment on function private.journey_tier(uuid) is
  'Journey level: flock (Flock members, Kya''s Crew and admins) or free. App premium was removed on Nov 19, 2026.';

revoke all on function private.journey_tier(uuid) from public, anon;
grant execute on function private.journey_tier(uuid) to authenticated, service_role;

-- 2) No more premium check.
drop function if exists public.has_app_premium(uuid);
drop function if exists private.has_app_premium(uuid);

-- 3) Nothing can sell or grant app premium.
create or replace function private.refuse_app_premium_gift()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan = 'app_premium_year' and (tg_op = 'INSERT' or old.plan is distinct from new.plan) then
    raise exception 'app_premium_retired' using errcode = 'P0001',
      hint = 'App premium was removed on Nov 19, 2026. The only gift is a year in the Flock.';
  end if;
  return new;
end;
$$;

create or replace function private.refuse_app_premium_entitlement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan = 'app_premium' and (tg_op = 'INSERT' or old.plan is distinct from new.plan) then
    raise exception 'app_premium_retired' using errcode = 'P0001',
      hint = 'App premium was removed on Nov 19, 2026. Flock and Kya''s Crew are the only paid plans.';
  end if;
  return new;
end;
$$;

revoke all on function private.refuse_app_premium_gift() from public, anon, authenticated;
revoke all on function private.refuse_app_premium_entitlement() from public, anon, authenticated;

drop trigger if exists gift_purchases_refuse_app_premium on public.gift_purchases;
create trigger gift_purchases_refuse_app_premium
  before insert or update of plan on public.gift_purchases
  for each row execute function private.refuse_app_premium_gift();

drop trigger if exists entitlements_refuse_app_premium on public.entitlements;
create trigger entitlements_refuse_app_premium
  before insert or update of plan on public.entitlements
  for each row execute function private.refuse_app_premium_entitlement();

-- 4) The unused rows keep their data; the comments say why.
comment on table public.journey_limits is
  'Per-level journey limits. NULL = no limit. Rows used: free and flock (private.journey_tier). The premium row is unused since app premium was removed (Nov 19, 2026).';
comment on column public.journey_templates.tier is
  'free = every account; premium = Flock only (the stored name predates the removal of app premium on Nov 19, 2026).';
