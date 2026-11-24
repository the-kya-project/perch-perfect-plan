-- Journeys redesign, part 2 (backlog 1.20b): what the new screens read. The
-- screens themselves are in src/routes/_authenticated/flock.journeys.*.tsx;
-- docs/flock/journeys-redesign.md, "Screens" 1 to 6.
--
-- Everything here is new and additive except one Flock-only function, patched
-- from its live definition:
--   1. journey_vet_sign_tiers(): the vet nudge's phrases for anyone who can use
--      journeys (a free account included), so every caption and question runs
--      the nudge. flock_vet_sign_tiers() stays Flock-only.
--   2. journey_moment_cards(limit): Today's journey cards from journeys you
--      follow, now "This was a big moment" updates and "learned it" finishes
--      (milestone cards are history). Same visibility as the milestone cards:
--      journey_card_rows (journey_viewable), hidden updates and blocked people
--      left out, reactions from blocked people not counted.
--   3. journey_following_latest(): for Today's followed rings, the latest clip
--      on each followed journey, read through journey_following() and
--      journey_view_updates() as the caller, so it inherits their rules.
--   4. journey_big_moments(journey): which of a journey's visible updates are
--      big moments (the clip grid's tag and the story viewer's label).
--   5. journey_skill_journeys(slug, limit): "How others did it": community
--      journeys for one skill, through journey_feed() as the caller (Flock
--      members only, as the feed already is; never a "Just me" journey).
--   6. flock_challenge_rows: a journey challenge no longer counts milestones
--      (done_count and total_count are 0). Finishing was already "the journey
--      ended as learned it (status finished) before the end date"
--      (flock_challenge_done), which is what Brittany asked for on #547.
--
-- Behind journeys_enabled() and flock_enabled() (admins only today). No
-- care-app table, policy, trigger or function changes. Pinned by
-- supabase/checks/journeys_screens_checks.sql.


-- 1) The vet nudge's phrases, for journey captions and questions ----------------------

create or replace function private.journey_vet_sign_tiers()
returns table (phrase text, tier text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  return query select s.phrase, s.tier from public.flock_vet_signs s order by s.phrase;
end;
$$;

revoke all on function private.journey_vet_sign_tiers() from public, anon;
grant execute on function private.journey_vet_sign_tiers() to authenticated, service_role;

create or replace function public.journey_vet_sign_tiers()
returns table (phrase text, tier text)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_vet_sign_tiers(); $$;

revoke all on function public.journey_vet_sign_tiers() from public, anon;
grant execute on function public.journey_vet_sign_tiers() to authenticated, service_role;


-- 2) Today's journey cards: big moments and "learned it" -------------------------------

create or replace function private.journey_moment_cards(p_limit integer)
returns table (
  card_kind text, journey_id uuid, update_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean,
  skill text, template_slug text, owner_name text, owner_region text, happened_at timestamptz,
  caption text, has_clip boolean,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  perform private.assert_can_use_journeys();
  return query
    select x.* from (
      select 'big_moment'::text as card_kind, c.journey_id, u.id as update_id, c.bird_id, c.bird_name, c.bird_has_photo,
             c.skill, c.template_slug, c.owner_name, rg.name::text as owner_region, u.created_at as happened_at,
             u.caption, u.clip_ref is not null as has_clip,
             (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and not private.flock_blocked(v_me, r.user_id) and r.kind = 'great_job') as great_job,
             (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and not private.flock_blocked(v_me, r.user_id) and r.kind = 'been_there') as been_there,
             (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and not private.flock_blocked(v_me, r.user_id) and r.kind = 'rooting_for_you') as rooting_for_you,
             (select count(*)::integer from public.flock_reactions r where r.subject_type = 'journey_update' and r.subject_id = u.id and not private.flock_blocked(v_me, r.user_id) and r.kind = 'love_this') as love_this,
             coalesce((select array_agg(r.kind::text order by r.kind) from public.flock_reactions r
                       where r.subject_type = 'journey_update' and r.subject_id = u.id and r.user_id = v_me), '{}'::text[]) as mine
      from private.journey_card_rows(v_me) c
      join public.journey_updates u on u.journey_id = c.journey_id and u.is_big_moment
      left join public.flock_profiles fp on fp.user_id = c.owner_id
      left join public.regions rg on rg.slug = fp.region_slug
      where c.following
        and (not private.flock_blocked(v_me, u.author_id) or private.has_bird_access(u.bird_id, v_me) is not null)
        and (not private.flock_is_hidden('journey_update', u.id)
             or u.author_id = v_me or private.has_bird_access(u.bird_id, v_me) is not null)
      union all
      select 'learned'::text, c.journey_id, null::uuid, c.bird_id, c.bird_name, c.bird_has_photo,
             c.skill, c.template_slug, c.owner_name, rg.name::text, c.finished_at,
             null::text, false, 0, 0, 0, 0, '{}'::text[]
      from private.journey_card_rows(v_me) c
      left join public.flock_profiles fp on fp.user_id = c.owner_id
      left join public.regions rg on rg.slug = fp.region_slug
      where c.following and c.status = 'finished' and c.finished_at is not null
    ) x
    order by x.happened_at desc, x.journey_id
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke all on function private.journey_moment_cards(integer) from public, anon;
grant execute on function private.journey_moment_cards(integer) to authenticated, service_role;

create or replace function public.journey_moment_cards(p_limit integer default 20)
returns table (
  card_kind text, journey_id uuid, update_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean,
  skill text, template_slug text, owner_name text, owner_region text, happened_at timestamptz,
  caption text, has_clip boolean,
  great_job integer, been_there integer, rooting_for_you integer, love_this integer, mine text[]
)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_moment_cards(p_limit); $$;

revoke all on function public.journey_moment_cards(integer) from public, anon;
grant execute on function public.journey_moment_cards(integer) to authenticated, service_role;


-- 3) Today's followed rings: the latest clip on each ------------------------------------

