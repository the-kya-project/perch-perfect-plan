
-- Push subscriptions: one row per (user, browser endpoint)
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

-- Per-event push opt-in toggles (default false — opt-in per device/account)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_sitter_opened boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_sitter_log boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_care_plan_reminder boolean NOT NULL DEFAULT false;

-- One-time "sitter opened" markers per sit, so the trigger fires once per sit
CREATE TABLE public.sit_open_events (
  sit_id uuid PRIMARY KEY REFERENCES public.sits(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sit_open_events TO anon, authenticated;
GRANT ALL ON public.sit_open_events TO service_role;
ALTER TABLE public.sit_open_events ENABLE ROW LEVEL SECURITY;
-- Inserts are made via server functions using the service role; no client policy needed.
CREATE POLICY "Service role only on sit_open_events"
  ON public.sit_open_events FOR SELECT USING (false);
