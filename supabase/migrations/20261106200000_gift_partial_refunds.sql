-- Gift memberships: record partial refunds, and lock in the launch rule.
-- Additive only. RLS and grants on gift_purchases are unchanged: the existing
-- table-level SELECT for authenticated (behind the "gift_purchases read"
-- policy) and SELECT/UPDATE for service_role cover the new column.
--
-- 1) amount_refunded_cents: how much of the payment Stripe has refunded so
--    far (Stripe's charge.amount_refunded, which is cumulative). The webhook
--    only ever raises it. A partial refund leaves the gift valid; once the
--    refunds reach the amount paid (one full refund, or several partial ones
--    that add up), the gift becomes 'refunded'. /admin/gifts counts what was
--    kept: amount_paid_cents - amount_refunded_cents.
--
-- 2) The launch rule: only a gift whose status is 'redeemed' may ever grant
--    membership. A refunded gift keeps redeemed_by and redeemed_at (so we know
--    who had it), so "has a redeemer" is NOT the test. The launch build's
--    entitlement code must use private.gift_grants_membership(status) in SQL,
--    or giftGrantsMembership() in src/lib/gifts.ts.


-- 1) Refunded amount ------------------------------------------------------------

alter table public.gift_purchases
  add column if not exists amount_refunded_cents integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gift_purchases_amount_refunded'
      and conrelid = 'public.gift_purchases'::regclass
  ) then
    alter table public.gift_purchases
      add constraint gift_purchases_amount_refunded
      check (amount_refunded_cents >= 0 and amount_refunded_cents <= amount_paid_cents);
  end if;
end;
$$;

-- Gifts already marked refunded were full refunds (the webhook ignored
-- partial ones until now), so they refunded everything.
update public.gift_purchases
set amount_refunded_cents = amount_paid_cents
where status = 'refunded' and amount_refunded_cents = 0;

comment on column public.gift_purchases.amount_refunded_cents is
  'Cents Stripe has refunded so far (cumulative). Only ever raised. Equal to amount_paid_cents means fully refunded (status refunded).';


-- 2) The launch rule --------------------------------------------------------------

create or replace function private.gift_grants_membership(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_status = 'redeemed', false);
$$;

revoke all on function private.gift_grants_membership(text) from public, anon, authenticated;
grant execute on function private.gift_grants_membership(text) to service_role;

comment on function private.gift_grants_membership(text) is
  'LAUNCH RULE: only status = ''redeemed'' grants membership. A refunded gift keeps redeemed_by, so never test redeemed_by is not null.';

comment on column public.gift_purchases.redeemed_by is
  'Who redeemed the gift. Kept after a refund, so it does NOT mean the gift grants access: use private.gift_grants_membership(status).';

comment on function private.redeem_gift(text) is
  'Records who a paid gift belongs to; writes no entitlement. The launch build grants access only where private.gift_grants_membership(status) is true.';
