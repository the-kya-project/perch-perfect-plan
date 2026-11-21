-- The Flock, payments plan build item B (the rest): "Join the Flock" and the
-- free-season end date's admin setter.
--
-- Approved by Brittany on Nov 19, 2026, in that prompt: one new allowed value
-- for entitlements.source, 'free_season', with these conditions:
--   1. A free-season row is never a trial. It's status 'active' with a fixed
--      end (the free season's end), never 'trialing', so no billing code (the
--      planned Stripe rows use 'trialing' for a real trial that converts) can
--      mistake it for one. It never converts, never charges and has no
--      countdown of its own. entitlements_free_season_shape enforces that.
--   2. Gift holders can join, and their gift row is never changed: free-season
--      rows are left out of place_grant's queueing and premium-overlap sums.
--   3. Chapter leads (and founders) already have a membership: flock_join()
--      does nothing for them and creates no row.
--   4. When the free season ends, a free-season row stops granting Flock
--      access (and with it Flock journeys; app premium itself was removed in
--      20261119170000); founders' and gift holders' rows follow their own dates.
--
-- Changes to existing objects (all Flock-only; nothing the care app uses):
--   - entitlements_source_check gains 'free_season' (widened; every existing
--     row still passes).
--   - entitlements gains entitlements_free_season_shape (applies only to
--     free_season rows, of which there are none yet) and a one-per-person
--     unique index on free_season rows.
--   - private.place_grant: free_season rows are left out of the gift queue and
--     the premium overlap. The founding branch is unchanged.
--   - private.reschedule_pending_grants: also re-dates free_season rows.
-- New: private.place_free_season, private.join_flock / public.flock_join,
-- private.set_free_season_ends_at / public.admin_set_free_season_ends_at.
--
-- The stored free-season end (Tue, Jul 6, 2027 00:00 America/New_York) is not
-- changed here. Pinned by supabase/checks/flock_free_season_checks.sql.


-- 1) The new source value, and what a free-season row may look like ---------------

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.entitlements'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%source%'
      and conname <> 'entitlements_free_season_shape'
  loop
    execute format('alter table public.entitlements drop constraint %I', c);
  end loop;
end $$;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('stripe', 'apple', 'google', 'manual', 'founding', 'gift', 'chapter_lead', 'free_season'));

-- Never a trial, never billable: a comp with no provider reference, no
-- founding or gift link, and no free_until (that's founding's billing start).
alter table public.entitlements drop constraint if exists entitlements_free_season_shape;
alter table public.entitlements
  add constraint entitlements_free_season_shape
  check (source <> 'free_season' or (
    plan = 'comp' and status = 'active' and external_ref is null and free_until is null
    and founding_claim_id is null and gift_purchase_id is null
  ));

create unique index if not exists entitlements_one_free_season_per_user
  on public.entitlements (user_id) where source = 'free_season';

comment on constraint entitlements_free_season_shape on public.entitlements is
  'A free-season row (Join the Flock) is always plan comp, status active, with no external_ref, free_until, founding claim or gift: it never converts, never charges and is never a trial. Its end is flock_settings.free_season_ends_at.';


-- 2) Dates for a free-season row ------------------------------------------------------

-- Starts on opening day (no start, so no access, until opening day is set;
-- a row that has started keeps its start). Ends when the free season ends.
create or replace function private.place_free_season(p_entitlement_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.entitlements;
  v_opens timestamptz := private.flock_opens_at();
begin
  select * into e from public.entitlements where id = p_entitlement_id for update;
  if e.id is null or e.source <> 'free_season' then return; end if;
  update public.entitlements
  -- A row keeps its start only once it has really started (opening day has
  -- passed). Anything else, including a start before opening day, moves to
  -- opening day, so a free-season row never grants access before the Flock opens.
  set starts_at = case
        when v_opens is not null and v_opens <= now() and e.starts_at is not null and e.starts_at <= now()
             and e.starts_at >= v_opens then e.starts_at
        else v_opens end,
      current_period_end = private.free_season_ends_at()
  where id = e.id;
end;
$$;

revoke all on function private.place_free_season(uuid) from public, anon, authenticated;
grant execute on function private.place_free_season(uuid) to service_role;


-- 3) Gifts never move for a free-season row --------------------------------------------

-- Same function as 20261119150000_founding_free_season_end.sql, except that the
-- gift queue and the premium overlap leave out source = 'free_season'.
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

