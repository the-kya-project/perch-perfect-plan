-- Gifts: a gift year starts when the free season ends (payments plan, build
-- item F).
--
-- Before: a redeemed Flock gift year started on the later of redemption and
-- opening day (Jan 4, 2027), so most of it overlapped the free season everyone
-- gets anyway. Now it starts on the later of redemption and the free season's
-- end (flock_settings.free_season_ends_at, Tue, Jul 6, 2027 00:00 Eastern),
-- and runs a full year from there. A recipient who redeems before Jul 6 is
-- free through the free season like everyone else (Join the Flock), and their
-- gift year follows it.
--
-- Unchanged: no start until opening day is set (a gift grants nothing before
-- the Flock opens); only status = 'redeemed' grants; gift years queue end to
-- end; a gift row that has started keeps its dates. Moving the free season's
-- end (admin_set_free_season_ends_at) or opening day re-places every gift row
-- that hasn't started, through reschedule_pending_grants, the same way it
-- already moves founding and free-season rows.
--
-- Existing gifts: production has one gift record, a refunded app premium gift
-- (Nov 6, 2026) with no entitlement row. Nothing is moved.
--
-- Only private.place_grant changes, and only the gift start line; the rest is
-- the 20261120120000_flock_free_season_join.sql version. Flock-only: no
-- care-app table, policy, trigger or function changes. Pinned by
-- supabase/checks/flock_gift_year_checks.sql and
-- supabase/checks/flock_entitlement_grants_checks.sql.

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

  v_end := v_start + interval '1 year';
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
      v_next := v_start + interval '1 year' + v_overlap;
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

-- Re-place gift rows that haven't started (none on production today).
select private.reschedule_pending_grants();
