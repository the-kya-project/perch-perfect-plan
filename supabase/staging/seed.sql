-- Test accounts and birds for the persistent "staging" Supabase branch, which
-- Vercel previews use when a PR has no database changes of its own.
--
-- NEVER run this against production. It refuses to: the guard below looks for
-- accounts only production has. (A user-count threshold would not work:
-- production had 45 accounts when this was written.)
--
-- The password is not in this file. Run it with psql and pass one in:
--   psql "$STAGING_DB_URL" -v seed_password="<choose one>" -f supabase/staging/seed.sql
-- Re-running is safe: fixed ids, and existing rows are left alone (the
-- password is reset to the one passed in).
--
-- Accounts (email/password sign-in; Google is not configured on branches):
--   staging-owner@example.com      owns Kiwi and Mango
--   staging-household@example.com  household co-carer on Kiwi
-- example.com is reserved, so nothing can ever be delivered to these.

\set ON_ERROR_STOP on

do $$
begin
  -- Production's admin and App Review accounts are @thekyaproject.com; a fresh
  -- branch has none. Real sign-ups pile up there too, so cap those as well.
  if exists (select 1 from auth.users where email ilike '%@thekyaproject.com') then
    raise exception 'Refusing to seed: a @thekyaproject.com account exists, so this looks like production.';
  end if;
  if (select count(*) from auth.users where email not ilike '%@example.com') > 10 then
    raise exception 'Refusing to seed: more than 10 non-test accounts, so this is not staging.';
  end if;
end $$;

begin;

create temporary table seed_users (id uuid, email text, display_name text) on commit drop;
insert into seed_users values
  ('5ea9f6a1-0000-4000-8000-000000000001', 'staging-owner@example.com', 'Staging Owner'),
  ('5ea9f6a1-0000-4000-8000-000000000002', 'staging-household@example.com', 'Staging Household');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt(:'seed_password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', u.display_name, 'full_name', u.display_name),
  now(), now(), '', '', '', ''
from seed_users u
on conflict (id) do update set encrypted_password = excluded.encrypted_password, updated_at = now();

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from seed_users u
on conflict (provider_id, provider) do nothing;

-- Owner memberships come from the birds_sync_owner_member trigger.
insert into public.birds (id, owner_id, name, species, age, sex, flight_status, normal_weight, normal_weight_min, normal_weight_max, notes)
values
  ('5ea9f6a1-0000-4000-8000-0000000000b1', '5ea9f6a1-0000-4000-8000-000000000001',
   'Kiwi', 'Congo African grey', '12', 'female', 'clipped', 450, 430, 470, 'Staging test bird.'),
  ('5ea9f6a1-0000-4000-8000-0000000000b2', '5ea9f6a1-0000-4000-8000-000000000001',
   'Mango', 'Sun conure', '4', 'male', 'flighted', 110, 105, 118, 'Staging test bird.')
on conflict (id) do nothing;

insert into public.bird_members (bird_id, user_id, role)
values ('5ea9f6a1-0000-4000-8000-0000000000b1', '5ea9f6a1-0000-4000-8000-000000000002', 'household')
on conflict (bird_id, user_id) do nothing;

insert into public.weight_entries (bird_id, grams, measured_at, logged_by, note)
select '5ea9f6a1-0000-4000-8000-0000000000b1', g, now() - (d || ' days')::interval,
       '5ea9f6a1-0000-4000-8000-000000000001', 'Staging seed'
from (values (448, 14), (452, 7), (449, 1)) as w(g, d)
where not exists (
  select 1 from public.weight_entries
  where bird_id = '5ea9f6a1-0000-4000-8000-0000000000b1' and note = 'Staging seed'
);

commit;
