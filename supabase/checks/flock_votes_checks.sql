-- Verification for 20261123160000_flock_votes (backlog 1.8).
--
-- Self-contained and leaves nothing behind: an admin; a founding member (fd);
-- twelve Flock members (m[1..12]); a free user. Checks who sees drafts, open
-- and founders-only votes, voting and changing a vote, that nobody sees who's
-- winning before it closes, the "too few votes" rule, results and the
-- announcement after closing, the admin's open / close early / extend /
-- delete, and that no app user can read anyone's ballot, then rolls back.
--   "FLOCK VOTES CHECKS: n passed, 0 failed"           → all good
--   "FLOCK VOTES CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();
  fd uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  m uuid[] := array(select gen_random_uuid() from generate_series(1, 12));
  v1 uuid; v2 uuid; v3 uuid; vf uuid; vd uuid;
  c1 uuid[]; c2 uuid[]; cf uuid[];
  r record;
  passed int := 0; failed text[] := '{}';
  ok boolean; denied boolean; msg text; i int;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, fd, fr] || m) as x;
  insert into public.entitlements (user_id, plan, status, source, starts_at)
  select x, 'comp', 'active', 'manual', now() - interval '1 day' from unnest(array[fd] || m) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.founding_claims (user_id, spot_number, region_slug) values (fd, 49, 'great-lakes');

  -- The admin writes a draft with three choices, a founders-only vote, and a
  -- draft that stays a draft.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v1 := public.admin_vote_save(null, ' Where should this quarter''s donation go? ', '20% of every membership goes to rescue and conservation partners. Pick one.',
    'members', now() + interval '7 days',
    '[{"name": "The Macaw Society", "blurb": "Protects wild macaw nests."}, {"name": "Birds and Beaks Rescue"}, {"name": "Armonía", "blurb": "Saves the blue-throated macaw."}]'::jsonb);
  vf := public.admin_vote_save(null, 'Which expert Q&A first?', null, 'founders', now() + interval '7 days',
    '[{"name": "Avian vet Q&A"}, {"name": "Behaviorist Q&A"}]'::jsonb);
  vd := public.admin_vote_save(null, 'Still a draft', null, 'members', now() + interval '7 days', '[{"name": "Only one"}]'::jsonb);
  reset role;
  select array_agg(id order by position) into c1 from public.flock_vote_choices where vote_id = v1;
  select array_agg(id order by position) into cf from public.flock_vote_choices where vote_id = vf;

  -- 1) Free users, visitors and direct access get nothing; members can't use
  --    the admin functions.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := true;
  denied := false; begin perform * from public.flock_votes_current(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_vote(v1); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.flock_vote_cast(v1, c1[1]); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_votes; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  set local role anon;
  denied := false; begin perform * from public.flock_votes_current(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false; begin perform * from public.admin_votes(); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_vote_save(null, 'Mine', null, 'members', now() + interval '1 day', '[]'::jsonb); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_vote_open(v1); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform 1 from public.flock_vote_choices; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin insert into public.flock_vote_ballots (vote_id, user_id, choice_id) values (v1, m[1], c1[1]); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free users, visitors, direct access and non-admins get nothing'); end if;

  -- 2) Drafts are for admins only; opening needs two choices and a close
  --    date still ahead.
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_votes_current()) = 0 and (select count(*) from public.flock_vote(v1)) = 0;
  denied := false; begin perform public.flock_vote_cast(v1, c1[1]); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select state = 'draft' and question = 'Where should this quarter''s donation go?' and jsonb_array_length(choices) = 3 from public.flock_vote(v1))
    and (select count(*) from public.admin_votes()) = 3
    and (select count(*) from public.flock_votes_current()) = 0;
  denied := false; begin perform public.admin_vote_open(vd); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_vote_save(null, '   ', null, 'members', now() + interval '1 day', '[]'::jsonb); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_vote_save(null, 'Q', null, 'everyone', now() + interval '1 day', '[]'::jsonb); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_vote_save(null, 'Q', null, 'members', now() + interval '1 day',
    '[{"name":"1"},{"name":"2"},{"name":"3"},{"name":"4"},{"name":"5"},{"name":"6"},{"name":"7"},{"name":"8"},{"name":"9"}]'::jsonb); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  v3 := public.admin_vote_save(null, 'Closes in the past', null, 'members', now() - interval '1 hour', '[{"name": "A"}, {"name": "B"}]'::jsonb);
  denied := false; begin perform public.admin_vote_open(v3); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  perform public.admin_vote_open(v1);
  perform public.admin_vote_open(vf);
  denied := false; begin perform public.admin_vote_open(v1); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  -- Once open, the question and choices are locked; deleting is for drafts.
  denied := false; begin perform public.admin_vote_save(v1, 'Changed', null, 'members', now() + interval '7 days', '[{"name": "X"}, {"name": "Y"}]'::jsonb); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  denied := false; begin perform public.admin_vote_delete(v1); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  perform public.admin_vote_delete(v3);
  reset role;
  ok := ok and not exists (select 1 from public.flock_votes where id = v3)
    and (select status = 'open' and opened_at is not null from public.flock_votes where id = v1);
  if ok then passed := passed + 1; else failed := array_append(failed, 'drafts stay with admins; opening needs 2 choices and a future date'); end if;

  -- 3) Members see an open vote: question, choices in order, how many voted,
  --    but no percentages, counts or winner. A founders-only vote shows to
  --    founders (and admins) only.
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_vote(v1);
  ok := r.state = 'open' and r.voters = 0 and r.my_choice is null and r.announcement is null and not r.too_few
    and (select array_agg(e->>'name' order by o) from jsonb_array_elements(r.choices) with ordinality as x(e, o)) = array['The Macaw Society', 'Birds and Beaks Rescue', 'Armonía']
    and not exists (select 1 from jsonb_array_elements(r.choices) e where e->>'percent' is not null or e->>'votes' is not null or (e->>'winner')::boolean);
  ok := ok and (select array_agg(vote_id) from public.flock_votes_current()) = array[v1]
    and (select count(*) from public.flock_vote(vf)) = 0;
  denied := false; begin perform public.flock_vote_cast(vf, cf[1]); exception when no_data_found then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fd, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select count(*) from public.flock_votes_current()) = 2
    and (select audience = 'founders' from public.flock_vote(vf));
  perform public.flock_vote_cast(vf, cf[2]);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'members see open votes without results; founders-only for founders'); end if;

  -- 4) One ballot per member, which they can change; a choice from another
  --    vote is refused; my_choice is only ever the caller's own.
  for i in 1..5 loop
    perform set_config('request.jwt.claims', json_build_object('sub', m[i], 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.flock_vote_cast(v1, c1[1]);
    reset role;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', m[5], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.flock_vote_cast(v1, c1[2]);
  ok := (select voters = 5 and my_choice = c1[2] from public.flock_vote(v1));
  denied := false; begin perform public.flock_vote_cast(v1, cf[1]); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m[6], 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and (select voters = 5 and my_choice is null from public.flock_vote(v1));
  reset role;
  ok := ok and (select count(*) from public.flock_vote_ballots where vote_id = v1) = 5
    and (select count(*) from public.flock_vote_ballots where vote_id = v1 and user_id = m[5] and choice_id = c1[2]) = 1;
  if ok then passed := passed + 1; else failed := array_append(failed, 'one ballot each, changeable, own choice only'); end if;

  -- 5) Admins see the counts at any time; nobody, admins included, can read
  --    the ballots themselves.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_vote(v1);
  ok := (select array_agg((e->>'votes')::int order by o) from jsonb_array_elements(r.choices) with ordinality as x(e, o)) = array[4, 1, 0]
    and not exists (select 1 from jsonb_array_elements(r.choices) e where e->>'percent' is not null)
    and (select voters from public.admin_votes() where vote_id = v1) = 5;
  denied := false; begin perform 1 from public.flock_vote_ballots; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'admins see counts; ballots are private'); end if;

  -- 6) Closing early with fewer than 10 voters: "too few votes to share";
  --    members get no percentages or winner, admins still see the counts;
  --    voting after it closes is refused; the announcement shows only now.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_vote_announce(v1, 'Thank you for voting.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select announcement is null from public.flock_vote(v1));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_vote_close(v1);
  denied := false; begin perform public.admin_vote_close(v1); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  ok := ok and (select too_few and (choices->0->>'votes')::int = 4 from public.flock_vote(v1));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_vote(v1);
  ok := ok and r.state = 'closed' and r.too_few and r.announcement = 'Thank you for voting.'
    and not exists (select 1 from jsonb_array_elements(r.choices) e where e->>'percent' is not null or e->>'votes' is not null or (e->>'winner')::boolean)
    and exists (select 1 from public.flock_votes_current() where vote_id = v1 and state = 'closed');
  msg := null;
  begin perform public.flock_vote_cast(v1, c1[3]); exception when raise_exception then get stacked diagnostics msg = message_text; end;
  ok := ok and msg = 'vote_closed';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'under 10 voters: too few to share'); end if;

  -- 7) With 10 or more voters, closing (here by the date passing) shows
  --    percentages and the winner to everyone, but counts only to admins.
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v2 := public.admin_vote_save(null, 'Which chapter first?', null, 'members', now() + interval '1 day', '[{"name": "Great Lakes"}, {"name": "Texas"}]'::jsonb);
  perform public.admin_vote_open(v2);
  -- Extend: only to a later date, and only while open.
  denied := false; begin perform public.admin_vote_extend(v2, now() + interval '1 hour'); exception when invalid_parameter_value then denied := true; end; ok := denied;
  perform public.admin_vote_extend(v2, now() + interval '3 days');
  denied := false; begin perform public.admin_vote_extend(v1, now() + interval '9 days'); exception when invalid_parameter_value then denied := true; end; ok := ok and denied;
  reset role;
  ok := ok and (select closes_at > now() + interval '2 days' from public.flock_votes where id = v2);
  select array_agg(id order by position) into c2 from public.flock_vote_choices where vote_id = v2;
  for i in 1..11 loop
    perform set_config('request.jwt.claims', json_build_object('sub', m[i], 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.flock_vote_cast(v2, case when i <= 7 then c2[1] else c2[2] end);
    reset role;
  end loop;
  update public.flock_votes set closes_at = now() - interval '1 minute' where id = v2;
  perform set_config('request.jwt.claims', json_build_object('sub', m[12], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.flock_vote(v2);
  ok := ok and r.state = 'closed' and not r.too_few and r.voters = 11
    and (select array_agg((e->>'percent')::int order by o) from jsonb_array_elements(r.choices) with ordinality as x(e, o)) = array[64, 36]
    and (select array_agg((e->>'winner')::boolean order by o) from jsonb_array_elements(r.choices) with ordinality as x(e, o)) = array[true, false]
    and not exists (select 1 from jsonb_array_elements(r.choices) e where e->>'votes' is not null);
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, '10+ voters: percentages and the winner after closing'); end if;

  -- 8) Closed votes leave Do good after flock_vote_results_days(); the vote
  --    itself stays readable by its link.
  update public.flock_votes set closes_at = now() - make_interval(days => private.flock_vote_results_days() + 1) where id = v1;
  perform set_config('request.jwt.claims', json_build_object('sub', m[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := not exists (select 1 from public.flock_votes_current() where vote_id = v1)
    and exists (select 1 from public.flock_votes_current() where vote_id = v2)
    and (select count(*) from public.flock_vote(v1)) = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'closed votes leave Do good after a while'); end if;

  -- 9) Deleting an account removes its ballots (and the count with them).
  delete from auth.users where id = m[11];
  ok := (select count(*) from public.flock_vote_ballots where vote_id = v2) = 10;
  if ok then passed := passed + 1; else failed := array_append(failed, 'account deletion removes ballots'); end if;

  raise exception 'FLOCK VOTES CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
