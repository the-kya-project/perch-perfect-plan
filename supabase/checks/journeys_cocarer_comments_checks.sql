-- Verification for backlog 1.20f (20261126180000_journeys_cocarer_read_comments):
-- a bird's household reads, but never writes, the comments on that bird's
-- journeys without a Flock membership, and nobody else gains anything.
--
--   1. The free co-carer reads the comments (list, count, photo ref) on a
--      community journey and on a "Just me" one of the bird they share.
--   2. ...and can't comment, reply, react to or report one.
--   3. A free account with no access to the bird still reads nothing, and so
--      does the co-carer on another member's bird.
--   4. Moderation and blocks still apply: a comment hidden by reports, or one
--      whose author left the Flock, isn't shown to the co-carer.
--   5. Journeys off for them (journey_settings.audience = 'off'): nothing.
--
-- Self-contained and leaves nothing behind: raises so the block rolls back.
--   "COCARER COMMENTS CHECKS: n passed, 0 failed"           → all good
--   "COCARER COMMENTS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  m1 uuid := gen_random_uuid();  -- Flock member, owns Kiwi
  m2 uuid := gen_random_uuid();  -- another Flock member (comments)
  m3 uuid := gen_random_uuid();  -- a member who'll leave the Flock
  hh uuid := gen_random_uuid();  -- free household on Kiwi
  fr uuid := gen_random_uuid();  -- free, no access to Kiwi
  b1 uuid := gen_random_uuid();  -- m1's Kiwi
  b2 uuid := gen_random_uuid();  -- m2's Mango (hh has no access)
  jc uuid; jp uuid; jo uuid; uc uuid; up uuid; uo uuid; cc uuid; cr uuid; cp uuid; co uuid; cl uuid;
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[m1, m2, m3, hh, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at) values
    (m1, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m2, 'comp', 'active', 'manual', now() - interval '1 day'),
    (m3, 'comp', 'active', 'manual', now() - interval '1 day');
  insert into public.birds (id, owner_id, name, species) values (b1, m1, 'Kiwi', 'Cockatiel'), (b2, m2, 'Mango', 'Sun conure');
  insert into public.bird_members (bird_id, user_id, role) values (b1, hh, 'household') on conflict do nothing;
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (m1, 'Alex R.', 'great-lakes', now()), (m2, 'Robin P.', 'great-lakes', now()), (m3, 'Sam T.', 'great-lakes', now());
  insert into public.clip_assets (uid, bird_id) values ('cocarer00001', b1), ('cocarer00002', b1), ('cocarer00003', b2);
  update public.journey_settings set audience = 'everyone';

  -- Kiwi: a community journey and a "Just me" one, each with an update.
  -- Mango (m2's): a community journey hh has no part in.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  jc := public.journey_start(b1, 'recall', null, null, null, 'most_days', 'community', null);
  uc := public.journey_post_update(jc, 'cfstream:cocarer00001', 'all_in', 'First recall!');
  jp := public.journey_start(b1, 'step-up', null, null, null, 'most_days', 'private', null);
  up := public.journey_post_update(jp, 'cfstream:cocarer00002', 'all_in', 'Stepped up.');
  cp := public.flock_comment_create('journey_update', up, null, 'Note to self: try the perch.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cc := public.flock_comment_create('journey_update', uc, null, 'Walnuts, always.');
  jo := public.journey_start(b2, 'wave', null, null, null, 'most_days', 'community', null);
  uo := public.journey_post_update(jo, 'cfstream:cocarer00003', 'all_in', 'Waving!');
  co := public.flock_comment_create('journey_update', uo, null, 'Mango says hi.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cr := public.flock_comment_create('journey_update', uc, cc, 'Thanks!');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cl := public.flock_comment_create('journey_update', uc, null, 'Lovely.');
  reset role;
  update public.flock_comments set photo_path = m2::text || '/' || gen_random_uuid()::text || '.jpg' where id = cc;

  -- Control: a free account can't use the Flock at all.
  ok := not private.can_use_flock(hh) and not private.can_use_flock(fr);
  if ok then passed := passed + 1; else failed := array_append(failed, 'setup: hh and fr are free'); end if;

  -- 1) The co-carer reads: list (with the reply), counts and the photo ref.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.flock_comments_for('journey_update', uc) where comment_id = cc)
    and exists (select 1 from public.flock_comments_for('journey_update', uc) where comment_id = cr)
    and exists (select 1 from public.flock_comments_for('journey_update', up) where comment_id = cp)
    and (select comment_count from public.flock_comment_counts('journey_update', array[uc]) where subject_id = uc) = 3
    and exists (select 1 from public.flock_comment_counts('journey_update', array[up]) where subject_id = up)
    and exists (select 1 from public.flock_media_refs(null, array[cc]) where subject_id = cc);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-carer reads comments, counts and photos'); end if;

  -- 2) ...and writes nothing: comment, reply, react, report.
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin perform public.flock_comment_create('journey_update', uc, null, 'Nice!'); exception when others then n := n + 1; end;
  begin perform public.flock_comment_create('journey_update', uc, cc, 'Agreed.'); exception when others then n := n + 1; end;
  begin perform public.flock_react('comment', cc, 'great_job', true); exception when others then n := n + 1; end;
  begin perform public.flock_report('comment', cc, 'spam', null); exception when others then n := n + 1; end;
  reset role;
  ok := n = 4
    and (select count(*) from public.flock_comments where author_id = hh) = 0
    and not exists (select 1 from public.flock_reactions where user_id = hh)
    and not exists (select 1 from public.flock_reports where reporter_id = hh);
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-carer can''t comment, reply, react or report'); end if;

  -- 3) Nobody else gains: a free stranger reads nothing on Kiwi, and the
  --    co-carer reads nothing on Mango (not their bird).
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin select count(*) into n from public.flock_comments_for('journey_update', uc); exception when insufficient_privilege or no_data_found then n := 0; end;
  ok := n = 0 and not exists (select 1 from public.flock_comment_counts('journey_update', array[uc, up]))
    and not exists (select 1 from public.flock_media_refs(null, array[cc]));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := 0;
  begin select count(*) into n from public.flock_comments_for('journey_update', uo); exception when insufficient_privilege or no_data_found then n := 0; end;
  ok := ok and n = 0 and not exists (select 1 from public.flock_comment_counts('journey_update', array[uo]));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'nobody outside the household gains anything'); end if;

  -- 4) Moderation and membership still apply: a hidden comment and one whose
  --    author left the Flock aren't shown.
  insert into public.flock_moderation (subject_type, subject_id, state) values ('comment', cr, 'removed')
    on conflict do nothing;
  delete from public.entitlements where user_id = m3;
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := exists (select 1 from public.flock_comments_for('journey_update', uc) where comment_id = cc)
    and not exists (select 1 from public.flock_comments_for('journey_update', uc) where comment_id in (cr, cl));
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-carer: hidden and departed comments stay hidden'); end if;

  -- 5) Journeys off: the co-carer reads nothing.
  update public.journey_settings set audience = 'off';
  perform set_config('request.jwt.claims', json_build_object('sub', hh, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform * from public.flock_comments_for('journey_update', uc); exception when insufficient_privilege or no_data_found then denied := true; end;
  n := 0;
  begin select count(*) into n from public.flock_comment_counts('journey_update', array[uc]); exception when insufficient_privilege then n := 0; end;
  ok := denied and n = 0;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'journeys off: co-carer reads nothing'); end if;

  raise exception 'COCARER COMMENTS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
