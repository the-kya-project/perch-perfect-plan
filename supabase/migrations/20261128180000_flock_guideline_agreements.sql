-- The Flock's community guidelines walk-through: a versioned agreement record.
--
-- Every member sees the three-screen walk-through (src/flock/guidelines/) the
-- first time they enter the Flock, and again whenever the guidelines' version
-- goes up. Agreeing writes one row here per person per version.
--
-- What this adds:
--   1. public.current_guidelines_version(): the version the app and the
--      database agree on. It must equal GUIDELINES_VERSION in
--      src/flock/guidelines/content.ts (npm run test:flock-shell checks).
--      BUMPING THE VERSION (here and there, together) MAKES EVERY MEMBER SEE
--      THE WALK-THROUGH AGAIN, and blocks their posting until they agree.
--   2. public.flock_guideline_agreements (user_id, version, agreed_at). RLS:
--      a signed-in person inserts and reads only their own rows, and can only
--      insert the current version, only while the Flock is open to them
--      (flock_enabled(), so free users can't write here while it's closed).
--      agreed_at is always the server's time (insert is granted on user_id and
--      version only). Admins read every row. Nobody updates or deletes a row
--      through the API; account deletion removes them by the cascade.
--   3. public.has_agreed_to_guidelines(uid): true when uid has a row at the
--      current version. Answers only about yourself (or anyone, for an admin
--      or the server); asking about someone else returns false.
--   4. Defense in depth: nobody who hasn't agreed can post, even by calling
--      the API directly. App users have no write grant on the Flock's tables
--      (they write only through SECURITY DEFINER functions, which RLS doesn't
--      see), so the check is a BEFORE INSERT trigger on the tables themselves,
--      which catches every path: flock_posts (every space: posts, pod posts,
--      challenge entries), flock_comments, and journey_updates on a community
--      journey. Sharing a journey with the Flock (journeys.visibility set to
--      'community', at start or later) needs it too, so updates posted to a
--      "Just me" journey can't reach the Flock without an agreement.
--      Private ("Just me") journeys are never checked, and neither is a
--      household co-carer outside the Flock posting to a journey its owner
--      shared, so the care app's journeys behave exactly as before for
--      everyone who isn't a Flock member.
--      The checks apply only to a signed-in caller (auth.uid() not null): the
--      server (service role), the SQL editor, seeds and scheduled jobs pass.
--
-- Additive only: one new table, new functions and four new triggers. No
-- existing column, policy, trigger or function changes.
--
-- Pinned by supabase/checks/flock_guideline_agreements_checks.sql.


-- 1) The version ----------------------------------------------------------------------

-- Keep in step with GUIDELINES_VERSION in src/flock/guidelines/content.ts.
-- Bumping this makes every member see the walk-through again.
create or replace function public.current_guidelines_version()
returns int
language sql
immutable
set search_path = ''
as $$ select 1; $$;
revoke all on function public.current_guidelines_version() from public, anon;
grant execute on function public.current_guidelines_version() to authenticated, service_role;


-- 2) Agreement records ------------------------------------------------------------------

create table if not exists public.flock_guideline_agreements (
  user_id   uuid not null references auth.users (id) on delete cascade,
  version   int not null check (version > 0),
  agreed_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.flock_guideline_agreements enable row level security;
revoke all on public.flock_guideline_agreements from public, anon, authenticated;
grant select on public.flock_guideline_agreements to authenticated;
grant insert (user_id, version) on public.flock_guideline_agreements to authenticated;
grant select, insert, update, delete on public.flock_guideline_agreements to service_role;

drop policy if exists "flock_guideline_agreements own read" on public.flock_guideline_agreements;
create policy "flock_guideline_agreements own read" on public.flock_guideline_agreements
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "flock_guideline_agreements admin read" on public.flock_guideline_agreements;
create policy "flock_guideline_agreements admin read" on public.flock_guideline_agreements
  for select to authenticated
  using (private.is_admin((select auth.uid())));

drop policy if exists "flock_guideline_agreements own insert" on public.flock_guideline_agreements;
create policy "flock_guideline_agreements own insert" on public.flock_guideline_agreements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and version = public.current_guidelines_version()
    and coalesce(public.flock_enabled(), false)
  );


-- 3) Has this person agreed? ------------------------------------------------------------------

create or replace function public.has_agreed_to_guidelines(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null
    and (
      auth.uid() is null                      -- the server, SQL editor, jobs
      or uid = auth.uid()                     -- yourself
      or coalesce(private.is_admin(auth.uid()), false)
    )
    and exists (
      select 1 from public.flock_guideline_agreements a
      where a.user_id = uid and a.version = public.current_guidelines_version()
    );
$$;
revoke all on function public.has_agreed_to_guidelines(uuid) from public, anon;
grant execute on function public.has_agreed_to_guidelines(uuid) to authenticated, service_role;


-- 4) No posting without an agreement ---------------------------------------------------------

create or replace function private.require_guidelines_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return new; end if;

  if tg_table_name = 'journey_updates' then
    if not exists (select 1 from public.journeys j where j.id = new.journey_id and j.visibility = 'community') then
      return new;
    end if;
    -- A bird's household posts to that bird's journeys from the care app. A
    -- co-carer who isn't in the Flock can't agree (the Flock is closed to
    -- them), so they post exactly as before; the journey's owner shared it.
    if not private.can_use_flock(v_user) then return new; end if;
  elsif tg_table_name = 'journeys' then
    if new.visibility is distinct from 'community' then return new; end if;
    if tg_op = 'UPDATE' and old.visibility = 'community' then return new; end if;
  end if;

  if not public.has_agreed_to_guidelines(v_user) then
    raise exception 'guidelines_required' using errcode = '42501',
      hint = 'Agree to the community guidelines first.';
  end if;
  return new;
end;
$$;
revoke all on function private.require_guidelines_agreement() from public, anon, authenticated;

drop trigger if exists flock_posts_require_guidelines on public.flock_posts;
create trigger flock_posts_require_guidelines before insert on public.flock_posts
  for each row execute function private.require_guidelines_agreement();

drop trigger if exists flock_comments_require_guidelines on public.flock_comments;
create trigger flock_comments_require_guidelines before insert on public.flock_comments
  for each row execute function private.require_guidelines_agreement();

drop trigger if exists journey_updates_require_guidelines on public.journey_updates;
create trigger journey_updates_require_guidelines before insert on public.journey_updates
  for each row execute function private.require_guidelines_agreement();

drop trigger if exists journeys_require_guidelines on public.journeys;
create trigger journeys_require_guidelines before insert or update of visibility on public.journeys
  for each row execute function private.require_guidelines_agreement();
