-- The Flock, step 1 (access): founders and gift recipients get real
-- entitlements, scheduled from the day the Flock opens. Additive only.
--
-- What it adds:
--   1. flock_settings.flock_opens_at: when the Flock opens to members. Unset
--      until an admin sets it (admin_set_flock_opens_at). Admin-only, like the
--      kill switch.
--   2. admin_set_flock_ui's privileged part moves to private.set_flock_ui
--      behind a SECURITY INVOKER public wrapper, like admin_grant_entitlement
--      (clears the advisor's "signed-in users can execute SECURITY DEFINER").
--   3. entitlements gains starts_at (access begins), free_until (founding free
--      months end; the payments step bills $15 from here), and the claim or
--      gift it came from. Two new sources: 'founding' and 'gift'.
--   4. A founding claim grants plan 'founding'; a redeemed gift grants
--      'annual' (flock_year) or 'app_premium' (app_premium_year); a refund ends
--      the gift's entitlement. Existing claims and redeemed gifts are backfilled.
--   5. is_flock_member / has_app_premium also require the entitlement to have
--      started. Their signatures and grants don't change.
--   6. admin_founding_entitlements() / admin_gift_entitlements() for the admin
--      pages.
-- No care-app table, policy, trigger or function changes. The tables touched
-- (flock_settings, entitlements, founding_claims, gift_purchases) are Flock
-- and gift tables; the care app never reads them.
--
-- When access runs (all times UTC, timestamptz):
--   Founding  starts at flock_opens_at; six free months (free_until =
--             current_period_end = flock_opens_at + 6 months), status
--             'trialing'. Until flock_opens_at is set the row exists with no
--             start and grants nothing.
--   Gift      one year, starting at the LATER of redemption and
--             flock_opens_at, pushed back further by stacking (below). No
--             start until flock_opens_at is set.
--
-- Overlaps never take time away (stack or extend, never shorten):
--   * A Flock gift's year starts at the latest of redemption, flock_opens_at,
--     and the end of every earlier time-limited Flock grant the person holds
--     (founding free months, earlier Flock gifts, a paid period, a dated
--     comp). Flock years queue end to end, in redemption order.
--   * An app premium gift's year starts at the latest of redemption,
--     flock_opens_at, and the end of earlier time-limited premium-only grants.
--     Flock includes premium, so days already covered by Flock don't count:
--     its end moves out by any overlap with time-limited Flock grants, even
--     if the premium year was already running when the Flock time arrived.
--   * Open-ended grants (comp with no end date, chapter lead) don't push
--     anything back: there's no end to queue behind, and the gift keeps its
--     full year alongside.
--
-- Once a grant has started, its start is fixed. Changing flock_opens_at (or a
-- refund) reschedules only grants that haven't started, plus premium gifts'
-- ends.


-- 1) When the Flock opens ---------------------------------------------------

alter table public.flock_settings
  add column if not exists flock_opens_at timestamptz;


-- 2) Entitlements: start, free period, origin -----------------------------------

alter table public.entitlements
  add column if not exists starts_at         timestamptz,
  add column if not exists free_until        timestamptz,
  add column if not exists founding_claim_id uuid references public.founding_claims (id) on delete set null,
  add column if not exists gift_purchase_id  uuid references public.gift_purchases (id) on delete set null;

-- Rows from before this migration (manual, and any future store rows) started
-- when they were created. New rows start now unless they say otherwise;
-- founding and gift rows are written with an explicit (possibly null) start.
update public.entitlements set starts_at = created_at where starts_at is null and source not in ('founding', 'gift');
alter table public.entitlements alter column starts_at set default now();

comment on column public.entitlements.starts_at is
  'When access begins. NULL = not scheduled yet (founding and gift grants before flock_opens_at is set): grants nothing.';
comment on column public.entitlements.free_until is
  'Founding only: end of the six free months (flock_opens_at + 6 months). The payments step starts $15/month billing from here. FOUNDING PRICE: if a founding membership is cancelled, the founding price does not come back (a later return pays the regular price).';

-- Widen the source check to the two new origins (a superset of the old list).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.entitlements'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%source%'
  loop
    execute format('alter table public.entitlements drop constraint %I', c);
  end loop;
end $$;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('stripe', 'apple', 'google', 'manual', 'founding', 'gift'));

create unique index if not exists entitlements_one_per_founding_claim
  on public.entitlements (founding_claim_id) where founding_claim_id is not null;
create unique index if not exists entitlements_one_per_gift
  on public.entitlements (gift_purchase_id) where gift_purchase_id is not null;
create index if not exists entitlements_user_source_idx on public.entitlements (user_id, source);


-- 3) Access: in good standing AND started -------------------------------------

