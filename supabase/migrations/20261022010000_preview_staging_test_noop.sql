-- Throwaway no-op migration for a test PR proving that a PR with database
-- changes gets its own Supabase preview branch while its Vercel preview stays
-- on staging. Do not merge.
select 1;
