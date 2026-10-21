-- Sitter links end at the end of the last day in the OWNER's time zone.
--
-- Until now enforce_sit_token_rules() pinned token_expires_at to 23:59:59 UTC on
-- end_date. For a US owner that is the afternoon or evening of the last day
-- (4:59pm in California), so the sitter lost the link while still covering.
--
-- 1. sits.time_zone: the IANA zone the sit's dates are meant in (e.g.
--    'America/Los_Angeles'). Nullable: the app sends the owner's device zone
--    when a sit is created, fills it on edit, and fills it for the owner's
--    current and upcoming sits when they open the app. Only the sit's owner can
--    write it (the existing "sits update" policy is owner-only; token sitters
--    have no account and household caregivers can only read).
-- 2. enforce_sit_token_rules(): same as 20260630130000 (token minted only for
--    external sits, never regenerated, household rows tokenless), except the
--    expiry is end_date + 1 day at local midnight in time_zone, minus a second.
--    A missing or unknown zone falls back to UTC (the old behaviour) and an
--    unknown zone is stored as null rather than kept. Recomputed on every
--    UPDATE, so filling in time_zone on an existing sit moves its expiry.
--
-- Existing rows are not touched here: with time_zone null their expiry
-- computes to exactly what it already is.
--
-- Safe to re-run: add column if not exists + create or replace function. The
-- trigger binding (sits_enforce_token_rules BEFORE INSERT OR UPDATE) is unchanged.

alter table public.sits add column if not exists time_zone text;

create or replace function public.enforce_sit_token_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tz text := 'UTC';
begin
  if new.time_zone is not null then
    new.time_zone := nullif(btrim(new.time_zone), '');
  end if;
  if new.time_zone is not null then
    if exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
      tz := new.time_zone;
    else
      new.time_zone := null;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.caregiver_user_id is null then
      -- External sitter: mint a per-trip token + expiry.
      new.invite_token := replace(gen_random_uuid()::text, '-', '')
                       || replace(gen_random_uuid()::text, '-', '');
      new.token_expires_at := ((new.end_date + 1)::timestamp at time zone tz) - interval '1 second';
    else
      -- Household caregiver: no token (they already have account-based access).
      new.invite_token := null;
      new.token_expires_at := null;
    end if;
  elsif tg_op = 'UPDATE' then
    -- Never regenerate the token. Keep expiry pinned to end_date only while a
    -- token exists; household rows stay tokenless with no expiry.
    new.invite_token := old.invite_token;
    if new.invite_token is not null then
      new.token_expires_at := ((new.end_date + 1)::timestamp at time zone tz) - interval '1 second';
    else
      new.token_expires_at := null;
    end if;
  end if;
  return new;
end;
$$;
