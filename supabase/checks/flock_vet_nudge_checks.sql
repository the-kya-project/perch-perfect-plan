-- Verification for 20261108170000_flock_vet_nudge_tiers and
-- 20261108180000_flock_vet_nudge_tighten.
--
-- Self-contained and leaves nothing behind: a Flock member, an admin and a free
-- user. Checks the original phrases still kept (seven moved to urgent; five
-- everyday ones removed when the lists were tightened), the urgent phrases for
-- each emergency, that everything is draft, who can read and change the lists,
-- that posting is never blocked, and which card real sentences bring up
-- against the real lists (none for everyday posts).
-- Then rolls back.
--   "FLOCK VET NUDGE CHECKS: n passed, 0 failed"           → all good
--   "FLOCK VET NUDGE CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  fm uuid := gen_random_uuid();
  ad uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; r record; pid uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[fm, ad, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at) values (fm, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values (fm, 'Alex R.', 'great-lakes', now());

  -- 1) The original phrases are kept (minus five everyday ones the tightening removed); the emergencies moved to urgent.
  ok := (select count(*) from public.flock_vet_signs where phrase in (
      'fluffing up', 'sleeping a lot', 'sleeping more', 'sleepy all day', 'lethargic',
      'not eating', 'isn''t eating', 'won''t eat', 'stopped eating', 'not eating much', 'eating less', 'lost weight', 'losing weight',
      'bleeding', 'blood', 'broken blood feather', 'tail bobbing', 'tail bob', 'tail is bobbing',
      'breathing hard', 'breathing heavily', 'open-mouth breathing', 'open mouth breathing', 'wheezing', 'clicking when breathing',
      'sitting on the cage floor', 'on the cage floor', 'on the bottom of the cage', 'sitting on the floor of the cage',
      'droppings changed', 'change in droppings', 'watery droppings', 'black droppings', 'blood in droppings', 'bloody droppings', 'no droppings',
      'can''t perch', 'falling off the perch', 'fell off the perch', 'can''t stand',
      'vomiting', 'throwing up', 'discharge from', 'swollen', 'seizure', 'egg bound', 'egg-bound')) = 47
    and not exists (select 1 from public.flock_vet_signs where phrase in ('fluffed', 'fluffed up', 'puffed up', 'eyes closed', 'head tucked'))
    and (select tier from public.flock_vet_signs where phrase = 'tail bobbing') = 'today'
    and (select tier from public.flock_vet_signs where phrase = 'bleeding') = 'today'
    and (select tier from public.flock_vet_signs where phrase = 'seizure') = 'urgent'
    and (select tier from public.flock_vet_signs where phrase = 'broken blood feather') = 'urgent';
  if ok then passed := passed + 1; else failed := array_append(failed, 'the 52 originals are kept'); end if;

  -- 2) Urgent phrases for each emergency, and every phrase is draft.
  ok := (select count(*) from public.flock_vet_signs where tier = 'urgent' and phrase in (
      'won''t stop bleeding', 'keeps vomiting', 'keeps regurgitating', 'straining', 'sitting fluffed on the floor', 'egg binding',
      'having a seizure', 'falling off the perch', 'unable to stand', 'teflon fumes', 'pan fumes', 'smoke inhalation', 'sprayed near',
      'ate avocado', 'ate chocolate', 'had caffeine', 'drank alcohol', 'lead poisoning', 'zinc poisoning', 'got burned', 'cat bite', 'dog bite', 'hard fall')) = 23
    and not exists (select 1 from public.flock_vet_signs where phrase in (
      'chocolate', 'avocado', 'alcohol', 'caffeine', 'nonstick', 'non-stick', 'teflon', 'ptfe', 'aerosol', 'aerosols', 'air freshener',
      'hair spray', 'hairspray', 'bug spray', 'smoke', 'smoky', 'heavy metal', 'zinc', 'burned', 'burnt', 'a burn', 'fell hard'))
    and (select count(*) from public.flock_vet_signs where tier = 'today' and phrase in
      ('fluffed up and sleeping', 'fluffed up all day', 'puffed up all day', 'sleeping on the bottom')) = 4
    and not exists (select 1 from public.flock_vet_signs where review_status <> 'draft');
  if ok then passed := passed + 1; else failed := array_append(failed, 'urgent phrases, all draft'); end if;

  -- 3) Members read phrases with their tier; free users can't.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.flock_vet_sign_tiers() where phrase = 'teflon fumes' and tier = 'urgent')
    and exists (select 1 from public.flock_vet_sign_tiers() where phrase = 'tail bobbing' and tier = 'today')
    and (select count(*) from public.flock_vet_sign_tiers()) = (select count(*) from public.flock_vet_signs());
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.flock_vet_sign_tiers(); exception when insufficient_privilege then denied := true; end;
  reset role;
  if ok and denied then passed := passed + 1; else failed := array_append(failed, 'members read the tiers; free users can''t'); end if;

  -- 4) Admins add or move a phrase (it starts as draft); nobody else can.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.admin_set_vet_sign('panting', 'urgent'); exception when insufficient_privilege then denied := true; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_vet_sign('  Panting ', 'urgent');
  perform public.admin_set_vet_sign('bleeding', 'urgent');
  ok := true;
  begin perform public.admin_set_vet_sign('panting', 'someday'); ok := false; exception when invalid_parameter_value then null; end;
  reset role;
  ok := ok and denied and (select tier = 'urgent' and review_status = 'draft' from public.flock_vet_signs where phrase = 'panting')
    and (select tier from public.flock_vet_signs where phrase = 'bleeding') = 'urgent';
  if ok then passed := passed + 1; else failed := array_append(failed, 'admins set a phrase''s tier'); end if;

  -- 5) Posting is never blocked, whatever the text says.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select post_id into pid from public.flock_post_create('learn', null, 'My cockatiel ate chocolate and keeps vomiting. Is this normal?', '{}', null, true);
  reset role;
  ok := exists (select 1 from public.flock_posts where id = pid and vet_nudged);
  if ok then passed := passed + 1; else failed := array_append(failed, 'posting is never blocked'); end if;

  -- 6) Real sentences against the real lists. The match below is the app's
  --    (findVetSigns): lowercase, whole words or phrases, a hyphenated word is
  --    one word. Everyday posts bring up no card; emergencies bring up urgent.
  select bool_and(not exists (
           select 1 from public.flock_vet_signs s
           where lower(x.t) ~ ('(^|[^a-z0-9''-])' || s.phrase || '($|[^a-z0-9''-])')))
    into ok
  from unnest(array[
    'We got rid of our nonstick pans', 'Is avocado safe for parrots?', 'Smoky loves his bath, all fluffed up',
    'Our smoke detector went off and scared her', 'Music time: Kiwi loves heavy metal', 'Use alcohol-free wipes',
    'That''s a burning question'
  ]) as x(t);
  ok := ok and (
    select bool_and(exists (
             select 1 from public.flock_vet_signs s
             where s.tier = 'urgent' and lower(x.t) ~ ('(^|[^a-z0-9''-])' || s.phrase || '($|[^a-z0-9''-])')))
    from unnest(array['Echo ate avocado off my plate', 'the pan overheated and there were teflon fumes', 'Kiwi got burned on the stove']) as x(t));
  if ok then passed := passed + 1; else failed := array_append(failed, 'everyday posts bring up no card; emergencies are urgent'); end if;

  raise exception 'FLOCK VET NUDGE CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
