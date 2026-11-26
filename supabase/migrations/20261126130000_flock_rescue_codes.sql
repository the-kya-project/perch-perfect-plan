-- Backlog 1.16: rescue partner codes.
--
-- A partner rescue hands its one reusable code (for example BIRDSANDBEAKS) to
-- new adopters. An adopter enters it, tells us the bird's name, species and
-- adoption date, and an admin confirms it. A confirmed adoption gives six
-- months in the Flock, free: from the free season's end, or from the moment
-- it's approved if the free season has already ended.
--
-- Rules (Brittany, docs/flock/specs/feature-specs.md "Rescue partner codes"):
--   * One reusable code per rescue, with an optional limit on uses. No rescue
--     login and no rescue dashboard.
--   * One redemption per account. A declined one doesn't use it up (the
--     adopter can try again, say after a typo); a waiting or approved one does.
--   * Never combined with a founding spot: someone with a founding claim that
--     hasn't been forfeited can't use a rescue code, and an approval is
--     refused if they've claimed one since.
--   * No payment, ever: the membership is an entitlement with source 'rescue',
--     plan 'comp', no provider reference and no free_until (the column billing
--     reads as a billing start); entitlements_rescue_shape holds it to that.
--   * Seats aren't counted (Brittany, Nov 23, 2026). Nothing here reads or
--     writes anything about Kya's Crew.
--   * Behind the Flock gate: every adopter function needs flock_enabled()
--     (admins only until the members switch is on); the admin functions need
--     an admin.
--
-- Additive: two new tables, a third for rate limiting, new functions.
-- Changes to existing objects, all Flock-only:
--   * entitlements_source_check gains 'rescue' (widened; every existing row
--     still passes), plus a new check, entitlements_rescue_shape, that only
--     constrains 'rescue' rows.
--   * private.reschedule_pending_grants: rewritten from its live definition
--     (20261120120000) with one more loop that places rescue rows first, so
--     moving opening day or the free season's end moves a rescue membership
--     that hasn't started, and gifts queue behind it. The founding/gift and
--     free-season loops are unchanged. private.place_grant is not changed.
-- No care-app table, policy, trigger or function changes.
-- Pinned by supabase/checks/flock_rescue_codes_checks.sql.


-- 1) Tables -------------------------------------------------------------------------------

create table if not exists public.rescue_partners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  -- Stored in capitals, letters and digits only (private.rescue_code_clean).
  code        text not null unique check (code ~ '^[A-Z0-9]{4,30}$'),
  -- Null = no limit. Counts redemptions waiting or approved.
  use_limit   integer check (use_limit is null or use_limit between 1 and 100000),
  paused      boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.rescue_partners enable row level security;
revoke all on public.rescue_partners from anon, authenticated;
grant select, insert, update, delete on public.rescue_partners to service_role;
drop policy if exists "rescue_partners no direct access" on public.rescue_partners;
create policy "rescue_partners no direct access" on public.rescue_partners for select to authenticated using (false);

create table if not exists public.rescue_redemptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- A partner with redemptions can't be deleted (there's no delete; pause it).
  partner_id      uuid not null references public.rescue_partners(id) on delete restrict,
  bird_name       text not null check (length(btrim(bird_name)) between 1 and 60),
  species         text not null check (length(btrim(species)) between 1 and 80),
  adopted_on      date not null,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  -- The membership an approval created.
  entitlement_id  uuid references public.entitlements(id) on delete set null,
  -- When the adopter saw the welcome (approved) or the decline note.
  seen_at         timestamptz,
  created_at      timestamptz not null default now()
);
-- One redemption per account: at most one waiting or approved.
create unique index if not exists rescue_redemptions_one_per_account
  on public.rescue_redemptions (user_id) where status in ('pending', 'approved');
create index if not exists rescue_redemptions_pending_idx
  on public.rescue_redemptions (created_at) where status = 'pending';
create index if not exists rescue_redemptions_partner_idx
  on public.rescue_redemptions (partner_id, status);

alter table public.rescue_redemptions enable row level security;
revoke all on public.rescue_redemptions from anon, authenticated;
grant select, insert, update, delete on public.rescue_redemptions to service_role;
drop policy if exists "rescue_redemptions no direct access" on public.rescue_redemptions;
create policy "rescue_redemptions no direct access" on public.rescue_redemptions for select to authenticated using (false);

