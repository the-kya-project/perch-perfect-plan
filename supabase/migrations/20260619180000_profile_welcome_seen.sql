-- One-time owner welcome screen: track whether the owner has seen it on their
-- profile (account-level, not per-device) so it never re-shows after the first
-- sign-in, even from a new device or browser. Null = not yet seen.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_seen_at timestamptz;
