-- Verification for 20261026140000_guard_bird_ownership.
--
-- Self-contained and leaves nothing behind (the block always raises, so it
-- rolls back). The exception message is the result:
--   "OWNERSHIP CHECKS: n passed, 0 failed"           → all good
--   "OWNERSHIP CHECKS: n passed, k failed: <names>"  → which ones broke
--
-- People: O owns Kiwi and Mango. C is a co-owner (every capability) on Kiwi
-- only. H is a household member on Kiwi. N stands in for a handoff recipient.
do $$
declare
  o uuid := gen_random_uuid(); c uuid := gen_random_uuid(); h uuid := gen_random_uuid(); nw uuid := gen_random_uuid();
  kiwi uuid; mango uuid;
  passed int := 0; failed text[] := '{}';
  n int; ok boolean;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[o, c, h, nw]) u;
  insert into public.birds (owner_id, name) values (o, 'Kiwi') returning id into kiwi;
  insert into public.birds (owner_id, name) values (o, 'Mango') returning id into mango;
  insert into public.bird_members (bird_id, user_id, role) values (kiwi, c, 'household'), (kiwi, h, 'household');
  insert into public.household_member_permissions (owner_id, member_user_id, capabilities, preset) values
    (o, c, array['log_daily_care', 'record_health', 'edit_care_plans', 'manage_emergency', 'manage_sits', 'manage_flock', 'manage_household'], 'co_owner'),
    (o, h, '{}', 'viewer');

  -- As the co-owner.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);

  -- 1) Can't make themselves the owner.
  set local role authenticated;
  begin update public.birds set owner_id = c where id = kiwi; ok := false; exception when others then ok := true; end;
  reset role;
  if ok and (select owner_id from public.birds where id = kiwi) = o then passed := passed + 1;
  else failed := array_append(failed, 'co-owner cannot change owner_id'::text); end if;

  -- 2) Can't promote their own membership to owner.
  set local role authenticated;
  begin update public.bird_members set role = 'owner' where bird_id = kiwi and user_id = c; ok := false; exception when others then ok := true; end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-owner cannot promote self to owner'::text); end if;

  -- 3) Can't remove the owner's membership.
  set local role authenticated;
  begin delete from public.bird_members where bird_id = kiwi and user_id = o; ok := false; exception when others then ok := true; end;
  reset role;
  if ok and exists (select 1 from public.bird_members where bird_id = kiwi and user_id = o and role = 'owner') then passed := passed + 1;
  else failed := array_append(failed, 'co-owner cannot remove the owner'::text); end if;

  -- 4) Can't invite someone to Mango; can invite to Kiwi.
  set local role authenticated;
  begin
    insert into public.household_invites (owner_id, invitee_email, bird_ids, token, status, expires_at, preset)
    values (o, 'x@checks.invalid', array[mango], 'chk-' || gen_random_uuid(), 'pending', now() + interval '7 days', 'viewer');
    ok := false;
  exception when others then ok := true;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-owner cannot invite to a bird they lack'::text); end if;
  set local role authenticated;
  begin
    insert into public.household_invites (owner_id, invitee_email, bird_ids, token, status, expires_at, preset)
    values (o, 'y@checks.invalid', array[kiwi], 'chk-' || gen_random_uuid(), 'pending', now() + interval '7 days', 'viewer');
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'co-owner can still invite to a shared bird'::text); end if;

  -- 5) Can still edit Kiwi and manage its household.
  set local role authenticated;
  update public.birds set notes = 'edited by co-owner' where id = kiwi;
  get diagnostics n = row_count;
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'co-owner can still edit the bird'::text); end if;
  set local role authenticated;
  delete from public.bird_members where bird_id = kiwi and user_id = h;
  get diagnostics n = row_count;
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'co-owner can still remove a household member'::text); end if;

  -- 6) A handoff (SECURITY DEFINER, runs as postgres) can still move the bird.
  update public.birds set owner_id = nw where id = mango;
  if (select owner_id from public.birds where id = mango) = nw then passed := passed + 1;
  else failed := array_append(failed, 'handoff path can change owner'::text); end if;

  -- 7) The owner can still delete their own bird (owner membership cascades).
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin delete from public.birds where id = kiwi; get diagnostics n = row_count; ok := n = 1; exception when others then ok := false; end;
  reset role;
  if ok then passed := passed + 1; else failed := array_append(failed, 'owner can delete own bird'::text); end if;

  raise exception 'OWNERSHIP CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