create or replace function public.journey_following_latest()
returns table (journey_id uuid, update_id uuid)
language sql stable security invoker set search_path = ''
as $$
  select f.journey_id,
         (select u.update_id from public.journey_view_updates(f.journey_id) u
          where u.has_clip order by u.created_at desc limit 1)
  from public.journey_following() f;
$$;

revoke all on function public.journey_following_latest() from public, anon;
grant execute on function public.journey_following_latest() to authenticated, service_role;


-- 4) Which of a journey's updates are big moments ----------------------------------------

create or replace function private.journey_big_moments(p_journey_id uuid)
returns table (update_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  -- Only updates journey_view_updates already shows the caller.
  return query
    select u.id from public.journey_updates u
    where u.journey_id = p_journey_id and u.is_big_moment
      and u.id in (select v.update_id from public.journey_view_updates(p_journey_id) v);
end;
$$;

revoke all on function private.journey_big_moments(uuid) from public, anon;
grant execute on function private.journey_big_moments(uuid) to authenticated, service_role;

create or replace function public.journey_big_moments(p_journey_id uuid)
returns table (update_id uuid)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_big_moments(p_journey_id); $$;

revoke all on function public.journey_big_moments(uuid) from public, anon;
grant execute on function public.journey_big_moments(uuid) to authenticated, service_role;


-- 5) "How others did it": community journeys for one skill --------------------------------

create or replace function public.journey_skill_journeys(p_template_slug text, p_limit integer default 6)
returns table (
  journey_id uuid, bird_id uuid, bird_name text, bird_has_photo boolean, skill text, template_slug text, category text,
  template_tier text, status text, visibility text, started_at timestamptz, finished_at timestamptz,
  done integer, total integer, next_title text, owner_id uuid, owner_name text, followers integer, following boolean,
  is_mine boolean, last_activity timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select f.* from public.journey_feed('for_you', 200) f
  where f.template_slug = p_template_slug and not f.is_mine
  order by (f.status = 'finished') desc, f.last_activity desc
  limit least(greatest(coalesce(p_limit, 6), 1), 50);
$$;

revoke all on function public.journey_skill_journeys(text, integer) from public, anon;
grant execute on function public.journey_skill_journeys(text, integer) to authenticated, service_role;


-- 6) Journey challenges show no milestone progress ----------------------------------------
--    Rewritten from the live definition with exact text replacements (the same
--    way 20261121100000_flock_member_blocking.sql patched functions), so every
--    later change to flock_challenge_rows is kept.

create or replace function private.journeys_screens_patch(p_sig text, p_pairs text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_def text := pg_get_functiondef(p_sig::regprocedure);
  i integer;
begin
  if array_length(p_pairs, 1) % 2 <> 0 then
    raise exception 'journeys_screens_patch(%): pairs must come in twos', p_sig;
  end if;
  for i in 1 .. array_length(p_pairs, 1) by 2 loop
    if position(p_pairs[i] in v_def) = 0 then
      raise exception 'journeys_screens_patch(%): anchor not found: %', p_sig, p_pairs[i];
    end if;
    v_def := replace(v_def, p_pairs[i], p_pairs[i + 1]);
  end loop;
  execute v_def;
end;
$$;

revoke all on function private.journeys_screens_patch(text, text[]) from public, anon, authenticated;

select private.journeys_screens_patch('private.flock_challenge_rows(uuid)', array[
  'else (select count(*)::integer from public.journey_milestones jm where jm.journey_id = c.jid and jm.state in (''reached'', ''already''))',
  'else 0',
  'when c.jid is not null then (select count(*)::integer from public.journey_milestones jm where jm.journey_id = c.jid)
             else (select count(*)::integer from public.journey_template_milestones tm where tm.template_id = c.template_id)',
  'else 0'
]);

drop function private.journeys_screens_patch(text, text[]);
