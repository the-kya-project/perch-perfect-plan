-- Verification for 20261118120000_flock_library.
--
-- Self-contained and leaves nothing behind: an admin, a Flock member, a free
-- user, and signed-out access; a published resource with a cover and a PDF,
-- and a draft. Checks who can read and write the table and the bucket, that
-- the gate decides (today it's admins only, so a member reads nothing yet),
-- what happens once the gate opens to members (simulated, rolled back), the
-- kill switch, the publish rules, and search. Then rolls back.
--   "FLOCK LIBRARY CHECKS: n passed, 0 failed"           → all good
--   "FLOCK LIBRARY CHECKS: n passed, k failed: <names>"  → which ones broke
-- Run by .github/workflows/db-checks.yml on every PR (scripts/db-checks.sh).
do $$
declare
  ad uuid := gen_random_uuid();
  mb uuid := gen_random_uuid();
  fr uuid := gen_random_uuid();
  r_pub uuid; r_draft uuid; r_new uuid;
  cover text := 'covers/' || gen_random_uuid()::text || '.jpg';
  pdf   text := 'files/' || gen_random_uuid()::text || '.pdf';
  dcover text := 'covers/' || gen_random_uuid()::text || '.jpg';
  passed int := 0; failed text[] := '{}';
  ok boolean; n int; denied boolean; r record; v_at timestamptz;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', x::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[ad, mb, fr]) as x;
  insert into public.user_roles (user_id, role) values (ad, 'admin');
  insert into public.entitlements (user_id, plan, status, source, starts_at) values (mb, 'comp', 'active', 'manual', now() - interval '1 day');
  update public.flock_settings set ui_enabled = true where id;
  delete from public.library_resources;

  insert into public.library_resources (title, summary, body, resource_type, topics, species, cover_path, attachment_path, status, vet_reviewed, vet_reviewer)
  values ('Foraging for beginners', 'Start small with paper cups.', 'Fold a cup around a treat. Try 100% plain paper.', 'guide',
          array['foraging'], array['Sun conure', 'Caique'], cover, pdf, 'published', true, 'Dr. Example')
  returning id into r_pub;
  insert into public.library_resources (title, summary, resource_type, topics, cover_path, status)
  values ('Hormone season checklist', 'Not ready yet.', 'checklist', array['hormones'], dcover, 'draft')
  returning id into r_draft;
  insert into storage.objects (bucket_id, name) values ('flock-library', cover), ('flock-library', pdf), ('flock-library', dcover);

  -- 1) Signed-out visitors: no table, no functions, no files.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  denied := false; begin perform 1 from public.library_resources; exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_library_search(null, null, null, 100); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  denied := false; begin perform * from public.flock_library_resource(r_pub); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  select count(*) into n from storage.objects where bucket_id = 'flock-library'; ok := ok and n = 0;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'signed out: nothing'); end if;

  -- 2) A free user: no rows, no files, no writes, even for a published resource.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.library_resources; ok := ok and n = 0;
  select count(*) into n from public.library_resources where id = r_pub; ok := ok and n = 0;
  select count(*) into n from public.flock_library_search(null, null, null, 100); ok := ok and n = 0;
  select count(*) into n from public.flock_library_resource(r_pub); ok := ok and n = 0;
  select count(*) into n from storage.objects where bucket_id = 'flock-library'; ok := ok and n = 0;
  ok := ok and not private.can_read_library();
  denied := false; begin insert into public.library_resources (title) values ('Mine'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  update public.library_resources set title = 'Changed' where id = r_pub; get diagnostics n = row_count; ok := ok and n = 0;
  delete from public.library_resources where id = r_pub; get diagnostics n = row_count; ok := ok and n = 0;
  denied := false; begin insert into storage.objects (bucket_id, name) values ('flock-library', 'covers/' || gen_random_uuid()::text || '.jpg'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  -- Storage refuses direct SQL deletes unless this is set; set it so RLS is
  -- what's being tested (the Storage API's own delete goes through RLS too).
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'flock-library' and name = cover; get diagnostics n = row_count; ok := ok and n = 0;
  perform set_config('storage.allow_delete_query', 'false', true);
  reset role;
  ok := ok and (select title from public.library_resources where id = r_pub) = 'Foraging for beginners'
          and (select count(*) from storage.objects where bucket_id = 'flock-library') = 3;
  if ok then passed := passed + 1; else failed := array_append(failed, 'free user: nothing, and no writes'); end if;

  -- 3) The gate decides. Today it's admins only, so a Flock member reads
  --    nothing yet: no rows and no files.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and public.flock_enabled() = false and not private.can_read_library();
  select count(*) into n from public.library_resources; ok := ok and n = 0;
  select count(*) into n from public.flock_library_search(null, null, null, 100); ok := ok and n = 0;
  select count(*) into n from storage.objects where bucket_id = 'flock-library'; ok := ok and n = 0;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'gate still admins only: a member reads nothing'); end if;

  -- 4) An admin sees everything, drafts included, and the bucket's files.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and public.flock_enabled() and private.can_read_library();
  select count(*) into n from public.library_resources; ok := ok and n = 2;
  select count(*) into n from storage.objects where bucket_id = 'flock-library'; ok := ok and n = 3;
  -- Search and the detail show what members would: published only.
  select count(*) into n from public.flock_library_search(null, null, null, 100); ok := ok and n = 1;
  select count(*) into n from public.flock_library_resource(r_draft); ok := ok and n = 0;
  select * into r from public.flock_library_resource(r_pub);
  ok := ok and r.title = 'Foraging for beginners' and r.vet_reviewed and r.vet_reviewer = 'Dr. Example' and r.attachment_path = pdf;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'admin sees drafts and files; search is published only'); end if;

  -- 5) Admin writes: create, publish (stamps published_at), unpublish (keeps
  --    it), edit, delete; files in the right folders only.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.library_resources (title, summary, resource_type, topics, species)
  values ('  Step-up basics  ', 'Short sessions.', 'guide', array['training', 'diet', 'training'], array[' Cockatiel', 'cockatiel', '', 'African grey'])
  returning id into r_new;
  select * into r from public.library_resources where id = r_new;
  ok := ok and r.title = 'Step-up basics' and r.status = 'draft' and r.published_at is null
          and r.topics = array['diet', 'training'] and r.species = array['Cockatiel', 'African grey'];
  update public.library_resources set status = 'published' where id = r_new;
  select published_at into v_at from public.library_resources where id = r_new; ok := ok and v_at is not null;
  update public.library_resources set status = 'draft' where id = r_new;
  ok := ok and (select published_at from public.library_resources where id = r_new) = v_at;
  update public.library_resources set status = 'published', title = 'Step-up basics, again' where id = r_new;
  ok := ok and (select published_at from public.library_resources where id = r_new) = v_at;
  insert into storage.objects (bucket_id, name) values ('flock-library', 'files/' || gen_random_uuid()::text || '.pdf');
  denied := false; begin insert into storage.objects (bucket_id, name) values ('flock-library', 'elsewhere/x.pdf'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  delete from public.library_resources where id = r_new; get diagnostics n = row_count; ok := ok and n = 1;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'admin writes; publish stamps once'); end if;

  -- 6) Publish rules: a published resource needs a summary and a topic, and a
  --    video or link needs its URL. Drafts can be unfinished.
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.library_resources (title) values ('Just a title'); -- a draft is fine
  denied := false; begin insert into public.library_resources (title, summary, status) values ('No topic', 'x', 'published'); exception when check_violation then denied := true; end; ok := ok and denied;
  denied := false; begin insert into public.library_resources (title, topics, status) values ('No summary', array['diet'], 'published'); exception when check_violation then denied := true; end; ok := ok and denied;
  denied := false; begin insert into public.library_resources (title, summary, topics, resource_type, status) values ('A video', 'x', array['training'], 'video', 'published'); exception when check_violation then denied := true; end; ok := ok and denied;
  denied := false; begin insert into public.library_resources (title, topics) values ('Bad topic', array['pellets']); exception when check_violation then denied := true; end; ok := ok and denied;
  denied := false; begin insert into public.library_resources (title, external_url) values ('Bad link', 'javascript:alert(1)'); exception when check_violation then denied := true; end; ok := ok and denied;
  denied := false; begin insert into public.library_resources (title, cover_path) values ('Bad cover', fr::text || '/x.jpg'); exception when check_violation then denied := true; end; ok := ok and denied;
  insert into public.library_resources (title, summary, topics, resource_type, external_url, status)
  values ('A video', 'Watch this.', array['training'], 'video', 'https://example.com/v', 'published');
  delete from public.library_resources where title in ('Just a title', 'A video');
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'publish rules'); end if;

  -- 7) Once the gate opens to members (simulated here, rolled back): a member
  --    reads published resources and their files, never drafts or a draft's
  --    files, and still can't write. A free user still reads nothing.
  create or replace function public.flock_enabled()
  returns boolean language sql stable security invoker set search_path = ''
  as $f$ select private.can_use_flock(auth.uid()) and private.flock_ui_on(); $f$;
  ok := true;
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := ok and private.can_read_library();
  select count(*) into n from public.library_resources; ok := ok and n = 1;
  select count(*) into n from public.library_resources where id = r_draft; ok := ok and n = 0;
  select count(*) into n from public.flock_library_resource(r_pub); ok := ok and n = 1;
  select count(*) into n from storage.objects where bucket_id = 'flock-library' and name in (cover, pdf); ok := ok and n = 2;
  select count(*) into n from storage.objects where bucket_id = 'flock-library' and name = dcover; ok := ok and n = 0;
  denied := false; begin insert into public.library_resources (title) values ('Mine'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  update public.library_resources set title = 'Changed' where id = r_pub; get diagnostics n = row_count; ok := ok and n = 0;
  denied := false; begin insert into storage.objects (bucket_id, name) values ('flock-library', 'covers/' || gen_random_uuid()::text || '.jpg'); exception when insufficient_privilege then denied := true; end; ok := ok and denied;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.library_resources; ok := ok and n = 0;
  select count(*) into n from storage.objects where bucket_id = 'flock-library'; ok := ok and n = 0;
  reset role;
  -- Unpublishing takes it, and its files, away from members at once.
  update public.library_resources set status = 'draft' where id = r_pub;
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.library_resources; ok := ok and n = 0;
  select count(*) into n from storage.objects where bucket_id = 'flock-library'; ok := ok and n = 0;
  reset role;
  update public.library_resources set status = 'published' where id = r_pub;
  if ok then passed := passed + 1; else failed := array_append(failed, 'gate open to members: published only, read only'); end if;

  -- 8) The kill switch hides the library from members too (gate still open).
  update public.flock_settings set ui_enabled = false where id;
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.library_resources;
  ok := n = 0 and (select count(*) from storage.objects where bucket_id = 'flock-library') = 0;
  reset role;
  update public.flock_settings set ui_enabled = true where id;
  if ok then passed := passed + 1; else failed := array_append(failed, 'kill switch hides the library'); end if;

  -- 9) Search: every word must match (title, summary, body or species), any
  --    case; type and topic filters; % and _ are literal.
  -- Everything here was published in this one transaction (same now()), so
  -- give the first one an earlier date to check newest-first.
  update public.library_resources set published_at = now() - interval '1 day' where id = r_pub;
  insert into public.library_resources (title, summary, body, resource_type, topics, external_url, status)
  values ('Target training video', 'Chopstick basics.', 'Reward each touch.', 'video', array['training'], 'https://example.com/t', 'published');
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := (select count(*) from public.flock_library_search('PAPER cups', null, null, 100)) = 1
    and (select count(*) from public.flock_library_search('caique', null, null, 100)) = 1
    and (select count(*) from public.flock_library_search('paper chopstick', null, null, 100)) = 0
    and (select count(*) from public.flock_library_search('  ', null, null, 100)) = 2
    and (select count(*) from public.flock_library_search(null, 'video', null, 100)) = 1
    and (select count(*) from public.flock_library_search(null, null, 'foraging', 100)) = 1
    and (select count(*) from public.flock_library_search(null, 'guide', 'training', 100)) = 0
    and (select count(*) from public.flock_library_search('100%', null, null, 100)) = 1
    and (select count(*) from public.flock_library_search('%', null, null, 100)) = 1
    and (select count(*) from public.flock_library_search('_', null, null, 100)) = 0
    and (select title from public.flock_library_search(null, null, null, 100) limit 1) = 'Target training video';
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'search and filters'); end if;

  raise exception 'FLOCK LIBRARY CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
