-- Founding 50: the free months end on the free season's end, Tuesday,
-- July 6, 2027 (00:00 Eastern), instead of six months after opening day.
--
-- Decided Nov 18, 2026 (docs/flock/payments-plan.md): the Flock opens Monday,
-- Jan 4, 2027 and is free for everyone until Tuesday, Jul 6, 2027. Six months
-- from Jan 4 would be Sunday, Jul 4, so founders' `free_until` would have read
-- "Jul 4" on their profile while every screen says July 6. This stores the
-- one date and has place_grant() use it.
--
-- Additive except for one existing Flock function:
--   - flock_settings gains free_season_ends_at (new column, default and
--     backfill 2027-07-06 00:00 America/New_York).
--   - private.free_season_ends_at() reads it (new).
--   - private.place_grant() changes only its founding branch:
--     free_until = current_period_end = free_season_ends_at() once opening day
--     is set (still NULL before). The gift branch is unchanged (that's PR F).
-- No care-app table, policy, trigger or function changes.
--
-- Changing the date later is PR B's admin function; until then, an UPDATE of
-- flock_settings.free_season_ends_at followed by
-- select private.reschedule_pending_grants(); does it.
--
-- Pinned by supabase/checks/founding_deadline_checks.sql (free season block)
-- and supabase/checks/flock_entitlement_grants_checks.sql.

alter table public.flock_settings
  add column if not exists free_season_ends_at timestamptz
    default (timestamp '2027-07-06 00:00:00' at time zone 'America/New_York');

update public.flock_settings
set free_season_ends_at = timestamp '2027-07-06 00:00:00' at time zone 'America/New_York'
where free_season_ends_at is null;

comment on column public.flock_settings.free_season_ends_at is
  'The end of the free season for everyone, founders included: 2027-07-06 00:00 America/New_York (Tue, Jul 6, 2027). Founders'' free_until comes from here (place_grant).';

create or replace function private.free_season_ends_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select free_season_ends_at from public.flock_settings where id;
$$;

revoke all on function private.free_season_ends_at() from public, anon, authenticated;
grant execute on function private.free_season_ends_at() to service_role;

comment on column public.entitlements.free_until is
  'Founding only: the end of the free season (flock_settings.free_season_ends_at, Jul 6, 2027), set once opening day is. Billing at the founding price starts here. FOUNDING PRICE: if a founding membership ends, the founding price does not come back (a later return pays the regular price).';

-- Same function as 20261107120000_flock_entitlement_grants.sql; only the
-- founding branch's two dates change.
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
    v_start := case when v_opens is null then null else greatest(g.redeemed_at, v_opens) end;
    if v_start is not null then
      v_order := private.grant_order('gift', g.redeemed_at, e.id);
      -- Queue behind earlier time-limited grants of the same kind.
      select max(o.current_period_end) into v_queue
      from public.entitlements o
      left join public.gift_purchases og on og.id = o.gift_purchase_id
      where o.user_id = e.user_id
        and o.id <> e.id
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
    -- Days Flock already covers don't count against the premium year.
    for i in 1..8 loop
      select coalesce(sum(greatest(interval '0', least(v_end, f.current_period_end) - greatest(v_start, f.starts_at))), interval '0')
      into v_overlap
      from public.entitlements f
      where f.user_id = e.user_id
        and f.id <> e.id
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

-- Re-place grants that haven't started, so any already scheduled pick up the
-- new end. (On production today opening day isn't set, so nothing moves.)
select private.reschedule_pending_grants();
