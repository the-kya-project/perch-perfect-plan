-- Server-authored binding of a Cloudflare Stream uid to the bird it belongs to.
--
-- Why this exists: clip authorization previously asked "can the caller see a
-- care_plans row referencing this uid". care_plans is user-writable, so an
-- attacker could write a victim's uid into their OWN care plan and pass the
-- check honestly (verified). Any rule sourced from user-writable data has that
-- shape, so the binding has to be written by the server and unforgeable by the
-- client.
create table if not exists public.clip_assets (
  uid        text primary key,
  bird_id    uuid not null references public.birds(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists clip_assets_bird_id_idx on public.clip_assets (bird_id);

-- RLS on with ZERO policies: anon and authenticated can neither read nor write.
-- Only the service role (which bypasses RLS) touches this table — the upload
-- server function writes it, the clip server functions read it.
alter table public.clip_assets enable row level security;

-- Belt and braces alongside RLS, in case a future default-privileges change
-- would otherwise hand these roles table access.
revoke all on public.clip_assets from anon, authenticated;

-- Backfill from the nine existing clip columns. Verified beforehand that every
-- uid currently appears in exactly one care_plans row, so there is no winner to
-- pick. on conflict keeps this re-runnable.
insert into public.clip_assets (uid, bird_id)
select distinct substring(v.val from 10) as uid, cp.bird_id
from public.care_plans cp
cross join lateral (values
  (cp.baseline_clip_path), (cp.clip_anything_else_path), (cp.clip_bedtime_path),
  (cp.clip_food_prep_path), (cp.clip_food_water_path),  (cp.clip_locations_path),
  (cp.clip_step_up_path),  (cp.clip_targeting_path),    (cp.clip_toys_foraging_path)
) as v(val)
where v.val is not null and v.val like 'cfstream:%'
on conflict (uid) do nothing;
