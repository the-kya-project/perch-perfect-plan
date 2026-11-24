-- Verification for 20261120150000_journeys_flock_wording: no journey text
-- or refusal still says "app premium". Since 20261124190000_journeys_skills_data
-- every template, Flock-only ones included, can be started by a free account
-- (sharing with the community is still Flock only). Self-contained; raises at
-- the end so everything rolls back.
--   "JOURNEYS FLOCK WORDING CHECKS: n passed, 0 failed" → all good
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  usr uuid := gen_random_uuid();
  bird uuid;
  jid uuid;
  passed int := 0; failed text[] := '{}';
  st text; msg text; ok boolean;
begin
  -- 1) Diet conversion's safeguard says Flock members, and no template text
  --    anywhere mentions app premium.
  ok := exists (select 1 from public.journey_templates t, unnest(t.safeguards) s
                where t.slug = 'diet-conversion' and s like '%For Flock members, this uses the bird''s own baseline alerts.%')
    and not exists (select 1 from public.journey_templates t, lateral jsonb_each_text(to_jsonb(t)) x
                    where x.value ilike '%app premium%');
  if ok then passed := passed + 1; else failed := array_append(failed, 'diet conversion safeguard says Flock members'); end if;

  -- 2) journey_start's source no longer says app premium, and keeps the
  --    sharing refusal (the Flock-only template refusal is gone since
  --    20261124190000).
  ok := pg_get_functiondef('private.journey_start(uuid, text, text, text[], integer[], text, text, text, text)'::regprocedure) not ilike '%app premium%'
    and pg_get_functiondef('private.journey_start(uuid, text, text, text[], integer[], text, text, text, text)'::regprocedure) not like '%this journey comes with Flock membership%'
    and pg_get_functiondef('private.journey_start(uuid, text, text, text[], integer[], text, text, text, text)'::regprocedure) like '%sharing with the community comes with Flock membership%';
  if ok then passed := passed + 1; else failed := array_append(failed, 'journey_start wording'); end if;

  -- 3) A free account can start a Flock-only template (journeys switched on
  --    for everyone inside this block), privately.
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', usr, 'authenticated', 'authenticated', usr::text || '@checks.invalid', '{}', '{}', now(), now());
  insert into public.birds (owner_id, name) values (usr, 'Wording check') returning id into bird;
  update public.journey_settings set audience = 'everyone' where id;
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := null; jid := null;
  begin
    jid := public.journey_start(bird, (select slug from public.journey_templates where tier = 'premium' order by sort_order limit 1),
                                null, null, null, 'most_days', 'private', null);
  exception when others then st := sqlstate; msg := sqlerrm;
  end;
  reset role;
  if st is null and jid is not null and exists (select 1 from public.journeys j where j.id = jid and j.status = 'active') then passed := passed + 1;
  else failed := array_append(failed, 'free account can start a Flock-only template (' || coalesce(st, 'none') || ': ' || coalesce(msg, '') || ')'); end if;

  raise exception 'JOURNEYS FLOCK WORDING CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
