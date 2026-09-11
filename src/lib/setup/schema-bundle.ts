/**
 * Consolidated SQL schema bundle for 1-click database initialization.
 *
 * Merges all 6 migration files into an ordered sequence of idempotent SQL statements.
 * Dynamically replaces placeholder values (Supabase URL, CRON secret).
 *
 * Every statement uses IF NOT EXISTS / IF NOT EXISTS / DO $$ ... EXCEPTION ... END $$
 * to be safely re-runnable against an already-initialized database.
 */

/**
 * Returns an ordered array of { label, sql } objects for the setup wizard
 * to execute sequentially, reporting progress per step.
 */
export function getSchemaSteps(supabaseUrl: string, cronSecret: string, appUrl?: string): { label: string; sql: string }[] {
  const cleanAppUrl = appUrl?.trim().replace(/\/$/, '') || ''
  return [
    // ──────────────────────────────────────────────────────────────────────
    // Step 1: Extensions
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Enable pgcrypto extension',
      sql: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
    },
    {
      label: 'Enable pg_cron extension',
      sql: `CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;`,
    },
    {
      label: 'Enable pg_net extension',
      sql: `CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;`,
    },

    // ──────────────────────────────────────────────────────────────────────
    // Step 2: Core tables (from 00001_initial_schema.sql)
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Create email_accounts table',
      sql: `
CREATE TABLE IF NOT EXISTS email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address text NOT NULL UNIQUE,
  display_name text,
  service_account_client_email text NOT NULL,
  service_account_private_key text NOT NULL,
  google_access_token text,
  google_token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
  error_message text,
  daily_send_limit integer NOT NULL DEFAULT 30,
  min_seconds_between_sends integer NOT NULL DEFAULT 180,
  next_available_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz,
  last_new_lead_sent_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);`,
    },
    {
      label: 'Create campaigns table',
      sql: `
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  timezone text NOT NULL DEFAULT 'UTC',
  working_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  working_hours_start time NOT NULL DEFAULT '09:00',
  working_hours_end time NOT NULL DEFAULT '17:00',
  stop_on_auto_reply boolean NOT NULL DEFAULT true,
  send_priority text NOT NULL DEFAULT 'new_leads'
    CHECK (send_priority IN ('new_leads', 'follow_ups')),
  limit_emails_per_company integer DEFAULT 2
    CHECK (limit_emails_per_company IS NULL OR limit_emails_per_company >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);`,
    },
    {
      label: 'Create lead_imports table',
      sql: `
CREATE TABLE IF NOT EXISTS lead_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text,
  campaign_id uuid REFERENCES campaigns(id),
  total_rows integer NOT NULL DEFAULT 0,
  new_leads integer NOT NULL DEFAULT 0,
  duplicate_leads integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now()
);`,
    },
    {
      label: 'Create leads table',
      sql: `
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'do_not_contact', 'bounced')),
  status_reason text,
  status_changed_at timestamptz,
  imported_via uuid REFERENCES lead_imports(id),
  created_at timestamptz NOT NULL DEFAULT now()
);`,
    },
    {
      label: 'Create campaign_steps table',
      sql: `
CREATE TABLE IF NOT EXISTS campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  delay_days integer NOT NULL DEFAULT 0,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  UNIQUE (campaign_id, step_order)
);`,
    },
    {
      label: 'Create campaign_email_accounts table',
      sql: `
CREATE TABLE IF NOT EXISTS campaign_email_accounts (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email_account_id uuid NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, email_account_id)
);`,
    },
    {
      label: 'Create campaign_leads table',
      sql: `
CREATE TABLE IF NOT EXISTS campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'replied', 'bounced', 'paused', 'completed')),
  current_step integer NOT NULL DEFAULT 0,
  email_account_id uuid REFERENCES email_accounts(id),
  thread_id text,
  last_message_id text,
  next_send_at timestamptz,
  replied_at timestamptz,
  last_reply_checked_at timestamptz,
  last_thread_synced_at timestamptz,
  UNIQUE (campaign_id, lead_id)
);`,
    },
    {
      label: 'Create sends table',
      sql: `
CREATE TABLE IF NOT EXISTS sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id uuid NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES campaign_steps(id),
  email_account_id uuid NOT NULL REFERENCES email_accounts(id),
  gmail_message_id text,
  gmail_thread_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message text
);`,
    },
    {
      label: 'Create replies table',
      sql: `
CREATE TABLE IF NOT EXISTS replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id uuid NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  gmail_message_id text,
  classification text NOT NULL CHECK (classification IN ('real', 'auto', 'bounce')),
  llm_category text CHECK (llm_category IS NULL OR llm_category IN ('interested', 'not_interested', 'out_of_office', 'wrong_person', 'undefined')),
  received_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  snippet text
);`,
    },
    {
      label: 'Create thread_messages table',
      sql: `
CREATE TABLE IF NOT EXISTS thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id uuid NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL UNIQUE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_address text,
  to_address text,
  subject text,
  body_text text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_messages_campaign_lead
  ON thread_messages (campaign_lead_id);`,
    },
    {
      label: 'Create telegram_notify_recipients table',
      sql: `
CREATE TABLE IF NOT EXISTS telegram_notify_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  chat_id text NOT NULL UNIQUE,
  bot_token text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);`,
    },

    // ──────────────────────────────────────────────────────────────────────
    // Step 3: API keys (from 00002_api_keys.sql)
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Create api_keys table',
      sql: `
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  key_hash text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);`,
    },

    // ──────────────────────────────────────────────────────────────────────
    // Step 4: Gemini API keys (from 00003_gemini_and_replies.sql)
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Create gemini_api_keys table',
      sql: `
CREATE TABLE IF NOT EXISTS gemini_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  api_key text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);`,
    },

    // ──────────────────────────────────────────────────────────────────────
    // Step 5: Campaign–Telegram join table (from 00004)
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Create campaign_telegram_recipients table',
      sql: `
CREATE TABLE IF NOT EXISTS campaign_telegram_recipients (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES telegram_notify_recipients(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, recipient_id)
);`,
    },

    // ──────────────────────────────────────────────────────────────────────
    // Step 6: Indexes
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Create performance indexes',
      sql: `
CREATE INDEX IF NOT EXISTS idx_campaign_leads_due ON campaign_leads (next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_campaign_leads_thread ON campaign_leads (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sends_campaign_lead ON sends (campaign_lead_id);
CREATE INDEX IF NOT EXISTS idx_replies_campaign_lead ON replies (campaign_lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_email_accounts_new_lead_rotation ON email_accounts (last_new_lead_sent_at) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_campaign_telegram_recipients_campaign ON campaign_telegram_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_telegram_recipients_recipient ON campaign_telegram_recipients(recipient_id);`,
    },

    // ──────────────────────────────────────────────────────────────────────
    // Step 7: Views (from 00002_sender_helpers.sql)
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Create campaign_sends_today view',
      sql: `
CREATE OR REPLACE VIEW campaign_sends_today AS
SELECT
  email_account_id,
  COUNT(*)::integer AS sends_today
FROM sends
WHERE
  status = 'sent'
  AND sent_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
GROUP BY email_account_id;`,
    },

    // ──────────────────────────────────────────────────────────────────────
    // Step 8: Cron config schema & settings (from 00005_cron_jobs.sql)
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Create cron_config schema and settings',
      sql: `
CREATE SCHEMA IF NOT EXISTS cron_config;

CREATE TABLE IF NOT EXISTS cron_config.settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO cron_config.settings (key, value)
VALUES
  ('supabase_url',  '${supabaseUrl}'),
  ('cron_secret',   '${cronSecret}'),
  ('app_url',       '${cleanAppUrl}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
    },

    // ──────────────────────────────────────────────────────────────────────
    // Step 9: Cron job — sender (every 1 minute)
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Schedule outreach-sender cron job',
      sql: `