create or replace function private.entitlement_grants_now(
  p_starts_at timestamptz, p_status text, p_period_end timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_starts_at is not null
     and p_starts_at <= now()
     and (
       (p_status in ('active', 'trialing') and (p_period_end is null or p_period_end > now()))
       or (p_status in ('past_due', 'canceled') and p_period_end > now())
     );
$$;

revoke all on function private.entitlement_grants_now(timestamptz, text, timestamptz) from public, anon;
grant execute on function private.entitlement_grants_now(timestamptz, text, timestamptz) to authenticated, service_role;

create or replace function private.is_flock_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and e.plan <> 'app_premium'
      and private.entitlement_grants_now(e.starts_at, e.status, e.current_period_end)
  );
$$;

create or replace function private.has_app_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and private.entitlement_grants_now(e.starts_at, e.status, e.current_period_end)
  );
$$;


-- 4) Settings: kill switch and opening day, privileged parts in private -------

create or replace function private.set_flock_ui(p_enabled boolean)
returns public.flock_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.flock_settings;
begin
  if p_enabled is null then
    raise exception 'p_enabled must be true or false' using errcode = '22004';
  end if;
  perform private.assert_entitlement_admin();
  insert into public.flock_settings (id, ui_enabled, updated_at, updated_by)
  values (true, p_enabled, now(), auth.uid())
  on conflict (id) do update
    set ui_enabled = excluded.ui_enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function private.set_flock_ui(boolean) from public, anon;
grant execute on function private.set_flock_ui(boolean) to authenticated, service_role;

-- Same signature, return type and grants; now SECURITY INVOKER.
create or replace function public.admin_set_flock_ui(p_enabled boolean)
returns public.flock_settings
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.set_flock_ui(p_enabled);
$$;

revoke all on function public.admin_set_flock_ui(boolean) from public, anon;
grant execute on function public.admin_set_flock_ui(boolean) to authenticated, service_role;

create or replace function private.flock_opens_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select flock_opens_at from public.flock_settings where id;
$$;

revoke all on function private.flock_opens_at() from public, anon, authenticated;
grant execute on function private.flock_opens_at() to service_role;


-- 5) Scheduling ----------------------------------------------------------------

-- Order among one person's grants: non-gift grants (founding, paid, manual)
-- come first; gifts follow in redemption order.
create or replace function private.grant_order(p_source text, p_redeemed_at timestamptz, p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_source = 'gift'
    then '1|' || to_char(coalesce(p_redeemed_at, 'infinity'::timestamptz) at time zone 'UTC', 'YYYYMMDDHH24MISSUS') || '|' || p_id::text
    else '0|' || p_id::text end;
$$;

revoke all on function private.grant_order(text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function private.grant_order(text, timestamptz, uuid) to service_role;

-- Work out one founding or gift grant's dates.
--   Founding: starts at flock_opens_at, six free months.
--   Flock gift (plan annual): a year starting at the latest of redemption,
--     flock_opens_at and the end of every earlier time-limited Flock grant.
--   App premium gift: a year starting at the latest of redemption,
--     flock_opens_at and the end of every earlier time-limited app-premium-only
--     grant; it counts only days NOT already covered by Flock (which includes
--     premium), so its end moves out by any overlap with time-limited Flock
--     grants. Open-ended grants (comp with no end, chapter lead) don't move
--     anything: there's no end to queue behind.
-- A grant that has started keeps its start; only a premium gift's end can
-- still move (out when Flock time overlaps it, back if that Flock time goes).
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
begin
  select * into e from public.entitlements where id = p_entitlement_id for update;
  if e.id is null or e.source not in ('founding', 'gift') or e.status = 'canceled' then return; end if;
  v_started := e.starts_at is not null and e.starts_at <= now();

  if e.source = 'founding' then
    if v_started then return; end if;
    update public.entitlements
    set starts_at          = v_opens,
        free_until         = v_opens + interval '6 months',
        current_period_end = v_opens + interval '6 months',
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

-- Re-place one person's (or everyone's) founding and gift grants in order:
-- every one that hasn't started, plus running premium gifts (their end can
-- move with Flock time). Flock grants go first so premium sees their dates.
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
  return n;
end;
$$;

revoke all on function private.reschedule_pending_grants(uuid) from public, anon, authenticated;
grant execute on function private.reschedule_pending_grants(uuid) to service_role;

-- Opening day. Admin-only; NULL unsets it. Reschedules every grant that
-- hasn't started yet.
create or replace function private.set_flock_opens_at(p_opens_at timestamptz)
returns public.flock_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.flock_settings;
begin
  perform private.assert_entitlement_admin();
  insert into public.flock_settings (id, flock_opens_at, updated_at, updated_by)
  values (true, p_opens_at, now(), auth.uid())
  on conflict (id) do update
    set flock_opens_at = excluded.flock_opens_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into v_row;
  perform private.reschedule_pending_grants(null);
  return v_row;
end;
$$;

revoke all on function private.set_flock_opens_at(timestamptz) from public, anon;
grant execute on function private.set_flock_opens_at(timestamptz) to authenticated, service_role;

