-- Journeys (step 3, PR A), follow-up from the security advisor on the preview
-- branch. Additive only, and only touches objects 20261107200000 created.
--
-- 1. The three admin functions ran as SECURITY DEFINER in public (callable over
--    /rest/v1/rpc). They already refused non-admins, but the project's pattern
--    is: privileged body in private, a SECURITY INVOKER wrapper in public
--    (admin_set_flock_ui, admin_set_flock_opens_at). Same names, arguments and
--    results; the bodies move to private.
-- 2. journey_settings and journey_limits are read only through functions. Say
--    so with a policy that allows nothing, so the advisor sees intent rather
--    than a forgotten policy.

create or replace function private.set_journeys(p_audience text)
returns public.journey_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.journey_settings;
begin
  if p_audience is null or p_audience not in ('off', 'admins', 'everyone') then
    raise exception 'p_audience must be off, admins or everyone' using errcode = '22023';
  end if;
  perform private.assert_entitlement_admin();
  insert into public.journey_settings (id, audience, updated_at, updated_by)
  values (true, p_audience, now(), auth.uid())
  on conflict (id) do update
    set audience = excluded.audience, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function private.update_journey_template(p_slug text, p_fields jsonb)
returns public.journey_templates
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.journey_templates;
  v_key text;
begin
  perform private.assert_entitlement_admin();
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_fields) loop
    if v_key not in ('name', 'purpose', 'done_when', 'suggested_first', 'typical_length', 'safety_notes', 'safeguards', 'tips', 'review_status') then
      raise exception 'can''t change %', v_key using errcode = '22023';
    end if;
  end loop;
  update public.journey_templates t set
    name            = coalesce(p_fields ->> 'name', t.name),
    purpose         = coalesce(p_fields ->> 'purpose', t.purpose),
    done_when       = coalesce(p_fields ->> 'done_when', t.done_when),
    suggested_first = case when p_fields ? 'suggested_first' then p_fields ->> 'suggested_first' else t.suggested_first end,
    typical_length  = coalesce(p_fields ->> 'typical_length', t.typical_length),
    safety_notes    = case when p_fields ? 'safety_notes' then array(select jsonb_array_elements_text(p_fields -> 'safety_notes')) else t.safety_notes end,
    safeguards      = case when p_fields ? 'safeguards' then array(select jsonb_array_elements_text(p_fields -> 'safeguards')) else t.safeguards end,
    tips            = case when p_fields ? 'tips' then array(select jsonb_array_elements_text(p_fields -> 'tips')) else t.tips end,
    review_status   = coalesce(p_fields ->> 'review_status', t.review_status),
    updated_at      = now(),
    updated_by      = auth.uid()
  where t.slug = p_slug
  returning * into v_row;
  if v_row.id is null then
    raise exception 'template not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

create or replace function private.set_journey_milestone(p_slug text, p_position integer, p_title text)
returns public.journey_template_milestones
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.journey_template_milestones;
begin
  perform private.assert_entitlement_admin();
  if p_title is null or length(btrim(p_title)) not between 1 and 300 then
    raise exception 'a milestone needs a few words (up to 300 characters)' using errcode = '22023';
  end if;
  update public.journey_template_milestones m set title = btrim(p_title)
  from public.journey_templates t
  where t.id = m.template_id and t.slug = p_slug and m.position = p_position
  returning m.* into v_row;
  if v_row.id is null then
    raise exception 'milestone not found' using errcode = 'P0002';
  end if;
  update public.journey_templates set updated_at = now(), updated_by = auth.uid() where slug = p_slug;
  return v_row;
end;
$$;

revoke all on function private.set_journeys(text) from public, anon;
revoke all on function private.update_journey_template(text, jsonb) from public, anon;
revoke all on function private.set_journey_milestone(text, integer, text) from public, anon;
grant execute on function private.set_journeys(text) to authenticated, service_role;
grant execute on function private.update_journey_template(text, jsonb) to authenticated, service_role;
grant execute on function private.set_journey_milestone(text, integer, text) to authenticated, service_role;

-- The public names become invoker wrappers (same signatures and results).
create or replace function public.admin_set_journeys(p_audience text)
returns public.journey_settings
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_journeys(p_audience); $$;

create or replace function public.admin_update_journey_template(p_slug text, p_fields jsonb)
returns public.journey_templates
language sql volatile security invoker set search_path = ''
as $$ select * from private.update_journey_template(p_slug, p_fields); $$;

create or replace function public.admin_set_journey_milestone(p_slug text, p_position integer, p_title text)
returns public.journey_template_milestones
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_journey_milestone(p_slug, p_position, p_title); $$;

revoke all on function public.admin_set_journeys(text) from public, anon;
revoke all on function public.admin_update_journey_template(text, jsonb) from public, anon;
revoke all on function public.admin_set_journey_milestone(text, integer, text) from public, anon;
grant execute on function public.admin_set_journeys(text) to authenticated, service_role;
grant execute on function public.admin_update_journey_template(text, jsonb) to authenticated, service_role;
grant execute on function public.admin_set_journey_milestone(text, integer, text) to authenticated, service_role;

-- Read only through functions: a policy that allows nothing, stated plainly.
drop policy if exists "journey_settings no direct access" on public.journey_settings;
create policy "journey_settings no direct access" on public.journey_settings
  for select to authenticated using (false);
drop policy if exists "journey_limits no direct access" on public.journey_limits;
create policy "journey_limits no direct access" on public.journey_limits
  for select to authenticated using (false);
