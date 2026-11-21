-- Verification for 20261108150000_diet_conversion_vet_guidance.
--
-- Self-contained and leaves nothing behind: a member with a cockatiel, a
-- lorikeet and a "Rainbow lory", and a stranger. Checks the vet card's answer
-- is saved on Diet conversion only, "Remind me later", that lories and
-- lorikeets can't start Diet conversion (other journeys are fine), and the
-- "How to make it work" tips. Then rolls back.
--   "DIET VET GUIDANCE CHECKS: n passed, 0 failed"           → all good
--   "DIET VET GUIDANCE CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  fm uuid := gen_random_uuid();
  st uuid := gen_random_uuid();
  bc uuid := gen_random_uuid();  -- cockatiel
  bl uuid := gen_random_uuid();  -- lorikeet
  br uuid := gen_random_uuid();  -- "Rainbow lory"
  jd uuid; js uuid; jl uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; r record;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[fm, st]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (fm, 'comp', 'active', 'manual', now() - interval '1 day'),
    (st, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values
    (bc, fm, 'Kiwi', 'Cockatiel'), (bl, fm, 'Sunny', 'Rainbow Lorikeet'), (br, fm, 'Pip', 'Black-capped lory');
  update public.journey_settings set audience = 'everyone';

  -- 1) The vet card's answer is saved on a Diet conversion journey; the
  --    milestone-2 card's "Yes, we've talked" changes it; "Remind me later"
  --    hides the card for three days.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jd := public.journey_start(bc, 'diet-conversion', null, null, null, 'most_days', 'private', null);
  perform public.journey_set_vet_check(jd, 'will_call');
  select vet_check, vet_remind_after into r from public.journeys where id = jd;
  ok := r.vet_check = 'will_call' and r.vet_remind_after is null;
  perform public.journey_set_vet_check(jd, 'remind_later');
  select vet_check, vet_remind_after into r from public.journeys where id = jd;
  ok := ok and r.vet_check = 'will_call' and r.vet_remind_after between now() + interval '71 hours' and now() + interval '73 hours';
  perform public.journey_set_vet_check(jd, 'talked');
  select vet_check, vet_remind_after into r from public.journeys where id = jd;
  ok := ok and r.vet_check = 'talked' and r.vet_remind_after is null;
  denied := false; begin perform public.journey_set_vet_check(jd, 'maybe'); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'vet card answer saved; remind later'); end if;

  -- 2) Diet conversion only, and only the bird's household.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  js := public.journey_start(bc, 'step-up', null, null, null, 'most_days', 'private', null);
  denied := false; begin perform public.journey_set_vet_check(js, 'talked'); exception when invalid_parameter_value then denied := true; end; ok := denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.journey_set_vet_check(jd, 'will_call'); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  ok := ok and (select vet_check from public.journeys where id = jd) = 'talked' and (select vet_check from public.journeys where id = js) is null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'vet answer: Diet conversion and household only'); end if;

  -- 3) Lories and lorikeets can't start Diet conversion; other journeys are fine.
  perform set_config('request.jwt.claims', json_build_object('sub', fm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform public.journey_start(bl, 'diet-conversion', null, null, null, 'most_days', 'private', null); exception when invalid_parameter_value then denied := true; end; ok := denied;
  denied := false; begin perform public.journey_start(br, 'diet-conversion', null, null, null, 'most_days', 'private', null); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  jl := public.journey_start(bl, 'step-up', null, null, null, 'most_days', 'private', null);
  reset role;
  ok := ok and jl is not null and not exists (select 1 from public.journeys j join public.journey_templates t on t.id = j.template_id where t.slug = 'diet-conversion' and j.bird_id in (bl, br))
    and private.is_nectar_eater('Rainbow lorikeet') and private.is_nectar_eater('Chattering Lory') and private.is_nectar_eater('lories')
    and not private.is_nectar_eater('Cockatiel') and not private.is_nectar_eater(null);
  if ok then passed := passed + 1; else failed := array_append(failed, 'lories and lorikeets blocked from Diet conversion'); end if;

  -- 4) "How to make it work": the new first tip, the six added, still draft.
  select tips, review_status into r from public.journey_templates where slug = 'diet-conversion';
  ok := r.tips[1] = 'Offer the new food first thing in the morning, with the usual food alongside.'
    and array_length(r.tips, 1) = 11
    and 'Weigh in grams at the same time every day. A few grams matter on a bird.' = any (r.tips)
    and 'How much to feed varies from bird to bird, even within a species. Your vet can tell you what''s right for yours.' = any (r.tips)
    and r.review_status = 'draft';
  if ok then passed := passed + 1; else failed := array_append(failed, 'how to make it work tips'); end if;

  raise exception 'DIET VET GUIDANCE CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
