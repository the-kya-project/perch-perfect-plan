-- Fix: creating a HOUSEHOLD-caregiver sit violated sits_one_caregiver_chk.
--
-- Root cause is the TRIGGER, not the constraint. enforce_sit_token_rules()
-- (BEFORE INSERT/UPDATE on sits) predates the household-caregiver model: on
-- INSERT it minted an invite_token UNCONDITIONALLY. So a household sit
-- (caregiver_user_id set; the app sends invite_token = null) had a token forced
-- onto it -> both caregiver_user_id AND invite_token were set -> the
-- token-XOR-caregiver check failed. External sits (no caregiver) passed because
-- the minted token + null caregiver is exactly the other valid branch.
--
-- sits_one_caregiver_chk's rule is CORRECT and current (external sitter = token,
-- household = caregiver_user_id, exactly one), so we KEEP the constraint and fix
-- the trigger: mint a token ONLY for external sits (no caregiver); household sits
-- stay tokenless. The token is never regenerated on update; token_expires_at
-- tracks end_date only while a token exists.
--
-- Trigger binding (sits_enforce_token_rules BEFORE INSERT OR UPDATE) is
-- unchanged — CREATE OR REPLACE just swaps the function body.

create or replace function public.enforce_sit_token_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.caregiver_user_id is null then
      -- External sitter: mint a per-trip token + expiry.
      new.invite_token := replace(gen_random_uuid()::text, '-', '')
                       || replace(gen_random_uuid()::text, '-', '');
      new.token_expires_at := ((new.end_date + 1)::timestamp at time zone 'UTC') - interval '1 second';
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
      new.token_expires_at := ((new.end_date + 1)::timestamp at time zone 'UTC') - interval '1 second';
    else
      new.token_expires_at := null;
    end if;
  end if;
  return new;
end;
$$;
