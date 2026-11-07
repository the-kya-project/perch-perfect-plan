-- The vet nudge, two tiers: "today" (the existing red card) and "urgent" ("This
-- could be an emergency"). Flock only; additive: two new columns on
-- flock_vet_signs (a Flock table), urgent phrases, a few existing phrases moved
-- to urgent, a new read function that includes the tier, and an admin setter.
-- No care-app table, policy, trigger or function changes.
--
-- Every phrase stays review_status 'draft' until Brittany's avian vet reviews
-- the lists. Matching is whole-word in the app (src/lib/flockPosts.ts); when
-- urgent and today phrases both match, urgent wins. Posting is never blocked.
--
--   select public.admin_set_vet_sign('won''t stop bleeding', 'urgent');  -- add or move
--   select public.admin_remove_vet_sign('smoke');                         -- remove (existing)
--   update public.flock_vet_signs set review_status = 'approved';         -- once the vet signs off

alter table public.flock_vet_signs
  add column if not exists tier          text not null default 'today' check (tier in ('today', 'urgent')),
  add column if not exists review_status text not null default 'draft' check (review_status in ('draft', 'approved'));

-- Existing phrases that name an emergency move to urgent (kept, not removed).
update public.flock_vet_signs set tier = 'urgent'
where phrase in ('broken blood feather', 'seizure', 'falling off the perch', 'fell off the perch', 'can''t stand', 'egg bound', 'egg-bound')
  and tier = 'today';

insert into public.flock_vet_signs (phrase, tier)
select p, 'urgent' from unnest(array[
  -- Bleeding that won't stop, or a broken blood feather
  'won''t stop bleeding', 'bleeding won''t stop', 'still bleeding', 'can''t stop the bleeding', 'bleeding a lot',
  'broke a blood feather', 'broken a blood feather', 'blood feather broke',
  -- Repeated vomiting or regurgitating
  'keeps vomiting', 'vomiting repeatedly', 'vomiting again and again', 'keeps throwing up', 'throwing up repeatedly',
  'keeps regurgitating', 'regurgitating repeatedly',
  -- Straining, or a hen fluffed on the floor (possible egg binding)
  'straining', 'egg binding', 'egg-binding', 'can''t pass an egg', 'can''t pass her egg', 'stuck egg', 'egg is stuck',
  'fluffed on the floor', 'fluffed up on the floor', 'sitting fluffed on the floor', 'fluffed on the cage floor',
  -- Seizures, falling off the perch, unable to stand
  'seizures', 'having a seizure', 'had a seizure', 'convulsing', 'falling off her perch', 'falling off his perch',
  'fell off her perch', 'fell off his perch', 'unable to stand', 'can''t stand up', 'can''t get up',
  -- Nonstick-pan fumes, smoke, aerosols
  'nonstick', 'non-stick', 'teflon', 'ptfe', 'pan fumes', 'fumes', 'smoke', 'smoky', 'aerosol', 'aerosols',
  'air freshener', 'bug spray', 'hairspray', 'hair spray',
  -- Eating something toxic
  'avocado', 'ate chocolate', 'chocolate', 'caffeine', 'drank coffee', 'alcohol', 'lead poisoning', 'chewed lead',
  'lead paint', 'zinc', 'zinc poisoning', 'heavy metal', 'ate something toxic', 'poisoned', 'poisoning',
  -- Burns, a cat or dog bite, a hard fall
  'burned', 'burnt', 'got burned', 'a burn', 'cat bite', 'bitten by a cat', 'cat bit', 'dog bite',
  'bitten by a dog', 'dog bit', 'hard fall', 'fell hard', 'bad fall', 'crashed into'
]::text[]) as p
on conflict (phrase) do update set tier = 'urgent';

-- The phrases with their tier, for the app (members and admins).
create or replace function private.flock_vet_sign_tiers()
returns table (phrase text, tier text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_flock();
  return query select s.phrase, s.tier from public.flock_vet_signs s order by s.phrase;
end;
$$;

revoke all on function private.flock_vet_sign_tiers() from public, anon;
grant execute on function private.flock_vet_sign_tiers() to authenticated, service_role;

create or replace function public.flock_vet_sign_tiers()
returns table (phrase text, tier text)
language sql stable security invoker set search_path = ''
as $$ select * from private.flock_vet_sign_tiers(); $$;

revoke all on function public.flock_vet_sign_tiers() from public, anon;
grant execute on function public.flock_vet_sign_tiers() to authenticated, service_role;

-- Add a phrase or move it between tiers (admins). It starts as draft.
create or replace function private.set_vet_sign(p_phrase text, p_tier text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_entitlement_admin();
  if length(btrim(coalesce(p_phrase, ''))) not between 2 and 80 then
    raise exception 'a phrase of 2 to 80 characters' using errcode = '22023';
  end if;
  if p_tier is null or p_tier not in ('today', 'urgent') then
    raise exception 'tier is today or urgent' using errcode = '22023';
  end if;
  insert into public.flock_vet_signs (phrase, tier) values (lower(btrim(p_phrase)), p_tier)
  on conflict (phrase) do update set tier = excluded.tier;
end;
$$;

revoke all on function private.set_vet_sign(text, text) from public, anon;
grant execute on function private.set_vet_sign(text, text) to authenticated, service_role;

create or replace function public.admin_set_vet_sign(p_phrase text, p_tier text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.set_vet_sign(p_phrase, p_tier); $$;

revoke all on function public.admin_set_vet_sign(text, text) from public, anon;
grant execute on function public.admin_set_vet_sign(text, text) to authenticated, service_role;
