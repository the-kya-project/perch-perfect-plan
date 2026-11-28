-- Weather cards on Home (backlog D2.2). Additive only: one new switch row and
-- three new tables; nothing existing changes.
--
-- 1. The care switch 'weather_cards' (public.care_features), off. With it off
--    nobody sees the Account field, the no-ZIP prompt or a weather card. With
--    one admin account in production, 'admins' means Brittany's account only:
--      select public.admin_set_care_feature('weather_cards', 'admins');
--
-- 2. public.home_postcodes: an owner's optional home ZIP or postcode, set on
--    Account. One row per account, readable and writable only by that account
--    (never by co-carers, household members or sitters). A US ZIP is its 5
--    digits; a Dutch postcode is stored as its 4 digits only. Removing it
--    deletes the row; deleting the account deletes it by foreign key. The row
--    also holds the day the weather card was last hidden with "Got it", so the
--    seasonal card's own "Got it" (today_card_dismissals) is never overwritten.
--
-- 3. public.weather_forecasts: the forecast for each ZIP or postcode area,
--    fetched from Apple WeatherKit by the server at most once a day per area and
--    shared by everyone in it. Service role only. Holds no account, only the
--    area and the next days' highs and lows (src/lib/weatherCards.ts).
--
-- 4. public.weather_prompt_dismissals: "Got it" on Home's no-ZIP prompt
--    (Brittany, Nov 28, 2026: it should be dismissible). One row per account,
--    own row only; once it's there the prompt stays hidden on every device.
--    Adding a ZIP or postcode later in Account still works as before. Deleted
--    with the account by foreign key.

insert into public.care_features (feature, audience, description) values
  ('weather_cards', 'off', 'Heat and cold cards on Home by the owner''s home ZIP or postcode (backlog D2.2)')
on conflict (feature) do nothing;

create table if not exists public.home_postcodes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  country text not null check (country in ('US', 'NL')),
  postcode text not null,
  weather_dismissed_on date,
  updated_at timestamptz not null default now(),
  constraint home_postcodes_shape check (
    (country = 'US' and postcode ~ '^[0-9]{5}$' and postcode <> '00000')
    or (country = 'NL' and postcode ~ '^[1-9][0-9]{3}$')
  )
);

comment on table public.home_postcodes is
  'An owner''s optional home ZIP or postcode for weather cards (backlog D2.2). Own row only. See src/lib/weatherCards.ts.';

alter table public.home_postcodes enable row level security;
revoke all on public.home_postcodes from anon, authenticated;
grant select, insert, update, delete on public.home_postcodes to authenticated;
grant select, insert, update, delete on public.home_postcodes to service_role;

drop policy if exists "home_postcodes read own" on public.home_postcodes;
create policy "home_postcodes read own" on public.home_postcodes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "home_postcodes add own" on public.home_postcodes;
create policy "home_postcodes add own" on public.home_postcodes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "home_postcodes change own" on public.home_postcodes;
create policy "home_postcodes change own" on public.home_postcodes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "home_postcodes remove own" on public.home_postcodes;
create policy "home_postcodes remove own" on public.home_postcodes
  for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.weather_forecasts (
  area text primary key check (area ~ '^(US:[0-9]{5}|NL:[1-9][0-9]{3})$'),
  fetched_on date not null,
  fetched_at timestamptz not null default now(),
  time_zone text not null,
  -- [{"date": "YYYY-MM-DD", "high_c": 31.4, "low_c": 18.2}, ...]
  days jsonb not null default '[]'::jsonb check (jsonb_typeof(days) = 'array')
);

comment on table public.weather_forecasts is
  'WeatherKit daily forecast per ZIP or postcode area, fetched at most once a day (backlog D2.2). Service role only.';

alter table public.weather_forecasts enable row level security;
revoke all on public.weather_forecasts from anon, authenticated;
grant select, insert, update, delete on public.weather_forecasts to service_role;

-- Read only by the server: a policy that allows nothing, stated plainly.
drop policy if exists "weather_forecasts no direct access" on public.weather_forecasts;
create policy "weather_forecasts no direct access" on public.weather_forecasts
  for select to authenticated using (false);

create table if not exists public.weather_prompt_dismissals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dismissed_at timestamptz not null default now()
);

comment on table public.weather_prompt_dismissals is
  '"Got it" on Home''s no-ZIP weather prompt (backlog D2.2). Own row only. See src/lib/homePostcode.ts.';

alter table public.weather_prompt_dismissals enable row level security;
revoke all on public.weather_prompt_dismissals from anon, authenticated;
grant select, insert, delete on public.weather_prompt_dismissals to authenticated;
grant select, insert, update, delete on public.weather_prompt_dismissals to service_role;

drop policy if exists "weather_prompt_dismissals read own" on public.weather_prompt_dismissals;
create policy "weather_prompt_dismissals read own" on public.weather_prompt_dismissals
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "weather_prompt_dismissals add own" on public.weather_prompt_dismissals;
create policy "weather_prompt_dismissals add own" on public.weather_prompt_dismissals
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "weather_prompt_dismissals remove own" on public.weather_prompt_dismissals;
create policy "weather_prompt_dismissals remove own" on public.weather_prompt_dismissals
  for delete to authenticated using (user_id = (select auth.uid()));
