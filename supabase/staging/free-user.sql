-- The free-user regression check's account on the persistent "staging"
-- Supabase branch: staging-free@example.com, an ordinary non-admin account.
--
-- Each run starts it from nothing: the account is deleted (every row it made
-- cascades away with it: birds, weights, checks, journal, sits) and created
-- again, confirmed, with the password passed in. The CI job makes a random
-- password per run, so no password is stored anywhere.
--
--   psql "$STAGING_DB_URL" -v free_password="<random>" -f supabase/staging/free-user.sql
--
-- NEVER run this against production: the same guard as seed.sql refuses to.
-- example.com is reserved, so nothing can ever be delivered to this address.

\set ON_ERROR_STOP on

do $$
begin
  if exists (select 1 from auth.users where email ilike '%@thekyaproject.com') then
    raise exception 'Refusing: a @thekyaproject.com account exists, so this looks like production.';
  end if;
  if (select count(*) from auth.users where email not ilike '%@example.com') > 10 then
    raise exception 'Refusing: more than 10 non-test accounts, so this is not staging.';
  end if;
end $$;

begin;

delete from auth.users where email = 'staging-free@example.com';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', '5ea9f6a1-0000-4000-8000-0000000000f1', 'authenticated', 'authenticated',
  'staging-free@example.com', extensions.crypt(:'free_password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Free Tester","full_name":"Free Tester","first_name":"Free","last_name":"Tester"}'::jsonb,
  now(), now(), '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '5ea9f6a1-0000-4000-8000-0000000000f1', '5ea9f6a1-0000-4000-8000-0000000000f1', 'email',
  jsonb_build_object('sub', '5ea9f6a1-0000-4000-8000-0000000000f1', 'email', 'staging-free@example.com', 'email_verified', true),
  now(), now(), now());

-- Never an admin, never a Flock member: that is the whole point of the check.
do $$
begin
  if exists (select 1 from public.user_roles where user_id = '5ea9f6a1-0000-4000-8000-0000000000f1')
     or exists (select 1 from public.entitlements where user_id = '5ea9f6a1-0000-4000-8000-0000000000f1') then
    raise exception 'staging-free@example.com has a role or entitlement; it must be a plain free account.';
  end if;
end $$;

commit;
