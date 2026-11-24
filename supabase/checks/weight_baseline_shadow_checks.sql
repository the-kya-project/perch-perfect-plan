-- Verification for 20261124110000_weight_baseline_shadow (backlog D1.2).
--
-- The ideal weight range: the bird's owner reads and writes it, the bird's
-- household only reads it, nobody else sees it, and it must be a real range.
-- The shadow log: no app user or visitor can read or write it, the pending
-- list is service role only and drops a weigh-in once it's logged, and
-- deleting the bird removes both. The weight_baseline switch is still off.
--
-- Self-contained: it raises at the end so the whole block rolls back.
--   "WEIGHT BASELINE SHADOW CHECKS: n passed, 0 failed"          → all good
--   "WEIGHT BASELINE SHADOW CHECKS: n passed, k failed: <names>" → which broke
do $$
declare
  ow uuid := gen_random_uuid();  -- owner
  hh uuid := gen_random_uuid();  -- household member on the owner's bird
  st uuid := gen_random_uuid();  -- stranger
  b  uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid();
  w2 uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  n int; v numeric; denied boolean; ids uuid[];
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ow, hh, st]) as u;
  insert into public.birds (id, owner_id, name, species) values (b, ow, 'Kiwi', 'Cockatiel');
  insert into public.bird_members (bird_id, user_id, role) values (b, hh, 'household') on conflict do nothing;
  insert into public.weight_entries (id, bird_id, grams, measured_at, source) values
    (w1, b, 92, now() - interval '1 day', 'owner'),
    (w2, b, 91, now(), 'owner');

  -- 1) The owner saves an ideal range and changes it.
  perform set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.bird_ideal_weights (bird_id, low_grams, high_grams) values (b, 88, 96);
  update public.bird_ideal_weights set low_grams = 89 where bird_id = b;
  select low_grams into v from public.bird_ideal_weights where bird_id = b;
  reset role;
  if v = 89 then passed := passed + 1; else failed := array_append(failed, 'owner saves'); end if;

  -- 2) The household reads it but can't change or remove it.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.bird_ideal_weights where bird_id = b;
  update public.bird_ideal_weights set low_grams = 50 where bird_id = b;
  delete from public.bird_ideal_weights where bird_id = b;
  reset role;
  select low_grams into v from public.bird_ideal_weights where bird_id = b;
  if n = 1 and v = 89 then passed := passed + 1; else failed := array_append(failed, 'household reads only'); end if;

  -- 3) A household member can't add one either.
  delete from public.bird_ideal_weights where bird_id = b;
  denied := false;
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.bird_ideal_weights (bird_id, low_grams, high_grams) values (b, 80, 90);
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'household add'); end if;
  insert into public.bird_ideal_weights (bird_id, low_grams, high_grams) values (b, 89, 96);

  -- 4) A stranger sees nothing and can't write.
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.bird_ideal_weights;
  denied := false;
  begin
    insert into public.bird_ideal_weights (bird_id, low_grams, high_grams) values (b, 80, 90)
      on conflict (bird_id) do update set low_grams = excluded.low_grams;
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if n = 0 and denied then passed := passed + 1; else failed := array_append(failed, 'stranger'); end if;

  -- 5) Signed-out visitors can't read it.
  denied := false;
  set local role anon;
  begin perform 1 from public.bird_ideal_weights;
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'anon ideal'); end if;

  -- 6) It must be a range, low first, in the app's weight limits.
  denied := false;
  begin update public.bird_ideal_weights set low_grams = 100, high_grams = 90 where bird_id = b;
  exception when check_violation then denied := true;
  end;
  if denied then passed := passed + 1; else failed := array_append(failed, 'low before high'); end if;
  denied := false;
  begin update public.bird_ideal_weights set high_grams = 6000 where bird_id = b;
  exception when check_violation then denied := true;
  end;
  if denied then passed := passed + 1; else failed := array_append(failed, 'weight limits'); end if;

  -- 7) No app user can read or write the shadow log.
  insert into public.weight_baseline_shadow
    (weight_entry_id, bird_id, measured_at, grams, meal_state, learned, tier, reweigh, hard_loss,
     sudden_reweigh, sudden_confirmed, has_ideal, tier_with_ideal, reweigh_with_ideal, rules_version)
  values (w1, b, now() - interval '1 day', 92, 'unlabeled', false, 'learning', false, false,
          false, false, true, 'learning', false, 'checks00');
  perform set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  denied := false;
  set local role authenticated;
  begin perform 1 from public.weight_baseline_shadow;
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'owner reads shadow'); end if;
  denied := false;
  set local role authenticated;
  begin
    insert into public.weight_baseline_shadow
      (weight_entry_id, bird_id, measured_at, grams, meal_state, learned, tier, reweigh, hard_loss,
       sudden_reweigh, sudden_confirmed, has_ideal, tier_with_ideal, reweigh_with_ideal, rules_version)
    values (w2, b, now(), 91, 'unlabeled', false, 'learning', false, false, false, false, false, 'learning', false, 'x');
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'owner writes shadow'); end if;
  denied := false;
  set local role anon;
  begin perform 1 from public.weight_baseline_shadow;
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'anon reads shadow'); end if;

  -- 8) The pending list is the service role's only, and leaves out what's logged.
  denied := false;
  set local role authenticated;
  begin perform public.weight_baseline_shadow_pending(10);
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'pending app user'); end if;
  set local role service_role;
  select array_agg(id) into ids from public.weight_baseline_shadow_pending(2000) where bird_id = b;
  reset role;
  if ids = array[w2] then passed := passed + 1; else failed := array_append(failed, 'pending leaves out logged'); end if;

  -- 9) A card name must be one the app knows.
  denied := false;
  begin update public.weight_baseline_shadow set card = 'call_vet_today' where weight_entry_id = w1;
  exception when check_violation then denied := true;
  end;
  if denied then passed := passed + 1; else failed := array_append(failed, 'card names'); end if;

  -- 10) Deleting a weigh-in keeps what was logged; deleting the bird removes both tables' rows.
  delete from public.weight_entries where id = w1;
  select count(*) into n from public.weight_baseline_shadow where weight_entry_id = w1;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'weigh-in deletion keeps log'); end if;
  delete from public.birds where id = b;
  select (select count(*) from public.weight_baseline_shadow where bird_id = b)
       + (select count(*) from public.bird_ideal_weights where bird_id = b) into n;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'bird deletion'); end if;

  -- 11) The screens' switch is still off.
  select count(*) into n from public.health_features where feature = 'weight_baseline' and audience = 'off';
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'switch off'); end if;

  raise exception 'WEIGHT BASELINE SHADOW CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