-- Wrong codes, for the hourly limit (codes are meant to be shared, so this
-- only slows guessing). Old rows are cleared as new ones arrive.
create table if not exists public.rescue_code_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists rescue_code_attempts_user_idx on public.rescue_code_attempts (user_id, created_at);
alter table public.rescue_code_attempts enable row level security;
revoke all on public.rescue_code_attempts from anon, authenticated;
grant select, insert, delete on public.rescue_code_attempts to service_role;
drop policy if exists "rescue_code_attempts no direct access" on public.rescue_code_attempts;
create policy "rescue_code_attempts no direct access" on public.rescue_code_attempts for select to authenticated using (false);


-- 2) Entitlements: the 'rescue' source -------------------------------------------------------

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.entitlements'::regclass and contype = 'c'
      and conname = 'entitlements_source_check'
  loop
    execute format('alter table public.entitlements drop constraint %I', c);
  end loop;
end $$;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('stripe', 'apple', 'google', 'manual', 'founding', 'gift', 'chapter_lead', 'free_season', 'rescue'));

-- Free and never billable: a comp with no provider reference, no founding or
-- gift link, and no free_until (billing's start date).
alter table public.entitlements drop constraint if exists entitlements_rescue_shape;
alter table public.entitlements
  add constraint entitlements_rescue_shape
  check (source <> 'rescue' or (
    plan = 'comp' and status in ('active', 'canceled') and external_ref is null and free_until is null
    and founding_claim_id is null and gift_purchase_id is null
  ));


-- 3) Helpers ----------------------------------------------------------------------------

-- How long a confirmed adoption lasts, and the hourly limit on wrong codes.
create or replace function private.rescue_months() returns integer
language sql immutable set search_path = '' as $$ select 6 $$;

create or replace function private.rescue_attempt_limit() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;

