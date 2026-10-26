-- Verification for 20261026130000_bird_photos_member_read_owner_folder.
--
-- Self-contained and leaves nothing behind (the block always raises, so it
-- rolls back). The exception message is the result:
--   "BIRD PHOTO CHECKS: n passed, 0 failed"           → all good
--   "BIRD PHOTO CHECKS: n passed, k failed: <names>"  → which ones broke
-- Creates the bird-photos bucket for the run if the branch doesn't have one.
--
-- People: O owns Kiwi (photo O/<file>.jpg). H is household on Kiwi. X is a
-- stranger who makes a decoy bird pointing at O's photo. N is a new owner
-- after a handoff (photo moved into N's folder).
do $$
declare
  o uuid := gen_random_uuid(); h uuid := gen_random_uuid(); x uuid := gen_random_uuid(); nw uuid := gen_random_uuid();
  kiwi uuid; gift uuid;
  kiwi_photo text; gift_photo text;
  passed int := 0; failed text[] := '{}';
  n int;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@checks.invalid', '{}', '{}', now(), now()
  from unnest(array[o, h, x, nw]) u;
  insert into storage.buckets (id, name, public) values ('bird-photos', 'bird-photos', false) on conflict (id) do nothing;

  kiwi_photo := o::text || '/' || gen_random_uuid()::text || '.jpg';
  gift_photo := nw::text || '/' || gen_random_uuid()::text || '.jpg';
  insert into public.birds (owner_id, name, photo_url) values (o, 'Kiwi', kiwi_photo) returning id into kiwi;
  insert into public.bird_members (bird_id, user_id, role) values (kiwi, h, 'household');
  -- A bird already handed off to N: owned by N, photo moved into N's folder.
  insert into public.birds (owner_id, name, photo_url) values (nw, 'Gift', gift_photo) returning id into gift;
  insert into storage.objects (bucket_id, name, owner) values ('bird-photos', kiwi_photo, o), ('bird-photos', gift_photo, nw);

  -- 1) Owner reads their bird's photo.
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'bird-photos' and name = kiwi_photo;
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'owner reads own photo'::text); end if;

  -- 2) Household member reads it.
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'bird-photos' and name = kiwi_photo;
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'household member reads photo'::text); end if;

  -- 3) Stranger can't, and still can't after making a decoy bird with that path.
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'bird-photos' and name = kiwi_photo;
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'stranger cannot read photo'::text); end if;
  set local role authenticated;
  insert into public.birds (owner_id, name, photo_url) values (x, 'Decoy', kiwi_photo);
  select count(*) into n from storage.objects where bucket_id = 'bird-photos' and name = kiwi_photo;
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'decoy bird does not unlock photo'::text); end if;

  -- 4) Household member removed from Kiwi loses the photo.
  delete from public.bird_members where bird_id = kiwi and user_id = h;
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'bird-photos' and name = kiwi_photo;
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'removed member loses photo'::text); end if;

  -- 5) New owner after a handoff reads the moved photo.
  perform set_config('request.jwt.claims', json_build_object('sub', nw, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'bird-photos' and name = gift_photo;
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'new owner reads moved photo'::text); end if;

  raise exception 'BIRD PHOTO CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, '; ') else '' end;
end $$;
