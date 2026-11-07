-- Made-up Community members for the persistent "staging" Supabase branch, so
-- previews show chapter counts, member lists and other members' profiles.
--
-- NEVER run this against production. It refuses to: the same guard as
-- seed.sql (production has @thekyaproject.com accounts and real sign-ups).
--
-- Run it once staging has 20261107180000_flock_profiles (it reaches staging
-- when the PR merges; .github/workflows/staging-migrations.yml):
--   psql "$STAGING_DB_URL" -f supabase/staging/flock-members.sql
-- (or paste into the staging branch's SQL editor / Supabase MCP on staging).
-- Re-running is safe: fixed ids, existing rows are left alone.
--
-- Seven members across Great Lakes (3), Texas (2) and California (2), each
-- with a complimentary membership, a profile, and one or two birds, one of
-- them hidden (to show hidden birds never appear). The accounts have no
-- password and can't sign in; example.com can't receive email.

do $$
begin
  if exists (select 1 from auth.users where email ilike '%@thekyaproject.com') then
    raise exception 'Refusing to seed: a @thekyaproject.com account exists, so this looks like production.';
  end if;
  if (select count(*) from auth.users where email not ilike '%@example.com') > 10 then
    raise exception 'Refusing to seed: more than 10 non-test accounts, so this is not staging.';
  end if;
  if to_regclass('public.flock_shown_birds') is null then
    raise exception 'Staging does not have 20261107180000_flock_profiles yet. Merge the PR first.';
  end if;
end $$;

begin;

create temporary table seed_flock (id uuid, email text, name text, region text, bio text) on commit drop;
insert into seed_flock values
  ('f10c0000-0000-4000-8000-000000000001', 'flock-ada@example.com',   'Ada L.',   'great-lakes', 'Two cockatiels and a lot of opinions about millet.'),
  ('f10c0000-0000-4000-8000-000000000002', 'flock-ben@example.com',   'Ben M.',   'great-lakes', 'Working on recall with a very stubborn conure.'),
  ('f10c0000-0000-4000-8000-000000000003', 'flock-chloe@example.com', 'Chloe R.', 'great-lakes', null),
  ('f10c0000-0000-4000-8000-000000000004', 'flock-cy@example.com',    'Cy T.',    'texas',       'Rescue volunteer. Ask me about foraging toys.'),
  ('f10c0000-0000-4000-8000-000000000005', 'flock-dee@example.com',   'Dee R.',   'texas',       null),
  ('f10c0000-0000-4000-8000-000000000006', 'flock-eli@example.com',   'Eli S.',   'california',  'First-time African grey person, learning fast.'),
  ('f10c0000-0000-4000-8000-000000000007', 'flock-fern@example.com',  'Fern O.',  'california',  null);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', s.id, 'authenticated', 'authenticated', s.email, now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('display_name', s.name, 'first_name', split_part(s.name, ' ', 1)),
       now(), now(), '', '', '', ''
from seed_flock s
on conflict (id) do nothing;

-- A complimentary membership (manual, no end date) for each.
insert into public.entitlements (user_id, plan, status, source, starts_at, note)
select s.id, 'comp', 'active', 'manual', now() - interval '1 day', 'Staging seed'
from seed_flock s
on conflict (user_id) where source = 'manual' do nothing;

insert into public.flock_profiles (user_id, display_name, region_slug, bio, setup_completed_at)
select s.id, s.name, s.region, s.bio, now() from seed_flock s
on conflict (user_id) do nothing;

create temporary table seed_flock_birds (id uuid, owner uuid, name text, species text, shown boolean) on commit drop;
insert into seed_flock_birds values
  ('f10cb000-0000-4000-8000-000000000001', 'f10c0000-0000-4000-8000-000000000001', 'Pepper', 'Cockatiel',            true),
  ('f10cb000-0000-4000-8000-000000000002', 'f10c0000-0000-4000-8000-000000000001', 'Salt',   'Cockatiel',            true),
  ('f10cb000-0000-4000-8000-000000000003', 'f10c0000-0000-4000-8000-000000000002', 'Rio',    'Green-cheeked conure',  true),
  ('f10cb000-0000-4000-8000-000000000004', 'f10c0000-0000-4000-8000-000000000003', 'Moss',   'Budgerigar',            false),
  ('f10cb000-0000-4000-8000-000000000005', 'f10c0000-0000-4000-8000-000000000004', 'Juniper','Blue-and-gold macaw',   true),
  ('f10cb000-0000-4000-8000-000000000006', 'f10c0000-0000-4000-8000-000000000005', 'Taco',   'Quaker parrot',         true),
  ('f10cb000-0000-4000-8000-000000000007', 'f10c0000-0000-4000-8000-000000000006', 'Gus',    'Congo African grey',    true),
  ('f10cb000-0000-4000-8000-000000000008', 'f10c0000-0000-4000-8000-000000000007', 'Plum',   'Plum-headed parakeet',  true);

-- Owner memberships come from the birds_sync_owner_member trigger.
insert into public.birds (id, owner_id, name, species, notes)
select b.id, b.owner, b.name, b.species, 'Staging seed (Community)'
from seed_flock_birds b
on conflict (id) do nothing;

insert into public.flock_shown_birds (bird_id, user_id, shown)
select b.id, b.owner, b.shown from seed_flock_birds b
on conflict (bird_id) do nothing;

commit;