-- Capitals, letters and digits only: "birds and beaks" and "BIRDS-AND-BEAKS"
-- are both BIRDSANDBEAKS.
create or replace function private.rescue_code_clean(p_code text) returns text
language sql immutable set search_path = ''
as $$ select nullif(regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'), '') $$;

-- Redemptions that count against a code's limit.
create or replace function private.rescue_uses(p_partner uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.rescue_redemptions r
  where r.partner_id = p_partner and r.status in ('pending', 'approved');
$$;

-- A founding spot that's still theirs.
create or replace function private.rescue_has_founding(p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.founding_claims c where c.user_id = p_user and c.forfeited_at is null);
$$;

-- The adopter functions: signed in and through the Flock gate.
create or replace function private.assert_rescue_open() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not coalesce(public.flock_enabled(), false) then
    raise exception 'the Flock isn''t open to you yet' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

-- Finds a usable code. Returns the partner's id and name, or a reason it
-- can't be used: 'founder', 'already_redeemed', 'rate_limited', 'invalid'.
-- Wrong, paused and full codes all answer 'invalid', so a guess can't tell a
-- paused code from none. It returns rather than raises so a wrong guess is
-- recorded for the hourly limit.
create or replace function private.rescue_find_code(p_user uuid, p_code text, p_lock boolean,
  out partner_id uuid, out partner_name text, out reason text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  p public.rescue_partners;
  v_code text := private.rescue_code_clean(p_code);
begin
  if private.rescue_has_founding(p_user) then
    reason := 'founder'; return;
  end if;
  if exists (select 1 from public.rescue_redemptions r where r.user_id = p_user and r.status in ('pending', 'approved')) then
    reason := 'already_redeemed'; return;
  end if;
  delete from public.rescue_code_attempts a where a.user_id = p_user and a.created_at < now() - interval '1 hour';
  if (select count(*) from public.rescue_code_attempts a where a.user_id = p_user) >= private.rescue_attempt_limit() then
    reason := 'rate_limited'; return;
  end if;
  if p_lock then
    select * into p from public.rescue_partners x where x.code = v_code for update;
  else
    select * into p from public.rescue_partners x where x.code = v_code;
  end if;
  if p.id is null or p.paused or (p.use_limit is not null and private.rescue_uses(p.id) >= p.use_limit) then
    insert into public.rescue_code_attempts (user_id) values (p_user);
    reason := 'invalid'; return;
  end if;
  partner_id := p.id;
  partner_name := p.name;
end;
$$;

revoke all on function private.rescue_months() from public, anon;
revoke all on function private.rescue_attempt_limit() from public, anon;
revoke all on function private.rescue_code_clean(text) from public, anon;
revoke all on function private.rescue_uses(uuid) from public, anon, authenticated;
revoke all on function private.rescue_has_founding(uuid) from public, anon, authenticated;
revoke all on function private.assert_rescue_open() from public, anon;
revoke all on function private.rescue_find_code(uuid, text, boolean) from public, anon, authenticated;
grant execute on function private.rescue_months() to authenticated, service_role;
grant execute on function private.rescue_attempt_limit() to authenticated, service_role;
grant execute on function private.rescue_code_clean(text) to authenticated, service_role;
grant execute on function private.rescue_uses(uuid) to service_role;
grant execute on function private.rescue_has_founding(uuid) to service_role;
grant execute on function private.assert_rescue_open() to authenticated, service_role;
grant execute on function private.rescue_find_code(uuid, text, boolean) to service_role;


-- 4) Placing a rescue membership ---------------------------------------------------------------

-- Six months from the free season's end, or from approval if that's later.
-- No opening day yet: no dates (like founding and gift grants, it grants
-- nothing until then). Once started it keeps its dates. It waits for a gift
-- that has already started, so it never takes time away from one; gifts that
-- haven't started queue behind it (place_grant's own rule: non-gift grants
-- come first). Months are counted on the Flock's calendar (Eastern).
create or replace function private.place_rescue_grant(p_entitlement_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e        public.entitlements;
  r        public.rescue_redemptions;
  v_opens  timestamptz := private.flock_opens_at();
  v_start  timestamptz;
  v_queue  timestamptz;
begin
  select * into e from public.entitlements where id = p_entitlement_id for update;
  if e.id is null or e.source <> 'rescue' or e.status = 'canceled' then return; end if;
  if e.starts_at is not null and e.starts_at <= now() then return; end if;
  select * into r from public.rescue_redemptions x where x.entitlement_id = e.id;
  if r.id is null or r.status <> 'approved' then return; end if;

  v_start := case when v_opens is null then null else greatest(r.reviewed_at, private.free_season_ends_at()) end;
  if v_start is not null then
    select max(o.current_period_end) into v_queue
    from public.entitlements o
    where o.user_id = e.user_id
      and o.id <> e.id
      and o.source = 'gift'
      and o.plan <> 'app_premium'
      and o.status <> 'canceled'
      and o.starts_at is not null and o.starts_at <= now()
      and o.current_period_end is not null
      and o.current_period_end > v_start;
    v_start := greatest(v_start, v_queue);
  end if;

  update public.entitlements
  set starts_at          = v_start,
      current_period_end = case when v_start is null then null
                                else ((v_start at time zone 'America/New_York') + make_interval(months => private.rescue_months())) at time zone 'America/New_York' end,
      status             = 'active'
  where id = e.id;
end;
$$;

revoke all on function private.place_rescue_grant(uuid) from public, anon, authenticated;
grant execute on function private.place_rescue_grant(uuid) to service_role;

-- The 20261120120000 version, plus rescue rows placed first.
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
    where e.source = 'rescue'
      and e.status <> 'canceled'
      and (e.starts_at is null or e.starts_at > now())
      and (p_user_id is null or e.user_id = p_user_id)
    order by e.user_id, e.id
  loop
    perform private.place_rescue_grant(r.id);
    n := n + 1;
  end loop;
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


-- 5) What adopters call ------------------------------------------------------------------------

-- Check a code before the form: ok with the rescue's name, or a reason
-- (see rescue_find_code).
create or replace function private.flock_rescue_check(p_code text)
returns table (ok boolean, partner_name text, reason text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := private.assert_rescue_open();
  f record;
begin
  select * into f from private.rescue_find_code(v_user, p_code, false);
  return query select f.reason is null, f.partner_name, f.reason;
end;
$$;

-- Send the adoption for confirmation: ok with the redemption's id, or a
-- reason (see rescue_find_code). Missing or bad answers raise 'bird_name',
-- 'species' or 'adopted_on' (the form checks them first).
create or replace function private.flock_rescue_redeem(p_code text, p_bird_name text, p_species text, p_adopted_on date)
returns table (ok boolean, redemption_id uuid, partner_name text, reason text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := private.assert_rescue_open();
  f record;
  v_name text := nullif(btrim(coalesce(p_bird_name, '')), '');
  v_species text := nullif(btrim(coalesce(p_species, '')), '');
  v_id uuid;
begin
  if v_name is null or length(v_name) > 60 then
    raise exception 'bird_name' using errcode = '22023';
  end if;
  if v_species is null or length(v_species) > 80 then
    raise exception 'species' using errcode = '22023';
  end if;
  if p_adopted_on is null or p_adopted_on > (now() at time zone 'America/New_York')::date
     or p_adopted_on < date '1950-01-01' then
    raise exception 'adopted_on' using errcode = '22023';
  end if;
  -- Locks the rescue's row, so two adopters can't both take the last use.
  select * into f from private.rescue_find_code(v_user, p_code, true);
  if f.reason is not null then
    return query select false, null::uuid, null::text, f.reason;
    return;
  end if;
  begin
    insert into public.rescue_redemptions (user_id, partner_id, bird_name, species, adopted_on)
    values (v_user, f.partner_id, v_name, v_species, p_adopted_on)
    returning id into v_id;
  exception when unique_violation then
    return query select false, null::uuid, null::text, 'already_redeemed'::text;
    return;
  end;
  return query select true, v_id, f.partner_name, null::text;
end;
$$;

-- Where the caller's latest redemption stands (no row: none yet). starts_at /
-- ends_at once an approved membership has dates.
create or replace function private.flock_rescue_status()
returns table (redemption_id uuid, status text, partner_name text, bird_name text, species text,
               adopted_on date, created_at timestamptz, starts_at timestamptz, ends_at timestamptz,
               seen boolean, has_founding boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := private.assert_rescue_open();
begin
  return query
    select r.id, r.status, p.name, r.bird_name, r.species, r.adopted_on, r.created_at,
           e.starts_at, e.current_period_end, r.seen_at is not null, private.rescue_has_founding(v_user)
    from public.rescue_redemptions r
    join public.rescue_partners p on p.id = r.partner_id
    left join public.entitlements e on e.id = r.entitlement_id
    where r.user_id = v_user
    order by (r.status <> 'declined') desc, r.created_at desc
    limit 1;
  if not found then
    return query select null::uuid, null::text, null::text, null::text, null::text, null::date,
                        null::timestamptz, null::timestamptz, null::timestamptz, false, private.rescue_has_founding(v_user);
  end if;
end;
$$;

-- The adopter has seen the welcome (or the decline).
create or replace function private.flock_rescue_seen(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := private.assert_rescue_open();
begin
  update public.rescue_redemptions r set seen_at = coalesce(r.seen_at, now())
  where r.id = p_id and r.user_id = v_user and r.status in ('approved', 'declined');
end;
$$;

revoke all on function private.flock_rescue_check(text) from public, anon;
revoke all on function private.flock_rescue_redeem(text, text, text, date) from public, anon;
revoke all on function private.flock_rescue_status() from public, anon;
revoke all on function private.flock_rescue_seen(uuid) from public, anon;
grant execute on function private.flock_rescue_check(text) to authenticated, service_role;
grant execute on function private.flock_rescue_redeem(text, text, text, date) to authenticated, service_role;
grant execute on function private.flock_rescue_status() to authenticated, service_role;
grant execute on function private.flock_rescue_seen(uuid) to authenticated, service_role;


-- 6) What admins call --------------------------------------------------------------------------

-- Every partner, with how many adoptions are approved and waiting.
create or replace function private.admin_rescue_partners()
returns table (partner_id uuid, name text, code text, use_limit integer, paused boolean,
               approved integer, pending integer, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_flock_admin();
  return query
    select p.id, p.name, p.code, p.use_limit, p.paused,
           (select count(*)::integer from public.rescue_redemptions r where r.partner_id = p.id and r.status = 'approved'),
           (select count(*)::integer from public.rescue_redemptions r where r.partner_id = p.id and r.status = 'pending'),
           p.created_at
    from public.rescue_partners p
    order by lower(p.name), p.id;
end;
$$;

-- Add (p_id null) or edit a partner. Returns its id. A code already used by
-- another partner raises 'code_taken'.
create or replace function private.admin_rescue_partner_save(p_id uuid, p_name text, p_code text, p_use_limit integer, p_paused boolean)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_code text := private.rescue_code_clean(p_code);
  v_id uuid;
begin
  perform private.assert_flock_admin();
  if v_name is null or length(v_name) > 120 then
    raise exception 'name' using errcode = '22023';
  end if;
  if v_code is null or v_code !~ '^[A-Z0-9]{4,30}$' then
    raise exception 'code' using errcode = '22023';
  end if;
  if p_use_limit is not null and (p_use_limit < 1 or p_use_limit > 100000) then
    raise exception 'use_limit' using errcode = '22023';
  end if;
  if exists (select 1 from public.rescue_partners x where x.code = v_code and x.id is distinct from p_id) then
    raise exception 'code_taken' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.rescue_partners (name, code, use_limit, paused, created_by)
    values (v_name, v_code, p_use_limit, coalesce(p_paused, false), auth.uid())
    returning id into v_id;
  else
    update public.rescue_partners x
    set name = v_name, code = v_code, use_limit = p_use_limit, paused = coalesce(p_paused, x.paused), updated_at = now()
    where x.id = p_id
    returning x.id into v_id;
    if v_id is null then
      raise exception 'not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- Pause or restart a code.
create or replace function private.admin_rescue_partner_pause(p_id uuid, p_paused boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.assert_flock_admin();
  update public.rescue_partners x set paused = coalesce(p_paused, true), updated_at = now() where x.id = p_id;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Adoptions to review (p_status 'pending', oldest first), or decided ones
-- ('approved' / 'declined', newest first). account_name is the adopter's name
-- on their care account, so the rescue can confirm who adopted.
create or replace function private.admin_rescue_redemptions(p_status text)
returns table (redemption_id uuid, partner_id uuid, partner_name text, bird_name text, species text,
               adopted_on date, account_name text, status text, created_at timestamptz, reviewed_at timestamptz,
               has_founding boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_flock_admin();
  if coalesce(p_status, '') not in ('pending', 'approved', 'declined') then
    raise exception 'pending, approved or declined' using errcode = '22023';
  end if;
  return query
    select r.id, p.id, p.name, r.bird_name, r.species, r.adopted_on,
           nullif(btrim(coalesce(pr.full_name, pr.first_name, '')), ''),
           r.status, r.created_at, r.reviewed_at, private.rescue_has_founding(r.user_id)
    from public.rescue_redemptions r
    join public.rescue_partners p on p.id = r.partner_id
    left join public.profiles pr on pr.id = r.user_id
    where r.status = p_status
    order by case when p_status = 'pending' then r.created_at end asc,
             r.reviewed_at desc nulls last, r.created_at desc
    limit 200;
end;
$$;

-- Approve (gives the six months) or decline a waiting adoption.
create or replace function private.admin_rescue_review(p_id uuid, p_decision text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r public.rescue_redemptions;
  v_ent uuid;
  v_partner text;
begin
  perform private.assert_flock_admin();
  if coalesce(p_decision, '') not in ('approve', 'decline') then
    raise exception 'approve or decline' using errcode = '22023';
  end if;
  select * into r from public.rescue_redemptions x where x.id = p_id for update;
  if r.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;
  if p_decision = 'decline' then
    update public.rescue_redemptions x set status = 'declined', reviewed_by = auth.uid(), reviewed_at = now() where x.id = r.id;
    return;
  end if;
  if private.rescue_has_founding(r.user_id) then
    raise exception 'founder' using errcode = 'P0001';
  end if;
  select p.name into v_partner from public.rescue_partners p where p.id = r.partner_id;
  insert into public.entitlements (user_id, plan, status, source, starts_at, current_period_end, note, granted_by)
  values (r.user_id, 'comp', 'active', 'rescue', null, null, 'Rescue adoption: ' || coalesce(v_partner, 'partner'), auth.uid())
  returning id into v_ent;
  update public.rescue_redemptions x
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), entitlement_id = v_ent
  where x.id = r.id;
  -- Places this membership, then re-places the account's gifts behind it.
  perform private.reschedule_pending_grants(r.user_id);
end;
$$;

revoke all on function private.admin_rescue_partners() from public, anon;
revoke all on function private.admin_rescue_partner_save(uuid, text, text, integer, boolean) from public, anon;
revoke all on function private.admin_rescue_partner_pause(uuid, boolean) from public, anon;
revoke all on function private.admin_rescue_redemptions(text) from public, anon;
revoke all on function private.admin_rescue_review(uuid, text) from public, anon;
grant execute on function private.admin_rescue_partners() to authenticated, service_role;
grant execute on function private.admin_rescue_partner_save(uuid, text, text, integer, boolean) to authenticated, service_role;
grant execute on function private.admin_rescue_partner_pause(uuid, boolean) to authenticated, service_role;
grant execute on function private.admin_rescue_redemptions(text) to authenticated, service_role;
grant execute on function private.admin_rescue_review(uuid, text) to authenticated, service_role;


-- 7) Invoker wrappers the app calls ------------------------------------------------------------

create or replace function public.flock_rescue_check(p_code text)
returns table (ok boolean, partner_name text, reason text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.flock_rescue_check(p_code); $$;

create or replace function public.flock_rescue_redeem(p_code text, p_bird_name text, p_species text, p_adopted_on date)
returns table (ok boolean, redemption_id uuid, partner_name text, reason text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.flock_rescue_redeem(p_code, p_bird_name, p_species, p_adopted_on); $$;

create or replace function public.flock_rescue_status()
returns table (redemption_id uuid, status text, partner_name text, bird_name text, species text,
               adopted_on date, created_at timestamptz, starts_at timestamptz, ends_at timestamptz,
               seen boolean, has_founding boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_rescue_status(); $$;

create or replace function public.flock_rescue_seen(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.flock_rescue_seen(p_id); $$;

create or replace function public.admin_rescue_partners()
returns table (partner_id uuid, name text, code text, use_limit integer, paused boolean,
               approved integer, pending integer, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.admin_rescue_partners(); $$;

create or replace function public.admin_rescue_partner_save(p_id uuid, p_name text, p_code text, p_use_limit integer default null, p_paused boolean default false)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.admin_rescue_partner_save(p_id, p_name, p_code, p_use_limit, p_paused); $$;

create or replace function public.admin_rescue_partner_pause(p_id uuid, p_paused boolean)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_rescue_partner_pause(p_id, p_paused); $$;

create or replace function public.admin_rescue_redemptions(p_status text default 'pending')
returns table (redemption_id uuid, partner_id uuid, partner_name text, bird_name text, species text,
               adopted_on date, account_name text, status text, created_at timestamptz, reviewed_at timestamptz,
               has_founding boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.admin_rescue_redemptions(p_status); $$;

create or replace function public.admin_rescue_review(p_id uuid, p_decision text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.admin_rescue_review(p_id, p_decision); $$;

revoke all on function public.flock_rescue_check(text) from public, anon;
revoke all on function public.flock_rescue_redeem(text, text, text, date) from public, anon;
revoke all on function public.flock_rescue_status() from public, anon;
revoke all on function public.flock_rescue_seen(uuid) from public, anon;
revoke all on function public.admin_rescue_partners() from public, anon;
revoke all on function public.admin_rescue_partner_save(uuid, text, text, integer, boolean) from public, anon;
revoke all on function public.admin_rescue_partner_pause(uuid, boolean) from public, anon;
revoke all on function public.admin_rescue_redemptions(text) from public, anon;
revoke all on function public.admin_rescue_review(uuid, text) from public, anon;
grant execute on function public.flock_rescue_check(text) to authenticated, service_role;
grant execute on function public.flock_rescue_redeem(text, text, text, date) to authenticated, service_role;
grant execute on function public.flock_rescue_status() to authenticated, service_role;
grant execute on function public.flock_rescue_seen(uuid) to authenticated, service_role;
grant execute on function public.admin_rescue_partners() to authenticated, service_role;
grant execute on function public.admin_rescue_partner_save(uuid, text, text, integer, boolean) to authenticated, service_role;
grant execute on function public.admin_rescue_partner_pause(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_rescue_redemptions(text) to authenticated, service_role;
grant execute on function public.admin_rescue_review(uuid, text) to authenticated, service_role;
