-- "Came to you" dates the app set on its own are never shown or passed on.
--
-- Until 2026-10-21 (PR #373), Add a bird defaulted birds.intake_date to today
-- and saved it for EVERY bird, while the field was only visible for fosters.
-- So most non-foster birds carry their creation day as a "came to you" date the
-- owner never saw or entered, and a handoff copied it into past_birds.
--
-- Non-destructive: the dates stay; a marker says where they came from.
--   intake_date_source = 'auto'  → set by the app: hidden, not passed on
--   intake_date_source = 'owner' → entered by the owner (the app sets this)
--   intake_date_source is null   → older row that doesn't match the automatic
--                                  pattern: treated as the owner's, shown
--
-- Idempotent: columns and constraints are guarded, every backfill only touches
-- rows whose marker is still null, and the function is create-or-replace.

alter table public.birds
  add column if not exists intake_date_source text;
alter table public.past_birds
  add column if not exists intake_date_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'birds_intake_date_source_check') then
    alter table public.birds
      add constraint birds_intake_date_source_check
      check (intake_date_source is null or intake_date_source in ('owner', 'auto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'past_birds_intake_date_source_check') then
    alter table public.past_birds
      add constraint past_birds_intake_date_source_check
      check (intake_date_source is null or intake_date_source in ('owner', 'auto'));
  end if;
end $$;

-- 1) Birds whose intake date was set automatically. Same rule as
--    looksAutoIntake in src/lib/intakeDate.ts:
--    - not a foster now, and never made permanent through "foster fail"
--      (the field only ever showed for fosters, so a non-foster owner never
--      saw or entered it);
--    - the date is the bird's creation day: within a day of created_at's UTC
--      date (the default used the device's UTC day until 2026-10-19 and its
--      local day after, which can fall a day either side);
--    - created before the fix shipped (2026-10-22 UTC, with margin).
update public.birds b
set intake_date_source = 'auto'
where b.intake_date is not null
  and b.intake_date_source is null
  and coalesce(b.is_foster, false) = false
  and b.became_permanent_on is null
  and b.created_at < timestamptz '2026-10-22 00:00:00+00'
  and b.intake_date between (b.created_at at time zone 'UTC')::date - 1
                        and (b.created_at at time zone 'UTC')::date + 1;

-- 2) Handoff keepsakes (past_birds) that copied such a date. Only non-foster
--    snapshots (a foster's date was on screen when it was added).
--    - In-app handoffs whose bird can still be found (same sender, accepted
--      within a day of departed_on, same intake date): follow that bird's
--      verdict from step 1.
--    - PDF handoffs (the bird was deleted) and in-app ones whose bird is gone:
--      the non-foster rule alone, since the field was never shown for them.
update public.past_birds pb
set intake_date_source = 'auto'
where pb.intake_date is not null
  and pb.intake_date_source is null
  and pb.was_foster = false
  and pb.created_at < timestamptz '2026-10-22 00:00:00+00'
  and (
    exists (
      select 1
      from public.handoffs h
      join public.birds b on b.id = h.bird_id
      where h.sender_user_id = pb.original_owner_id
        and h.status = 'accepted'
        and h.mode = 'app'
        and (h.completed_at at time zone 'UTC')::date between pb.departed_on - 1 and pb.departed_on + 1
        and b.intake_date = pb.intake_date
        and b.intake_date_source = 'auto'
    )
    or not exists (
      select 1
      from public.handoffs h
      join public.birds b on b.id = h.bird_id
      where pb.mode = 'app'
        and h.sender_user_id = pb.original_owner_id
        and h.status = 'accepted'
        and h.mode = 'app'
        and (h.completed_at at time zone 'UTC')::date between pb.departed_on - 1 and pb.departed_on + 1
        and b.intake_date = pb.intake_date
    )
  );

-- 3) In-app handoff: the sender's keepsake keeps the date with its marker, and
--    an automatic date doesn't travel to the new owner's bird. Only those two
--    lines change vs 20260702180000 (same signature, grants unchanged).
create or replace function public.handoff_accept_transfer(
  p_handoff_id uuid,
  p_new_owner uuid,
  p_photo_thumb text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bird uuid;
  v_sender uuid;
  v_recipient text;
  v_name text;
  v_species text;
  v_intake date;
  v_intake_source text;
  v_foster boolean;
begin
  select bird_id, sender_user_id, recipient_name
    into v_bird, v_sender, v_recipient
  from public.handoffs where id = p_handoff_id for update;
  if v_bird is null then raise exception 'handoff not found'; end if;
  if p_new_owner = v_sender then raise exception 'cannot hand off to yourself'; end if;

  select name, species, intake_date, intake_date_source, coalesce(is_foster, false)
    into v_name, v_species, v_intake, v_intake_source, v_foster
  from public.birds where id = v_bird;

  -- New owner membership (don't duplicate if somehow present).
  insert into public.bird_members (bird_id, user_id, role)
  values (v_bird, p_new_owner, 'owner')
  on conflict (bird_id, user_id) do update set role = 'owner';

  -- Owner mirror + adoption: a foster handed off becomes a PERMANENT bird for the
  -- new owner. Clear foster status and the stale "fostering since" atomically.
  -- An intake date the app set on its own doesn't go to the new owner either.
  update public.birds set
    owner_id = p_new_owner,
    is_foster = case when v_foster then false else is_foster end,
    became_permanent_on = case when v_foster then current_date else became_permanent_on end,
    intake_date = case when v_foster or v_intake_source = 'auto' then null else intake_date end,
    intake_date_source = case when v_foster or v_intake_source = 'auto' then null else intake_date_source end
  where id = v_bird;

  -- Remove the previous owner AND all household members on this bird.
  delete from public.bird_members where bird_id = v_bird and user_id <> p_new_owner;

  -- Detach from any sits → cancels sitter access to THIS bird only.
  delete from public.sit_birds where bird_id = v_bird;

  -- Prune the handed-off bird from any pending household invites so a later
  -- accept can't grant a third party access to the new owner's bird.
  update public.household_invites
  set bird_ids = array_remove(bird_ids, v_bird)
  where status = 'pending' and v_bird = any(bird_ids);

  -- Sender's read-only memory snapshot (was_foster + keepsake thumbnail). The
  -- intake date keeps its marker, so an automatic one stays hidden.
  insert into public.past_birds
    (original_owner_id, bird_name, species, intake_date, intake_date_source, departed_on, recipient_name, mode, was_foster, photo_thumb)
  values
    (v_sender, v_name, v_species, v_intake, v_intake_source, current_date, v_recipient, 'app', v_foster, p_photo_thumb);

  -- Finalize.
  update public.handoffs
  set status = 'accepted', accepted_user_id = p_new_owner, completed_at = now()
  where id = p_handoff_id;
end;
$$;

revoke execute on function public.handoff_accept_transfer(uuid, uuid, text) from public;
revoke execute on function public.handoff_accept_transfer(uuid, uuid, text) from anon;
revoke execute on function public.handoff_accept_transfer(uuid, uuid, text) from authenticated;
grant execute on function public.handoff_accept_transfer(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
