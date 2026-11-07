-- The Flock, step 3 (PR C): showing finisher tips, and tip 1's new wording.
-- Additive only; touches only journey objects from this step.
--
-- 1. Tip 1 (after a hard day) gets Brittany's wording.
-- 2. Finisher tips ("From members who've done [Skill]") are shown on a
--    template's setup screen and on active journeys using it:
--      * only tips from finished journeys;
--      * only to app premium and Flock members (free accounts get nothing);
--      * never a member's own tip;
--      * the tip text only, no names, until step 4's comments and reporting;
--      * newest first, with how many members shared one;
--      * an admin can hide one: select public.admin_hide_finisher_tip('<id>');
--        (ids: select id, body, created_at from public.journey_finisher_tips;)


-- 1) Tip 1 -----------------------------------------------------------------------------

update public.journey_tips
   set body = 'Try a short session before breakfast, when treats tend to feel extra special. Breakfast comes right after, as always.'
 where body = 'Try a session right before breakfast. Most birds care a lot more about treats when they''re a little hungry.';


-- 2) Finisher tips: an id to hide by, and hiding -------------------------------------------

alter table public.journey_finisher_tips
  add column if not exists id        uuid not null default gen_random_uuid(),
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journey_finisher_tips_id_key') then
    alter table public.journey_finisher_tips add constraint journey_finisher_tips_id_key unique (id);
  end if;
end $$;

-- The read function changes shape (no names, a count), so it's replaced.
drop function if exists public.journey_finisher_tips_for(text);
drop function if exists private.journey_finisher_tips_for(text);

create or replace function private.journey_finisher_tips_for(p_template_slug text)
returns table (body text, created_at timestamptz, total integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_use_journeys();
  if not (private.journey_limits_for(auth.uid())).can_view_community then
    return;
  end if;
  return query
    with shown as (
      select f.body, f.created_at
      from public.journey_finisher_tips f
      join public.journey_templates t on t.id = f.template_id
      join public.journeys j on j.id = f.journey_id
      where t.slug = p_template_slug
        and j.status = 'finished'
        and f.hidden_at is null
        and f.author_id <> auth.uid()
    )
    select s.body, s.created_at, (select count(*)::integer from shown)
    from shown s
    order by s.created_at desc
    limit 20;
end;
$$;

create or replace function public.journey_finisher_tips_for(p_template_slug text)
returns table (body text, created_at timestamptz, total integer)
language sql stable security invoker set search_path = ''
as $$ select * from private.journey_finisher_tips_for(p_template_slug); $$;

revoke all on function private.journey_finisher_tips_for(text) from public, anon;
revoke all on function public.journey_finisher_tips_for(text) from public, anon;
grant execute on function private.journey_finisher_tips_for(text) to authenticated, service_role;
grant execute on function public.journey_finisher_tips_for(text) to authenticated, service_role;

create or replace function private.hide_finisher_tip(p_tip_id uuid)
returns public.journey_finisher_tips
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.journey_finisher_tips;
begin
  perform private.assert_entitlement_admin();
  update public.journey_finisher_tips set hidden_at = coalesce(hidden_at, now()), hidden_by = coalesce(hidden_by, auth.uid())
  where id = p_tip_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'tip not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

create or replace function public.admin_hide_finisher_tip(p_tip_id uuid)
returns public.journey_finisher_tips
language sql volatile security invoker set search_path = ''
as $$ select * from private.hide_finisher_tip(p_tip_id); $$;

revoke all on function private.hide_finisher_tip(uuid) from public, anon;
revoke all on function public.admin_hide_finisher_tip(uuid) from public, anon;
grant execute on function private.hide_finisher_tip(uuid) to authenticated, service_role;
grant execute on function public.admin_hide_finisher_tip(uuid) to authenticated, service_role;
