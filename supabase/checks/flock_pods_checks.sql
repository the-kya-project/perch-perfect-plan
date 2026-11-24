-- Verification for 20261124070000_flock_buddy_pods (backlog 1.11).
--
-- Self-contained and leaves nothing behind: an admin; members a, b, c, d, e
-- (Great Lakes) and t (Texas); k (has blocked a); a free user. Checks that
-- nobody outside the Flock reads anything, that a pod forms once 3 are
-- waiting (never with someone blocked), that later waiters fill a pod with
-- room, the 2-pod limit, that pod posts reach only the pod (never Today),
-- that "Just me" progress stays in the household, leaving, "Keep going
-- together?", the 3-week rule and its new-pod offer, the admin tools, and
-- account deletion, then rolls back.
--   "FLOCK PODS CHECKS: n passed, 0 failed"           → all good
--   "FLOCK PODS CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  d uuid := gen_random_uuid();
  e uuid := gen_random_uuid();
  tx uuid := gen_random_uuid();
  k uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  ba uuid := gen_random_uuid(); bb uuid := gen_random_uuid(); bc uuid := gen_random_uuid();
  bd uuid := gen_random_uuid(); be uuid := gen_random_uuid(); bt uuid := gen_random_uuid(); bk uuid := gen_random_uuid();
  step uuid; recall uuid; wave uuid;
  ja uuid; jb uuid; jc uuid; jd uuid; je uuid; jt uuid; jk uuid; ja2 uuid; ja3 uuid;
  pod uuid; pod2 uuid; old uuid; post uuid; st text;
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; n int;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, a, b, c, d, e, tx, k, fr]) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[a, b, c, d, e, tx, k]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.birds (id, owner_id, name, species) values
    (ba, a, 'Kiwi', 'Cockatiel'), (bb, b, 'Mango', 'Sun conure'), (bc, c, 'Pepper', 'Budgie'),
    (bd, d, 'Biscuit', 'Lovebird'), (be, e, 'Juno', 'Quaker'), (bt, tx, 'Rio', 'Caique'), (bk, k, 'Sky', 'Budgie');
  insert into public.flock_profiles (user_id, display_name, region_slug, setup_completed_at) values
    (ad, 'Kya team', 'great-lakes', now()), (a, 'Alex R.', 'great-lakes', now()), (b, 'Blake S.', 'great-lakes', now()),
    (c, 'Casey T.', 'great-lakes', now()), (d, 'Dana W.', 'great-lakes', now()), (e, 'Eli P.', 'great-lakes', now()),
    (tx, 'Taylor M.', 'texas', now()), (k, 'Kai L.', 'great-lakes', now());
  -- a shows Kiwi; b keeps Mango hidden.
  insert into public.flock_shown_birds (user_id, bird_id, shown) values (a, ba, true), (b, bb, false);
  insert into public.flock_blocks (blocker_id, blocked_id) values (k, a);
  select id into step from public.journey_templates where slug = 'step-up';
  select id into recall from public.journey_templates where slug = 'recall';
  select id into wave from public.journey_templates where slug = 'wave';
  insert into public.journeys (bird_id, created_by, template_id, visibility, rhythm) values (ba, a, step, 'community', 'most_days') returning id into ja;
  insert into public.journeys (bird_id, created_by, template_id, visibility, rhythm) values (bb, b, step, 'private', 'most_days') returning id into jb;
  insert into public.journeys (bird_id, created_by, template_id, visibility, rhythm) values (bc, c, step, 'community', 'most_days') returning id into jc;
  insert into public.journeys (bird_id, created_by, template_id, visibility, rhythm) values (bd, d, step, 'community', 'most_days') returning id into jd;
  insert into public.journeys (bird_id, created_by, template_id, visibility, rhythm) values (be, e, step, 'community', 'most_days') returning id into je;
  insert into public.journeys (bird_id, created_by, template_id, visibility, rhythm) values (bt, tx, step, 'community', 'most_days') returning id into jt;
  insert into public.journeys (bird_id, created_by, template_id, visibility, rhythm) values (bk, k, step, 'community', 'most_days') returning id into jk;
  insert into public.journeys (bird_id, created_by, template_id, visibility, rhythm) values (ba, a, recall, 'community', 'most_days') returning id into ja2;
  insert into public.journeys (bird_id, created_by, template_id, visibility, rhythm) values (ba, a, wave, 'community', 'most_days') returning id into ja3;
  insert into public.journey_milestones (journey_id, position, title, state, reached_at) values
    (ja, 1, 'Steps up from the perch', 'reached', now()), (ja, 2, 'Steps up from the floor', 'todo', null),
    (jb, 1, 'Steps up from the perch', 'reached', now()), (jb, 2, 'Steps up from the floor', 'todo', null);

  -- 1) Free users, visitors and direct access get nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  denied := false; begin perform * from public.flock_my_pods(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_pod_can_wait(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_pods; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_pod_members; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_pod_waitlist; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  set local role anon;
  denied := false; begin perform * from public.flock_my_pods(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform 1 from public.flock_pods; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.admin_pods(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  -- Someone else's journey can't be put on the waitlist.
  denied := false; begin perform * from public.flock_pod_wait(jb); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free users, visitors, direct reads and other people''s journeys get nothing'); end if;

  -- 2) a and k wait: k has blocked a, so no pod; b makes 2 compatible with a.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.state into st from public.flock_pod_wait(ja) x;
  ok := st = 'waiting';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.state into st from public.flock_pod_wait(jk) x;
  ok := ok and st = 'waiting';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.state into st from public.flock_pod_wait(jb) x;
  ok := ok and st = 'waiting';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- "2 so far": a and b (k is blocked either way, so not counted for a).
  ok := ok and (select x.state = 'waiting' and x.waiting = 2 from public.flock_pod_for_journey(ja) x);
  reset role;
  ok := ok and not exists (select 1 from public.flock_pods where template_id = step);
  if ok then passed := passed + 1; else failed := array_append(failed, 'no pod until 3 are waiting, and blocks don''t count'); end if;

  -- Everything here runs in one transaction, so every wait has the same
  -- created_at and placement's "oldest first" would fall to the random ids.
  -- Give the waits the order they happened in (a, then k, then b), as they
  -- would have outside a test; otherwise k sorts first about a third of the
  -- time and the pod forms without a.
  update public.flock_pod_waitlist w
  set created_at = now() - case w.user_id when a then interval '3 minutes' when k then interval '2 minutes' else interval '1 minute' end
  where w.user_id in (a, k, b);

  -- 3) c waits: a pod forms with a, b and c (never k), in Great Lakes.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.state, x.pod_id into st, pod from public.flock_pod_wait(jc) x;
  reset role;
  ok := st = 'pod' and pod is not null
    and (select array_agg(user_id order by user_id) from public.flock_pod_members where pod_id = pod) = (select array_agg(x order by x) from unnest(array[a, b, c]) x)
    and (select region_slug from public.flock_pods where id = pod) = 'great-lakes'
    and exists (select 1 from public.flock_pod_waitlist where user_id = k)
    and not exists (select 1 from public.flock_pod_waitlist where user_id in (a, b, c));
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select x.state = 'pod' and x.pod_id = pod from public.flock_pod_for_journey(ja) x);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'a pod forms at 3, never with a blocked member'); end if;

  -- 4) What members see: names, a shown bird, community progress; b's
  --    "Just me" progress and hidden bird stay out (b sees their own).
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_pod_members(pod)) = 3
    and (select is_me and bird_name = 'Kiwi' and done = 1 and total = 2 from public.flock_pod_members(pod) where user_id = a)
    and (select display_name = 'Blake S.' and bird_name is null and done is null and total is null and finished is null
         from public.flock_pod_members(pod) where user_id = b)
    and (select member_count = 3 and region_name = 'Great Lakes' and template_slug = 'step-up' and not checked_in_this_week from public.flock_pod(pod));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select done = 1 and total = 2 and bird_name = 'Mango' from public.flock_pod_members(pod) where user_id = b);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_pod_members(pod)) = 0 and (select count(*) from public.flock_pod(pod)) = 0;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'members see the pod, "Just me" progress stays private, outsiders see nothing'); end if;

  -- 5) A pod post reaches the pod only, never Today; outsiders can't post.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.post_id into post from public.flock_pod_post_create(pod, null, 'Kiwi stepped up from the floor today!', '{}', null, false) x;
  ok := (select checked_in_this_week from public.flock_pod(pod));
  reset role;
  ok := ok and (select space = 'pod' and pod_id = pod and status = 'live' from public.flock_posts where id = post);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_pod_feed(pod) where post_id = post) = 1
    and (select count(*) from public.flock_feed('everything') where post_id = post) = 0
    and (select count(*) from public.flock_post(post)) = 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_post(post)) = 0 and (select count(*) from public.flock_pod_feed(pod)) = 0;
  denied := false; begin perform * from public.flock_pod_post_create(pod, null, 'Hi!', '{}', null, false); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_feed('everything') where post_id = post) = 0;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'pod posts reach only the pod'); end if;

  -- 6) d waits: joins the pod with room. Texas waits: joins it too (no
  --    Texas pod yet), and the pod no longer names one chapter.
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.state, x.pod_id into st, pod2 from public.flock_pod_wait(jd) x;
  reset role;
  ok := st = 'pod' and pod2 = pod and private.flock_pod_size(pod) = 4 and (select region_slug from public.flock_pods where id = pod) = 'great-lakes';
  perform set_config('request.jwt.claims', json_build_object('sub', tx, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.state, x.pod_id into st, pod2 from public.flock_pod_wait(jt) x;
  reset role;
  ok := ok and st = 'pod' and pod2 = pod and private.flock_pod_size(pod) = 5 and (select region_slug from public.flock_pods where id = pod) is null;
  if ok then passed := passed + 1; else failed := array_append(failed, 'later waiters fill a pod with room'); end if;

  -- 7) Up to 2 at once: a (one pod) can wait on one more journey, not two.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.state into st from public.flock_pod_wait(ja2) x;
  ok := st = 'waiting' and not public.flock_pod_can_wait();
  denied := false; begin perform * from public.flock_pod_wait(ja3); exception when others then denied := sqlerrm = 'pod_limit'; end; ok := ok and denied;
  ok := ok and (select count(*) from public.flock_my_pods()) = 2;
  perform public.flock_pod_unwait(ja2);
  ok := ok and public.flock_pod_can_wait() and (select count(*) from public.flock_my_pods()) = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'up to two pods at once, and leaving the waitlist'); end if;

  -- 8) Leaving is quiet: d and Texas leave; d no longer reads the pod.
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_pod_leave(pod);
  ok := (select count(*) from public.flock_pod_feed(pod)) = 0 and (select count(*) from public.flock_pod(pod)) = 0;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', tx, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_pod_leave(pod);
  reset role;
  ok := ok and private.flock_pod_size(pod) = 3 and (select status from public.flock_pods where id = pod) = 'active';
  if ok then passed := passed + 1; else failed := array_append(failed, 'leaving a pod'); end if;

  -- 9) a finishes: "You finished!" for a, the pod stays open. Then b and c
  --    finish: the pod asks "Keep going together?"; a and b say yes, c no →
  --    a general buddy group of a and b, not tied to a journey.
  update public.journeys set status = 'finished', finished_at = now() where id = ja;
  perform private.flock_pods_tick();
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select my_finished and status = 'active' from public.flock_pod(pod));
  perform public.flock_pod_finished_seen(pod);
  ok := ok and not (select my_finished from public.flock_pod(pod));
  reset role;
  update public.journeys set status = 'finished', finished_at = now() where id in (jb, jc);
  perform private.flock_pods_tick();
  ok := ok and (select status from public.flock_pods where id = pod) = 'asking';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select asking_me from public.flock_pod(pod));
  perform public.flock_pod_keep_going(pod, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_pod_keep_going(pod, true);
  reset role;
  ok := ok and (select status from public.flock_pods where id = pod) = 'asking';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_pod_keep_going(pod, false);
  reset role;
  ok := ok and (select kind = 'group' and status = 'active' from public.flock_pods where id = pod)
    and private.flock_pod_size(pod) = 2
    and not exists (select 1 from public.flock_pod_members where pod_id = pod and left_at is null and journey_id is not null)
    and (select left_at is not null from public.flock_pod_members where pod_id = pod and user_id = c);
  if ok then passed := passed + 1; else failed := array_append(failed, 'finishing, then "Keep going together?"'); end if;

  -- 10) The 3-week rule: a pod with fewer than 2 active members over 21 days
  --     is dissolved; e (not finished) is offered a new pod and can ask again.
  insert into public.flock_pods (template_id, created_at) values (step, now() - interval '30 days') returning id into old;
  insert into public.flock_pod_members (pod_id, user_id, journey_id, joined_at) values
    (old, e, je, now() - interval '30 days'), (old, d, jd, now() - interval '30 days');
  -- d posted recently, e didn't: one active member.
  insert into public.flock_posts (author_id, space, pod_id, body, status) values (d, 'pod', old, 'Still here!', 'live');
  perform private.flock_pods_tick();
  ok := (select status from public.flock_pods where id = old) = 'dissolved'
    and (select offered_new from public.flock_pod_members where pod_id = old and user_id = e);
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select x.state = 'offer' and x.can_wait from public.flock_pod_for_journey(je) x)
    -- An ended pod stays readable to its members.
    and (select count(*) from public.flock_pod_feed(old)) = 1;
  denied := false; begin perform * from public.flock_pod_post_create(old, null, 'Hello?', '{}', null, false); exception when others then denied := sqlerrm = 'pod_closed'; end; ok := ok and denied;
  select x.state into st from public.flock_pod_wait(je) x;
  reset role;
  ok := ok and st = 'waiting' and not (select offered_new from public.flock_pod_members where pod_id = old and user_id = e);
  if ok then passed := passed + 1; else failed := array_append(failed, 'the 3-week rule, and a new pod offered'); end if;

  -- 11) A group that goes quiet for 3 weeks just ends (no new question).
  update public.flock_pods set group_since = now() - interval '30 days', created_at = now() - interval '60 days' where id = pod;
  update public.flock_pod_members set joined_at = now() - interval '60 days' where pod_id = pod;
  update public.flock_posts set created_at = now() - interval '30 days' where pod_id = pod;
  perform private.flock_pods_tick();
  ok := (select status from public.flock_pods where id = pod) = 'dissolved'
    and not exists (select 1 from public.flock_pod_members where pod_id = pod and offered_new);
  if ok then passed := passed + 1; else failed := array_append(failed, 'a quiet group ends'); end if;

  -- 12) Admins: see pods and the waitlist, move a member (never next to
  --     someone who blocked them), dissolve.
  insert into public.flock_pods (template_id) values (step) returning id into pod;
  insert into public.flock_pods (template_id) values (step) returning id into pod2;
  update public.journeys set status = 'active', finished_at = null where id in (ja, jc);
  insert into public.flock_pod_members (pod_id, user_id, journey_id) values (pod, a, ja), (pod, c, jc), (pod2, k, jk);
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.admin_pods()) >= 4
    and (select waiting from public.admin_pod_waitlist() where template_slug = 'step-up') >= 1
    and (select count(*) from public.admin_pod_members(pod)) = 2;
  denied := false; begin perform public.admin_pod_move(a, pod, pod2); exception when others then denied := sqlerrm = 'pod_blocked'; end; ok := ok and denied;
  perform public.admin_pod_move(c, pod, pod2);
  perform public.admin_pod_dissolve(pod2);
  reset role;
  ok := ok and private.flock_pod_member(c, pod2) and not private.flock_pod_member(c, pod)
    and (select status = 'dissolved' and ended_by = ad from public.flock_pods where id = pod2);
  if ok then passed := passed + 1; else failed := array_append(failed, 'admins see, move and dissolve'); end if;

  -- 13) Deleting an account removes its pod places and waitlist rows.
  delete from auth.users where id = e;
  ok := not exists (select 1 from public.flock_pod_members where user_id = e)
    and not exists (select 1 from public.flock_pod_waitlist where user_id = e);
  if ok then passed := passed + 1; else failed := array_append(failed, 'account deletion removes pod places'); end if;

  raise exception 'FLOCK PODS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
