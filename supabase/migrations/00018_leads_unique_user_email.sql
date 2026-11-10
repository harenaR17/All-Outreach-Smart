-- ============================================================================
-- Migration 00018: Add unique constraint on leads (user_id, email)
-- Required for ON CONFLICT (user_id, email) resolution in Supabase PostgREST upserts.
-- ============================================================================

-- 1. Ensure all existing emails are trimmed and lowercase
UPDATE public.leads SET email = lower(trim(email)) WHERE email != lower(trim(email));

-- 2. Drop legacy expression index if present
DROP INDEX IF EXISTS public.idx_leads_user_email;

-- 3. Add explicit UNIQUE constraint on (user_id, email)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_user_id_email_key;
ALTER TABLE public.leads ADD CONSTRAINT leads_user_id_email_key UNIQUE (user_id, email);

