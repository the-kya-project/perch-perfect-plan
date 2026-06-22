-- Verification for 20260621120000_multi_owner_access_foundation.
-- Run in the Supabase SQL editor AFTER applying the migration. Read-only except
-- the clearly-marked household-grant test (which cleans up after itself).

-- 1) Every existing bird has exactly one owner member, matching birds.owner_id.
select
  (select count(*) from public.birds)                                   as birds,
  (select count(*) from public.bird_members where role = 'owner')        as owner_members,
  (select count(*) from public.birds b
     where not exists (select 1 from public.bird_members m
                       where m.bird_id = b.id and m.user_id = b.owner_id and m.role='owner')) as birds_missing_owner_member;
-- expect: owner_members = birds, birds_missing_owner_member = 0

-- 2) has_bird_access: owner -> 'owner', unrelated user -> null.
select
  public.has_bird_access(b.id, b.owner_id)                              as owner_role,   -- 'owner'
  public.has_bird_access(b.id, '00000000-0000-0000-0000-000000000000')  as stranger_role -- null
from public.birds b limit 1;

-- 2b) Household grant works by SQL (no UI). Pick a bird + a second real user id.
-- Replace :bird and :other_user, then run:
--   insert into public.bird_members(bird_id,user_id,role) values (:bird, :other_user, 'household');
--   select public.has_bird_access(:bird, :other_user);   -- expect 'household'
--   delete from public.bird_members where bird_id=:bird and user_id=:other_user and role='household';

-- 3) Cross-owner isolation still holds. Run as an authenticated user (set the
-- request JWT in the SQL editor "Run as" / impersonation) and confirm you see
-- ONLY your birds:
--   select count(*) from public.birds;                       -- = your bird count
--   select count(*) from public.birds where owner_id <> auth.uid(); -- expect 0
--   select count(*) from public.care_plans cp                -- expect 0 rows for others
--     where not exists (select 1 from public.birds b where b.id=cp.bird_id and b.owner_id=auth.uid());

-- 4) RLS enabled on every new + re-pointed table.
select relname, relrowsecurity
from pg_class
where relname in ('bird_members','weight_entries','journal_entries','moments',
                  'birds','care_plans','routine_tasks','emergency_contacts',
                  'daily_logs','photo_logs','weight_logs')
order by relname;  -- relrowsecurity = true for all

-- 5) Policies point at has_bird_access; storage bucket is private + scoped.
select tablename, policyname from pg_policies
where schemaname='public'
  and tablename in ('bird_members','weight_entries','journal_entries','moments',
                    'birds','care_plans','routine_tasks','emergency_contacts',
                    'daily_logs','photo_logs','weight_logs')
order by tablename, policyname;
select id, public from storage.buckets where id='journal-photos';  -- public=false
select policyname from pg_policies where schemaname='storage' and tablename='objects'
  and policyname like 'journal-photos%';
