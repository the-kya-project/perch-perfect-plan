-- Weight baseline in shadow mode (backlog D1.2). Additive only: two new
-- tables, one new function and one new pg_cron job; nothing existing changes.
--
-- 1) bird_ideal_weights: an owner's optional ideal weight range for a bird,
--    separate from the care plan's "Healthy range" (birds.normal_weight_min/
--    max) and never shown to sitters. Its only screen is its own field on the
--    weight page, behind the weight_baseline switch. Behind the scenes it only
--    quiets the two lower weight alerts (src/lib/weightBaseline.ts).
--    The bird's owner reads and writes it; the bird's household reads it (their
--    weight page applies the same quieting). Sit links never read it.
--
-- 2) weight_baseline_shadow: what the baseline would have said about every
--    weigh-in, for every bird, with and without the ideal range. Written only
--    by the hourly hook /api/public/hooks/weight-baseline-shadow (service
--    role). No app user, sitter or visitor can read it: check it in the SQL
--    editor, e.g.
--      select card, card_with_ideal, count(*) from public.weight_baseline_shadow group by 1, 2;
--    It logs after the fact from saved rows, so it never slows down or blocks
--    a weigh-in. Rows aren't tied to the weigh-in by a foreign key, so editing
--    or deleting a weigh-in keeps what was logged; deleting the bird (or its
--    owner's account) removes them.
--
-- 3) weight_baseline_shadow_pending(limit): weigh-ins from the last 14 days
--    with no shadow row yet, oldest first (service role only).
--
-- 4) Job weight-baseline-shadow-hourly, at :47, through private.call_cron_hook.

create table if not exists public.bird_ideal_weights (
  bird_id uuid primary key references public.birds(id) on delete cascade,
  low_grams numeric not null check (low_grams >= 1 and low_grams <= 5000),
  high_grams numeric not null check (high_grams >= 1 and high_grams <= 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint bird_ideal_weights_order check (low_grams <= high_grams)
);

comment on table public.bird_ideal_weights is
  'An owner''s optional ideal weight range per bird (backlog D1.2). Private: shown only in its own field; only quiets the two lower weight-baseline alerts. Never shown to sitters.';

alter table public.bird_ideal_weights enable row level security;
revoke all on public.bird_ideal_weights from anon, authenticated;
grant select, insert, update, delete on public.bird_ideal_weights to authenticated;
grant select, insert, update, delete on public.bird_ideal_weights to service_role;

drop policy if exists "bird_ideal_weights read with bird access" on public.bird_ideal_weights;
create policy "bird_ideal_weights read with bird access" on public.bird_ideal_weights
  for select to authenticated
  using (private.has_bird_access(bird_id, (select auth.uid())) is not null);

drop policy if exists "bird_ideal_weights owner adds" on public.bird_ideal_weights;
create policy "bird_ideal_weights owner adds" on public.bird_ideal_weights
  for insert to authenticated
  with check (private.has_bird_access(bird_id, (select auth.uid())) = 'owner');

drop policy if exists "bird_ideal_weights owner changes" on public.bird_ideal_weights;
create policy "bird_ideal_weights owner changes" on public.bird_ideal_weights
  for update to authenticated
  using (private.has_bird_access(bird_id, (select auth.uid())) = 'owner')
  with check (private.has_bird_access(bird_id, (select auth.uid())) = 'owner');

drop policy if exists "bird_ideal_weights owner removes" on public.bird_ideal_weights;
create policy "bird_ideal_weights owner removes" on public.bird_ideal_weights
  for delete to authenticated
  using (private.has_bird_access(bird_id, (select auth.uid())) = 'owner');

create table if not exists public.weight_baseline_shadow (
  weight_entry_id uuid primary key,
  bird_id uuid not null references public.birds(id) on delete cascade,
  measured_at timestamptz not null,
  grams numeric not null,
  meal_state text not null check (meal_state in ('before_meal', 'after_meal', 'unlabeled')),
  learned boolean not null,
  normal_grams numeric,
  wobble_pct numeric,
  worth_watching_pct numeric,
  keep_an_eye_pct numeric,
  shifted_pct numeric,
  drop_pct numeric,
  hard_drop_pct numeric,
  -- Without the ideal range.
  tier text not null check (tier in ('learning', 'none', 'worth_watching', 'keep_an_eye', 'shifted')),
  reweigh boolean not null,
  card text,
  -- Never quieted by the ideal range.
  hard_loss boolean not null,
  sudden_reweigh boolean not null,
  sudden_confirmed boolean not null,
  sudden_drop_pct numeric,
  -- With the ideal range (the same as above when the bird has none).
  has_ideal boolean not null,
  tier_with_ideal text not null check (tier_with_ideal in ('learning', 'none', 'worth_watching', 'keep_an_eye', 'shifted')),
  reweigh_with_ideal boolean not null,
  card_with_ideal text,
  rules_version text not null,
  logged_at timestamptz not null default now(),
  constraint weight_baseline_shadow_cards check (
    (card is null or card in ('sudden_confirmed', 'shifted', 'hard_loss', 'sudden_reweigh', 'reweigh', 'keep_an_eye', 'worth_watching'))
    and (card_with_ideal is null or card_with_ideal in ('sudden_confirmed', 'shifted', 'hard_loss', 'sudden_reweigh', 'reweigh', 'keep_an_eye', 'worth_watching'))
  )
);

comment on table public.weight_baseline_shadow is
  'What the weight baseline would have said about each weigh-in, for every bird, with and without the ideal range (backlog D1.2, shadow mode). Service role only; nobody in the app can read it.';

create index if not exists weight_baseline_shadow_bird_idx
  on public.weight_baseline_shadow (bird_id, measured_at);

alter table public.weight_baseline_shadow enable row level security;
revoke all on public.weight_baseline_shadow from anon, authenticated;
grant select, insert, update, delete on public.weight_baseline_shadow to service_role;

-- No policy for app users at all, stated plainly.
drop policy if exists "weight_baseline_shadow no app access" on public.weight_baseline_shadow;
create policy "weight_baseline_shadow no app access" on public.weight_baseline_shadow
  for select to authenticated using (false);

create or replace function public.weight_baseline_shadow_pending(p_limit int default 500)
returns table (id uuid, bird_id uuid, grams numeric, measured_at timestamptz, meal_relation text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.bird_id, w.grams, w.measured_at, w.meal_relation
  from public.weight_entries w
  where w.created_at > now() - interval '14 days'
    and not exists (select 1 from public.weight_baseline_shadow s where s.weight_entry_id = w.id)
  order by w.created_at, w.id
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

revoke all on function public.weight_baseline_shadow_pending(int) from public, anon, authenticated;
grant execute on function public.weight_baseline_shadow_pending(int) to service_role;

-- Production only, as with the other hooks: a branch or staging would call
-- production's hook with its own token.
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not installed; weight-baseline-shadow-hourly not scheduled';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'onboarding-emails-daily') then
    raise notice 'not production; weight-baseline-shadow-hourly not scheduled';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'weight-baseline-shadow-hourly') then
    perform cron.schedule(
      'weight-baseline-shadow-hourly',
      '47 * * * *',
      $cmd$select private.call_cron_hook('/api/public/hooks/weight-baseline-shadow', '{}'::jsonb)$cmd$);
  end if;
end;
$$;