-- Same as 20261107120000, plus every free-season row (started or not: the end
-- is the same date for everyone and follows the setting).
create or replace function private.reschedule_pending_grants(p_user_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select e.id
    from public.entitlements e
    left join public.gift_purchases g on g.id = e.gift_purchase_id
    where e.source in ('founding', 'gift')
      and e.status <> 'canceled'
      and (e.starts_at is null or e.starts_at > now() or e.plan = 'app_premium')
      and (p_user_id is null or e.user_id = p_user_id)
    order by e.user_id, (e.plan = 'app_premium'), private.grant_order(e.source, g.redeemed_at, e.id)
  loop
    perform private.place_grant(r.id);
    n := n + 1;
  end loop;
  for r in
    select e.id from public.entitlements e
    where e.source = 'free_season' and (p_user_id is null or e.user_id = p_user_id)
  loop
    perform private.place_free_season(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function private.reschedule_pending_grants(uuid) from public, anon, authenticated;
grant execute on function private.reschedule_pending_grants(uuid) to service_role;


-- 4) Join the Flock ----------------------------------------------------------------------

-- What happened: 'joined' (a new free-season row), 'already_joined' (theirs is
-- returned, unchanged), 'founder' or 'chapter_lead' (they already have a
-- membership; nothing is created). Refused (nothing created) when the caller
-- is signed out or doesn't pass the Flock gate (42501), opening day isn't set
-- ('not_open', 55000), or the free season is over ('season_over', 55000).
create or replace function private.join_flock()
returns table (result text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
  v_end  timestamptz := private.free_season_ends_at();
  e      public.entitlements;
begin
  if v_user is null then raise exception 'sign in first' using errcode = '42501'; end if;
  -- The gate decides who may join. Today that's admins only, so no one else can.
  if not coalesce(public.flock_enabled(), false) then
    raise exception 'the Flock isn''t open to you yet' using errcode = '42501';
  end if;
  if private.flock_opens_at() is null then raise exception 'not_open' using errcode = '55000'; end if;
  if v_end is null or now() >= v_end then raise exception 'season_over' using errcode = '55000'; end if;

  if exists (select 1 from public.founding_claims c where c.user_id = v_user) then
    return query select 'founder'::text, null::timestamptz, null::timestamptz; return;
  end if;
  if exists (select 1 from public.flock_chapter_leads l where l.user_id = v_user)
     or exists (select 1 from public.entitlements x where x.user_id = v_user and x.source = 'chapter_lead') then
    return query select 'chapter_lead'::text, null::timestamptz, null::timestamptz; return;
  end if;

  select * into e from public.entitlements x where x.user_id = v_user and x.source = 'free_season';
  if e.id is not null then
    return query select 'already_joined'::text, e.starts_at, e.current_period_end; return;
  end if;

  -- starts_at is given explicitly: the column defaults to now(), which would
  -- start access the moment someone joins, before opening day.
  insert into public.entitlements (user_id, plan, status, source, note, starts_at, current_period_end)
  values (v_user, 'comp', 'active', 'free_season', 'Joined the Flock: free season', private.flock_opens_at(), v_end)
  on conflict (user_id) where source = 'free_season' do nothing
  returning id into v_id;
  if v_id is null then
    select * into e from public.entitlements x where x.user_id = v_user and x.source = 'free_season';
    return query select 'already_joined'::text, e.starts_at, e.current_period_end; return;
  end if;
  perform private.place_free_season(v_id);
  select * into e from public.entitlements x where x.id = v_id;
  return query select 'joined'::text, e.starts_at, e.current_period_end;
end;
$$;

revoke all on function private.join_flock() from public, anon;
grant execute on function private.join_flock() to authenticated, service_role;

create or replace function public.flock_join()
returns table (result text, starts_at timestamptz, ends_at timestamptz)
language sql
volatile
security invoker
set search_path = ''
as $$ select * from private.join_flock(); $$;

revoke all on function public.flock_join() from public, anon;
grant execute on function public.flock_join() to authenticated, service_role;


-- 5) The free season's end: admin setter ----------------------------------------------------

-- Admin-only. Moves every free-season row's end, and the dates of founding
-- and gift grants that haven't started. Refused once opening day has passed:
-- founders' rows have started by then and keep their dates, so a later move
-- would split the season in two. (Billing will also start on this date.)
create or replace function private.set_free_season_ends_at(p_ends_at timestamptz)
returns public.flock_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.flock_settings;
  v_opens timestamptz := private.flock_opens_at();
begin
  perform private.assert_entitlement_admin();
  if p_ends_at is null then raise exception 'the free season needs an end date' using errcode = '22004'; end if;
  if v_opens is not null and p_ends_at <= v_opens then
    raise exception 'the free season must end after opening day' using errcode = '22023';
  end if;
  if v_opens is not null and v_opens <= now() then
    raise exception 'the Flock has opened; the free season''s end can no longer move' using errcode = '55000';
  end if;
  update public.flock_settings
  set free_season_ends_at = p_ends_at, updated_at = now(), updated_by = auth.uid()
  where id
  returning * into v_row;
  perform private.reschedule_pending_grants(null);
  return v_row;
end;
$$;

revoke all on function private.set_free_season_ends_at(timestamptz) from public, anon;
grant execute on function private.set_free_season_ends_at(timestamptz) to authenticated, service_role;

create or replace function public.admin_set_free_season_ends_at(p_ends_at timestamptz)
returns public.flock_settings
language sql
volatile
security invoker
set search_path = ''
as $$ select * from private.set_free_season_ends_at(p_ends_at); $$;

revoke all on function public.admin_set_free_season_ends_at(timestamptz) from public, anon;
grant execute on function public.admin_set_free_season_ends_at(timestamptz) to authenticated, service_role;
