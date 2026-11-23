-- "Got it" on the Today card (20261123160000_today_card_dismissals.sql): each
-- account reads and writes only its own row, signed-out visitors get nothing,
-- and deleting an account removes its row.
--
-- Self-contained: it raises at the end so the whole block rolls back.
--   "TODAY CARD DISMISSALS CHECKS: n passed, 0 failed"          → all good
--   "TODAY CARD DISMISSALS CHECKS: n passed, k failed: <names>" → which broke
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  passed int := 0; failed text[] := '{}';
  n int;
  denied boolean;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', a || '@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', b || '@example.com', '{}', '{}', now(), now());

  -- 1) An account saves its own dismissal, and can replace it.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.today_card_dismissals (user_id, card_id, through_date) values (a, 'thanksgiving', '2026-11-26');
  insert into public.today_card_dismissals (user_id, card_id, through_date) values (a, 'autumnHeating', '2026-11-30')
    on conflict (user_id) do update set card_id = excluded.card_id, through_date = excluded.through_date;
  select count(*) into n from public.today_card_dismissals where card_id = 'autumnHeating';
  reset role;
  if n = 1 then passed := passed + 1; else failed := array_append(failed, 'save own'); end if;

  -- 2) Another account can't read it.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.today_card_dismissals;
  reset role;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'read other'); end if;

  -- 3) Another account can't write one for it.
  denied := false;
  set local role authenticated;
  begin
    insert into public.today_card_dismissals (user_id, card_id, through_date) values (a, 'easter', '2027-03-29')
      on conflict (user_id) do update set card_id = excluded.card_id;
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'write other'); end if;

  -- 4) Signed-out visitors can't read the table.
  denied := false;
  set local role anon;
  begin
    perform 1 from public.today_card_dismissals;
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if denied then passed := passed + 1; else failed := array_append(failed, 'anon read'); end if;

  -- 5) Deleting the account removes its row.
  delete from auth.users where id = a;
  select count(*) into n from public.today_card_dismissals where user_id = a;
  if n = 0 then passed := passed + 1; else failed := array_append(failed, 'account deletion'); end if;

  raise exception 'TODAY CARD DISMISSALS CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ': ' || array_to_string(failed, ', ') else '' end;
end $$;
