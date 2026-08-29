-- ============================================================================
-- Scheduled Cron Jobs via pg_cron + pg_net
--
-- Triggers:
--   • sender        → every 1 minute  (processes due campaign emails)
--   • reply-checker → every 3 minutes (polls Gmail threads for replies)
--
-- Prerequisites:
--   • pg_cron and pg_net extensions must be enabled in your Supabase project
--     (Dashboard → Database → Extensions → enable pg_cron and pg_net)
--   • SUPABASE_URL and CRON_SECRET must be set as Edge Function secrets
--     (supabase secrets set CRON_SECRET=<your-secret>)
--
-- The CRON_SECRET used here must match the one injected into the Edge Function
-- environment. Replace '<YOUR_CRON_SECRET>' with your actual secret value,
-- OR store it in a Supabase Vault secret and reference it via
-- vault.decrypted_secrets if preferred.
--
-- The SUPABASE_URL follows the pattern:
--   https://<project-ref>.supabase.co
-- ============================================================================

-- Enable required extensions
create extension if not exists pg_cron   with schema pg_catalog;
create extension if not exists pg_net    with schema extensions;

-- ----------------------------------------------------------------------------
-- Helper: a dedicated schema to keep cron config isolated
-- ----------------------------------------------------------------------------
create schema if not exists cron_config;

-- Store the project URL and cron secret in a small config table so the jobs
-- below can reference them without hard-coding values in SQL.
-- Run: INSERT INTO cron_config.settings VALUES (...) once after migration.
create table if not exists cron_config.settings (
  key   text primary key,
  value text not null
);

comment on table cron_config.settings is
  'Stores per-project values (supabase_url, cron_secret) used by pg_cron jobs.';

-- Insert placeholder rows — update these with real values after applying the
-- migration (or run the UPDATE statements from your deployment script).
insert into cron_config.settings (key, value)
values
  ('supabase_url',  'https://YOUR_PROJECT_REF.supabase.co'),
  ('cron_secret',   'YOUR_CRON_SECRET')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Sender — every 1 minute
-- Processes all due campaign_leads rows (next_send_at <= now()) up to the
-- MAX_SENDS_PER_RUN cap defined inside the Edge Function.
-- ----------------------------------------------------------------------------
select cron.schedule(
  'outreach-sender',          -- unique job name (used to update/delete later)
  '* * * * *',                -- every minute
  $$
  select
    net.http_post(
      url     := (select value from cron_config.settings where key = 'supabase_url')
                 || '/functions/v1/sender',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-cron-secret',   (select value from cron_config.settings where key = 'cron_secret')
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- ----------------------------------------------------------------------------
-- Reply Checker — every 3 minutes
-- Polls Gmail threads for replies, classifies with Gemini, sends Telegram
-- alerts, and marks campaign_leads as replied / bounced as appropriate.
-- Running less frequently than the sender avoids Gmail API quota exhaustion.
-- ----------------------------------------------------------------------------
select cron.schedule(
  'outreach-reply-checker',   -- unique job name
  '*/3 * * * *',              -- every 3 minutes
  $$
  select
    net.http_post(
      url     := (select value from cron_config.settings where key = 'supabase_url')
                 || '/functions/v1/reply-checker',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-cron-secret',   (select value from cron_config.settings where key = 'cron_secret')
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- ----------------------------------------------------------------------------
-- Verification helpers (run manually to inspect job status)
-- ----------------------------------------------------------------------------
-- List all scheduled jobs:
--   SELECT jobid, jobname, schedule, command, active FROM cron.job;
--
-- See recent run history:
--   SELECT jobid, runid, job_pid, database, username, command,
--          status, return_message, start_time, end_time
--   FROM cron.job_run_details
--   ORDER BY start_time DESC
--   LIMIT 20;
--
-- Disable a job without deleting it:
--   UPDATE cron.job SET active = false WHERE jobname = 'outreach-sender';
--
-- Remove a job entirely:
--   SELECT cron.unschedule('outreach-sender');
--   SELECT cron.unschedule('outreach-reply-checker');
-- ============================================================================
