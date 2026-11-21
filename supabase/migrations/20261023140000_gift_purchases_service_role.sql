-- Gift memberships: let the service role write gift_purchases.
--
-- This project's default privileges give service_role no SELECT, INSERT or
-- UPDATE on new public tables (entitlements and founding_claims show the same
-- ACL), and service_role bypasses RLS but not table privileges. The Stripe
-- webhook records purchases through record_gift_purchase(), a SECURITY INVOKER
-- function it calls as service_role, marks refunds and email sends with
-- updates, and the thank-you page reads a purchase by its Checkout session.
-- All of that runs as service_role, so it needs these three. No DELETE: a
-- gift is never removed, only refunded.

grant select, insert, update on public.gift_purchases to service_role;