SELECT cron.schedule(
  'outreach-sender',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url     := (SELECT value || '/api/cron/sender' FROM cron_config.settings WHERE key = 'app_url'),
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-cron-secret',   (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
      ),
      body    := '{}'::jsonb
    )
  $$
);`,
    },

    // ──────────────────────────────────────────────────────────────────────
    // Step 10: Cron job — reply-checker (every 3 minutes)
    // ──────────────────────────────────────────────────────────────────────
    {
      label: 'Schedule outreach-reply-checker cron job',
      sql: `
SELECT cron.schedule(
  'outreach-reply-checker',
  '*/3 * * * *',
  $$
  SELECT
    net.http_post(
      url     := (SELECT value || '/api/cron/reply-checker' FROM cron_config.settings WHERE key = 'app_url'),
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-cron-secret',   (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
      ),
      body    := '{}'::jsonb
    )
  $$
);`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Step 11: Fix FK constraints (00006_fix_fk_constraints.sql)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Fix FK constraints (allow inbox/step deletes with history)',
      sql: `
-- Fix 1: campaign_leads.email_account_id -> ON DELETE SET NULL
ALTER TABLE campaign_leads
  DROP CONSTRAINT IF EXISTS campaign_leads_email_account_id_fkey,
  ADD CONSTRAINT campaign_leads_email_account_id_fkey
    FOREIGN KEY (email_account_id)
    REFERENCES email_accounts(id)
    ON DELETE SET NULL;

