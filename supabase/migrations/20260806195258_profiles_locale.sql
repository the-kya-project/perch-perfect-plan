-- profiles.locale: recipient's preferred UI/email language (app locale like
-- 'en' | 'nl'). Nullable with NO default on purpose: null means "never set",
-- which lets sign-in populate it from navigator.language and lets server code
-- fall back to English. Validated in app against SUPPORTED_LOCALES (no CHECK,
-- so adding a language never needs another migration). Inherits the existing
-- profiles RLS (owner select/update-own); cron reads via service role.
alter table public.profiles add column if not exists locale text;
