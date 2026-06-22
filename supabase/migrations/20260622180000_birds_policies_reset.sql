-- Bird creation STILL failed with "new row violates row-level security policy
-- for table birds" after 20260622170000 set the INSERT check to
-- (owner_id = auth.uid()). A correct *permissive* INSERT policy cannot fix this
-- if a *restrictive* policy is also present: restrictive policies are AND-ed, so
-- a leftover `... as restrictive ... with check (has_bird_access(...) ...)` from
-- an earlier hand-applied draft blocks the insert no matter what permissive
-- policies say.
--
-- Fix: drop EVERY policy on public.birds (by name, via a loop, so rogue/unknown
-- ones go too) and rebuild exactly the four intended policies. Idempotent and
-- additive — no row data is touched; this only resets the policy set.
--
-- Cross-owner protection is preserved: SELECT/UPDATE/DELETE stay gated on
-- has_bird_access; INSERT only allows a bird the creator owns.

begin;

-- 1) Clean slate: remove all existing policies on birds (any name, any kind).
do $$
declare r record;
begin
  for r in
    select polname from pg_policy where polrelid = 'public.birds'::regclass
  loop
    execute format('drop policy %I on public.birds', r.polname);
  end loop;
end $$;

alter table public.birds enable row level security;

-- 2) Rebuild the intended four (all PERMISSIVE — the default).
create policy "birds member select" on public.birds for select to authenticated
  using (public.has_bird_access(id, auth.uid()) is not null);

-- Creator declares themselves owner; no pre-existing membership needed (the
-- trigger below mints it in the same transaction).
create policy "birds insert self" on public.birds for insert to authenticated
  with check (owner_id = auth.uid());

create policy "birds member update" on public.birds for update to authenticated
  using (public.has_bird_access(id, auth.uid()) is not null)
  with check (public.has_bird_access(id, auth.uid()) is not null);

create policy "birds owner delete" on public.birds for delete to authenticated
  using (public.has_bird_access(id, auth.uid()) = 'owner');

-- 3) Ensure the owner-membership trigger exists (idempotent).
create or replace function public.birds_sync_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.bird_members (bird_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (bird_id, user_id) do update set role = 'owner';
  return new;
end;
$$;
drop trigger if exists birds_sync_owner_member_ins on public.birds;
create trigger birds_sync_owner_member_ins
  after insert on public.birds
  for each row execute function public.birds_sync_owner_member();

commit;

-- Show the resulting policy set so we can confirm exactly what's live now.
select
  p.polname as policy_name,
  case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
       when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end as command,
  case when p.polpermissive then 'permissive' else 'RESTRICTIVE' end as kind,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr,
  pg_get_expr(p.polqual, p.polrelid)      as using_expr
from pg_policy p
where p.polrelid = 'public.birds'::regclass
order by command, policy_name;
