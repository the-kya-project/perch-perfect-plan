-- sit_open_events is written only by server functions using the service role.
-- RLS already blocks anon/authenticated entirely (SELECT policy USING (false),
-- and no INSERT policy ⇒ inserts denied), so the table-level grants below were
-- dead weight. Remove them so the table's exposed surface matches its intent.
-- Service role is unaffected (it has GRANT ALL and bypasses RLS).
REVOKE SELECT, INSERT ON public.sit_open_events FROM anon, authenticated;