create or replace function public.admin_set_flock_opens_at(p_opens_at timestamptz)
returns public.flock_settings
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.set_flock_opens_at(p_opens_at);
$$;

revoke all on function public.admin_set_flock_opens_at(timestamptz) from public, anon;
grant execute on function public.admin_set_flock_opens_at(timestamptz) to authenticated, service_role;


-- 6) Grants from claims and gifts (server-side only) ---------------------------

create or replace function private.grant_founding(p_claim_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c    public.founding_claims;
  v_id uuid;
begin
  select * into c from public.founding_claims where id = p_claim_id;
  if c.id is null then return; end if;
  insert into public.entitlements (user_id, plan, status, source, founding_claim_id, starts_at, current_period_end, note)
  values (c.user_id, 'founding', 'trialing', 'founding', c.id, null, null, 'Founding 50, spot ' || c.spot_number)
  on conflict (founding_claim_id) where founding_claim_id is not null do nothing
  returning id into v_id;
  if v_id is not null then
    perform private.reschedule_pending_grants(c.user_id);
  end if;
end;
$$;

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
    case g.plan when 'flock_year' then 'annual' else 'app_premium' end,
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

-- A refunded gift ends its access now (or never starts it), and anything
-- queued behind it moves up.
create or replace function private.end_gift(p_gift_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  update public.entitlements
  set status = 'canceled',
      current_period_end = least(coalesce(current_period_end, now()), now())
  where gift_purchase_id = p_gift_id and status <> 'canceled'
  returning user_id into v_user;
  if v_user is not null then
    perform private.reschedule_pending_grants(v_user);
  end if;
end;
$$;

revoke all on function private.grant_founding(uuid) from public, anon, authenticated;
revoke all on function private.grant_gift(uuid) from public, anon, authenticated;
revoke all on function private.end_gift(uuid) from public, anon, authenticated;
grant execute on function private.grant_founding(uuid) to service_role;
grant execute on function private.grant_gift(uuid) to service_role;
grant execute on function private.end_gift(uuid) to service_role;

create or replace function private.founding_claims_grant_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.grant_founding(new.id);
  return null;
end;
$$;

create or replace function private.gift_purchases_grant_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.gift_grants_membership(new.status) and not private.gift_grants_membership(old.status) then
    perform private.grant_gift(new.id);
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    perform private.end_gift(new.id);
  end if;
  return null;
end;
$$;

revoke all on function private.founding_claims_grant_trigger() from public, anon, authenticated;
revoke all on function private.gift_purchases_grant_trigger() from public, anon, authenticated;

drop trigger if exists founding_claims_grant on public.founding_claims;
create trigger founding_claims_grant
  after insert on public.founding_claims
  for each row execute function private.founding_claims_grant_trigger();

drop trigger if exists gift_purchases_grant on public.gift_purchases;
create trigger gift_purchases_grant
  after update of status on public.gift_purchases
  for each row execute function private.gift_purchases_grant_trigger();

-- Backfill: every existing claim, every redeemed gift.
do $$
declare r record;
begin
  for r in select id from public.founding_claims loop
    perform private.grant_founding(r.id);
  end loop;
  for r in select id from public.gift_purchases where private.gift_grants_membership(status) order by redeemed_at loop
    perform private.grant_gift(r.id);
  end loop;
end $$;


-- 7) Admin views -------------------------------------------------------------------

create or replace function private.founding_entitlements_admin()
returns table (spot_number smallint, entitlement_id uuid, status text, starts_at timestamptz, free_until timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  return query
    select c.spot_number, e.id, e.status, e.starts_at, e.free_until, e.current_period_end
    from public.founding_claims c
    left join public.entitlements e on e.founding_claim_id = c.id
    order by c.spot_number;
end;
$$;

create or replace function private.gift_entitlements_admin()
returns table (gift_id uuid, entitlement_id uuid, plan text, status text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  return query
    select g.id, e.id, e.plan, e.status, e.starts_at, e.current_period_end
    from public.gift_purchases g
    join public.entitlements e on e.gift_purchase_id = g.id;
end;
$$;

revoke all on function private.founding_entitlements_admin() from public, anon;
revoke all on function private.gift_entitlements_admin() from public, anon;
grant execute on function private.founding_entitlements_admin() to authenticated, service_role;
grant execute on function private.gift_entitlements_admin() to authenticated, service_role;

create or replace function public.admin_founding_entitlements()
returns table (spot_number smallint, entitlement_id uuid, status text, starts_at timestamptz, free_until timestamptz, ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.founding_entitlements_admin();
$$;

create or replace function public.admin_gift_entitlements()
returns table (gift_id uuid, entitlement_id uuid, plan text, status text, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.gift_entitlements_admin();
$$;

revoke all on function public.admin_founding_entitlements() from public, anon;
revoke all on function public.admin_gift_entitlements() from public, anon;
grant execute on function public.admin_founding_entitlements() to authenticated, service_role;
grant execute on function public.admin_gift_entitlements() to authenticated, service_role;
