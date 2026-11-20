-- Gifts: six months in the Flock, alongside a year.
--
-- A new gift plan, 'flock_half_year' ($150, one-time), next to 'flock_year'
-- ($300). It follows every rule of the yearly gift except its length:
--   - it starts on the later of redemption and the free season's end
--     (Tue, Jul 6, 2027), never before opening day is set;
--   - it runs six months from its start (a year for flock_year);
--   - until it starts, it moves when the free season's end or opening day
--     moves; once started it keeps its dates;
--   - only status = 'redeemed' grants; a refund ends it; gifts queue end to
--     end (a six-month gift and a year redeemed by the same person run one
--     after the other).
--
-- Changes:
--   - gift_purchases' plan check allows 'flock_half_year' (widened; every
--     existing row still passes).
--   - private.grant_gift: both Flock gifts create a gift entitlement with plan
--     'annual' (the Flock membership kind); the gift's length lives on the
--     gift (gift_purchases.plan), which place_grant reads.
--   - private.place_grant: the gift's length (6 months or 1 year) replaces the
--     fixed year, counted on the Eastern calendar (so Jul 6 + 6 months ends at
--     midnight Jan 6 Eastern, not an hour early across daylight saving).
--     Otherwise the 20261120180000 version.
--   - private.refuse_app_premium_gift: only its hint text (the gifts are now
--     six months or a year in the Flock).
-- Flock-only: no care-app table, policy, trigger or function changes.
-- Pinned by supabase/checks/flock_gift_year_checks.sql.

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.gift_purchases'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%flock_year%'
  loop
    execute format('alter table public.gift_purchases drop constraint %I', c);
  end loop;
end $$;
alter table public.gift_purchases
  add constraint gift_purchases_plan_check
  check (plan in ('flock_half_year', 'flock_year', 'app_premium_year'));

comment on column public.gift_purchases.plan is
  'flock_half_year (six months in the Flock) or flock_year (a year). app_premium_year only for one old refunded record; new ones are refused (gift_purchases_refuse_app_premium).';

create or replace function private.grant_gift(p_gift_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g    public.gift_purchases;
  v_id uuid;
begin
  select * into g from public.gift_purchases where id = p_gift_id;
  -- LAUNCH RULE: only status = 'redeemed' grants (never "has a redeemer").
  if g.id is null or g.redeemed_by is null or not private.gift_grants_membership(g.status) then return; end if;
  insert into public.entitlements (user_id, plan, status, source, gift_purchase_id, starts_at, current_period_end, note)
  values (
    g.redeemed_by,
    -- Both Flock gifts are a Flock membership; the length is on the gift.
    case when g.plan in ('flock_year', 'flock_half_year') then 'annual' else 'app_premium' end,
    'active', 'gift', g.id, null, null,
    'Gift ' || g.gift_code
  )
  on conflict (gift_purchase_id) where gift_purchase_id is not null do nothing
  returning id into v_id;
  if v_id is not null then
    perform private.reschedule_pending_grants(g.redeemed_by);
  end if;
end;
$$;

revoke all on function private.grant_gift(uuid) from public, anon, authenticated;
grant execute on function private.grant_gift(uuid) to service_role;

create or replace function private.refuse_app_premium_gift()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan = 'app_premium_year' and (tg_op = 'INSERT' or old.plan is distinct from new.plan) then
    raise exception 'app_premium_retired' using errcode = 'P0001',
      hint = 'App premium was removed on Nov 19, 2026. Gifts are six months or a year in the Flock.';
  end if;
  return new;
end;
$$;

revoke all on function private.refuse_app_premium_gift() from public, anon, authenticated;

create or replace function private.place_grant(p_entitlement_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e         public.entitlements;
  g         public.gift_purchases;
  v_opens   timestamptz := private.flock_opens_at();
  v_started boolean;
  v_start   timestamptz;
  v_queue   timestamptz;
  v_end     timestamptz;
  v_next    timestamptz;
  v_overlap interval;
  v_order   text;
  v_free    timestamptz;
  v_len     interval;
begin
  select * into e from public.entitlements where id = p_entitlement_id for update;
  if e.id is null or e.source not in ('founding', 'gift') or e.status = 'canceled' then return; end if;
  v_started := e.starts_at is not null and e.starts_at <= now();

  if e.source = 'founding' then
    if v_started then return; end if;
    -- No opening day yet: no dates. Otherwise free until the free season ends.
    v_free := case when v_opens is null then null else private.free_season_ends_at() end;
    update public.entitlements
    set starts_at          = v_opens,
        free_until         = v_free,
        current_period_end = v_free,
        status             = 'trialing'
    where id = e.id;
    return;
  end if;

  -- Gifts.
  select * into g from public.gift_purchases where id = e.gift_purchase_id;
  if g.id is null or not private.gift_grants_membership(g.status) then return; end if;
  -- How long the gift runs: six months or a year.
  v_len := case g.plan when 'flock_half_year' then interval '6 months' else interval '1 year' end;
  if v_started and e.plan <> 'app_premium' then return; end if;

  if v_started then
    v_start := e.starts_at;
  else
    -- No opening day yet: no start. (Not greatest(): it ignores NULLs.)
    -- A gift year starts when the free season ends, or on redemption if
    -- that's later: everyone is free until then, gift holders included.
    v_start := case when v_opens is null then null else greatest(g.redeemed_at, private.free_season_ends_at()) end;
    if v_start is not null then
      v_order := private.grant_order('gift', g.redeemed_at, e.id);
      -- Queue behind earlier time-limited grants of the same kind. The free
      -- season isn't one: a gift year never waits for it.
      select max(o.current_period_end) into v_queue
      from public.entitlements o
      left join public.gift_purchases og on og.id = o.gift_purchase_id
      where o.user_id = e.user_id
        and o.id <> e.id
        and o.source <> 'free_season'
        and o.starts_at is not null
        and o.current_period_end is not null
        and o.current_period_end > v_start
        and ((e.plan = 'app_premium') = (o.plan = 'app_premium'))
        and private.grant_order(o.source, og.redeemed_at, o.id) < v_order;
      v_start := greatest(v_start, v_queue);
    end if;
  end if;

  -- Lengths are counted on the Flock's calendar (Eastern), so a six-month gift
  -- from midnight Jul 6 ends at midnight Jan 6, not an hour early across the
  -- daylight-saving change.
  v_end := ((v_start at time zone 'America/New_York') + v_len) at time zone 'America/New_York';
  if v_start is not null and e.plan = 'app_premium' then
    -- Days Flock already covers don't count against the premium year. The
    -- free season doesn't stretch a premium gift either.
    for i in 1..8 loop
      select coalesce(sum(greatest(interval '0', least(v_end, f.current_period_end) - greatest(v_start, f.starts_at))), interval '0')
      into v_overlap
      from public.entitlements f
      where f.user_id = e.user_id
        and f.id <> e.id
        and f.source <> 'free_season'
        and f.plan <> 'app_premium'
        and f.starts_at is not null
        and f.current_period_end is not null;
      v_next := ((v_start at time zone 'America/New_York') + v_len) at time zone 'America/New_York' + v_overlap;
      exit when v_next = v_end;
      v_end := v_next;
    end loop;
  end if;

  update public.entitlements
  set starts_at          = v_start,
      current_period_end = v_end,
      status             = 'active'
  where id = e.id;
end;
$$;

revoke all on function private.place_grant(uuid) from public, anon, authenticated;
grant execute on function private.place_grant(uuid) to service_role;
