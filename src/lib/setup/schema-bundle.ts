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
export function getSchemaSteps(supabaseUrl: string, cronSecret: string): { label: string; sql: string }[] {
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
  ('cron_secret',   '${cronSecret}')
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
      url     := (SELECT value FROM cron_config.settings WHERE key = 'supabase_url')
                 || '/functions/v1/sender',
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
      url     := (SELECT value FROM cron_config.settings WHERE key = 'supabase_url')
                 || '/functions/v1/reply-checker',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-cron-secret',   (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
      ),
      body    := '{}'::jsonb
    )
  $$
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
] as const