-- Fix 2: sends.step_id -> nullable + ON DELETE SET NULL
ALTER TABLE sends
  ALTER COLUMN step_id DROP NOT NULL;

ALTER TABLE sends
  DROP CONSTRAINT IF EXISTS sends_step_id_fkey,
  ADD CONSTRAINT sends_step_id_fkey
    FOREIGN KEY (step_id)
    REFERENCES campaign_steps(id)
    ON DELETE SET NULL;

-- Fix 3: sends.email_account_id -> nullable + ON DELETE SET NULL
ALTER TABLE sends
  ALTER COLUMN email_account_id DROP NOT NULL;

ALTER TABLE sends
  DROP CONSTRAINT IF EXISTS sends_email_account_id_fkey,
  ADD CONSTRAINT sends_email_account_id_fkey
    FOREIGN KEY (email_account_id)
    REFERENCES email_accounts(id)
    ON DELETE SET NULL;

-- Fix 4: lead_imports.campaign_id -> ON DELETE SET NULL
ALTER TABLE lead_imports
  DROP CONSTRAINT IF EXISTS lead_imports_campaign_id_fkey,
  ADD CONSTRAINT lead_imports_campaign_id_fkey
    FOREIGN KEY (campaign_id)
    REFERENCES campaigns(id)
    ON DELETE SET NULL;`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Step 12: Inbox variables & sender profile (00007_inbox_variables.sql)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Add sender profile fields to email_accounts (inbox variables)',
      sql: `
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS first_name    text,
  ADD COLUMN IF NOT EXISTS last_name     text,
  ADD COLUMN IF NOT EXISTS role          text,
  ADD COLUMN IF NOT EXISTS phone_number  text,
  ADD COLUMN IF NOT EXISTS signature     text,
  ADD COLUMN IF NOT EXISTS variables     jsonb NOT NULL DEFAULT '{}'::jsonb;`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Step 13: Campaign send priority (00008_campaign_send_priority.sql)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Add send_priority column to campaigns table',
      sql: `
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS send_priority text NOT NULL DEFAULT 'new_leads'
    CHECK (send_priority IN ('new_leads', 'follow_ups'));`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Step 14: Limit emails per company (00009 + 00010 migrations)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Add limit_emails_per_company column to campaigns table',
      sql: `
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS limit_emails_per_company integer DEFAULT 2
    CHECK (limit_emails_per_company IS NULL OR limit_emails_per_company >= 0);

ALTER TABLE campaigns
  ALTER COLUMN limit_emails_per_company SET DEFAULT 2;`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Step 15: Thread messages cache (00011_thread_messages.sql)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Create thread_messages table',
      sql: `
CREATE TABLE IF NOT EXISTS thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id uuid NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL UNIQUE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_address text,
  to_address text,
  subject text,
  body_text text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_messages_campaign_lead
  ON thread_messages (campaign_lead_id);`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Step 16: last_reply_checked_at queue tracking (00012_last_reply_checked_at.sql)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Add last_reply_checked_at column and index to campaign_leads',
      sql: `
ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS last_reply_checked_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_reply_check
  ON campaign_leads (last_reply_checked_at NULLS FIRST);`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Step 17: last_thread_synced_at queue tracking (00013_last_thread_synced_at.sql)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Add last_thread_synced_at column and index to campaign_leads',
      sql: `
ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS last_thread_synced_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_thread_sync
  ON campaign_leads (last_thread_synced_at NULLS FIRST);`,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Step 18: daily_send_count counter on email_accounts (00014_daily_send_count.sql)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Add daily_send_count column to email_accounts and schedule nightly reset',
      sql: `
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS daily_send_count integer NOT NULL DEFAULT 0;

SELECT cron.unschedule('reset-daily-send-counts')
  FROM cron.job
  WHERE jobname = 'reset-daily-send-counts';

SELECT cron.schedule(
  'reset-daily-send-counts',
  '0 0 * * *',
  $$UPDATE email_accounts SET daily_send_count = 0;$$
);`,
    },
  ]
}

/**
 * List of core table names expected after a successful migration.
 * Used by getSetupStatus() to verify database initialization.
 */
export const CORE_TABLES = [
  'email_accounts',
  'campaigns',
  'lead_imports',
  'leads',
  'campaign_steps',
  'campaign_email_accounts',
  'campaign_leads',
  'sends',
  'replies',
  'telegram_notify_recipients',
  'api_keys',
  'gemini_api_keys',
  'campaign_telegram_recipients',
  'thread_messages',
] as const
