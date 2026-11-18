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
export function getSchemaSteps(
  supabaseUrl: string,
  cronSecret: string,
  appUrl?: string,
  anonKey?: string
): { label: string; sql: string }[] {
  const cleanAppUrl = appUrl?.trim().replace(/\/$/, '') || ''
  const cleanAnonKey = anonKey?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ''
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
  can_send_new_leads boolean NOT NULL DEFAULT true,
  can_send_follow_ups boolean NOT NULL DEFAULT true,
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
  can_send_new_leads boolean NOT NULL DEFAULT true,
  can_send_follow_ups boolean NOT NULL DEFAULT true,
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
  ('app_url',       '${cleanAppUrl}'),
  ('anon_key',      '${cleanAnonKey}')
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
  SELECT net.http_post(
    url := (SELECT value FROM cron_config.settings WHERE key = 'supabase_url') || '/functions/v1/sender',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM cron_config.settings WHERE key = 'anon_key'),
      'x-cron-secret', (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
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
  SELECT net.http_post(
    url := (SELECT value FROM cron_config.settings WHERE key = 'supabase_url') || '/functions/v1/reply-checker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM cron_config.settings WHERE key = 'anon_key'),
      'x-cron-secret', (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
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

    // ─────────────────────────────────────────────────────────────────────────
    // Step 19: conversation_monitoring column on campaign_leads (00015_conversation_monitoring.sql)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Add conversation_monitoring column to campaign_leads',
      sql: `
ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS conversation_monitoring boolean NOT NULL DEFAULT true;`,
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Step 20: Composite index for active follow-up queue lookups (00016)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Add composite index for active follow-up queue on campaign_leads',
      sql: `
CREATE INDEX IF NOT EXISTS idx_campaign_leads_active_inbox
  ON campaign_leads (campaign_id, email_account_id, next_send_at)
  WHERE status = 'active';`,
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Step 21: Multi-User Isolation & Row Level Security (00017)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Configure multi-user isolation and Row Level Security',
      sql: `
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users ORDER BY created_at ASC LIMIT 1;

  ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE email_accounts SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;

  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE campaigns SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;

  ALTER TABLE lead_imports ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE lead_imports SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;

  ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE leads SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;

  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_email_key;
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_user_id_email_key;
  DROP INDEX IF EXISTS idx_leads_user_email;
  ALTER TABLE leads ADD CONSTRAINT leads_user_id_email_key UNIQUE (user_id, email);

  ALTER TABLE gemini_api_keys ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE gemini_api_keys SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
  ALTER TABLE gemini_api_keys DROP CONSTRAINT IF EXISTS gemini_api_keys_api_key_key;
  DROP INDEX IF EXISTS idx_gemini_api_keys_user_key;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gemini_api_keys_user_key ON gemini_api_keys (user_id, api_key);

  ALTER TABLE telegram_notify_recipients ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE telegram_notify_recipients SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
  ALTER TABLE telegram_notify_recipients DROP CONSTRAINT IF EXISTS telegram_notify_recipients_chat_id_key;
  DROP INDEX IF EXISTS idx_telegram_recipients_user_chat;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_recipients_user_chat ON telegram_notify_recipients (user_id, chat_id);

  ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE api_keys SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_imports_user ON lead_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_gemini_api_keys_user ON gemini_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_recipients_user ON telegram_notify_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gemini_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_notify_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_telegram_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_accounts_user_isolation" ON email_accounts;
CREATE POLICY "email_accounts_user_isolation" ON email_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "campaigns_user_isolation" ON campaigns;
CREATE POLICY "campaigns_user_isolation" ON campaigns FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "campaign_steps_user_isolation" ON campaign_steps;
CREATE POLICY "campaign_steps_user_isolation" ON campaign_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_steps.campaign_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_steps.campaign_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "campaign_email_accounts_user_isolation" ON campaign_email_accounts;
CREATE POLICY "campaign_email_accounts_user_isolation" ON campaign_email_accounts FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_email_accounts.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = campaign_email_accounts.email_account_id AND ea.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_email_accounts.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = campaign_email_accounts.email_account_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "campaign_telegram_recipients_user_isolation" ON campaign_telegram_recipients;
CREATE POLICY "campaign_telegram_recipients_user_isolation" ON campaign_telegram_recipients FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_telegram_recipients.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM telegram_notify_recipients tr WHERE tr.id = campaign_telegram_recipients.recipient_id AND tr.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_telegram_recipients.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM telegram_notify_recipients tr WHERE tr.id = campaign_telegram_recipients.recipient_id AND tr.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "lead_imports_user_isolation" ON lead_imports;
CREATE POLICY "lead_imports_user_isolation" ON lead_imports FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "leads_user_isolation" ON leads;
CREATE POLICY "leads_user_isolation" ON leads FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "campaign_leads_user_isolation" ON campaign_leads;
CREATE POLICY "campaign_leads_user_isolation" ON campaign_leads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_leads.campaign_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_leads.campaign_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "sends_user_isolation" ON sends;
CREATE POLICY "sends_user_isolation" ON sends FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id WHERE cl.id = sends.campaign_lead_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "replies_user_isolation" ON replies;
CREATE POLICY "replies_user_isolation" ON replies FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id WHERE cl.id = replies.campaign_lead_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "thread_messages_user_isolation" ON thread_messages;
CREATE POLICY "thread_messages_user_isolation" ON thread_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id WHERE cl.id = thread_messages.campaign_lead_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "gemini_api_keys_user_isolation" ON gemini_api_keys;
CREATE POLICY "gemini_api_keys_user_isolation" ON gemini_api_keys FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "telegram_notify_recipients_user_isolation" ON telegram_notify_recipients;
CREATE POLICY "telegram_notify_recipients_user_isolation" ON telegram_notify_recipients FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "api_keys_user_isolation" ON api_keys;
CREATE POLICY "api_keys_user_isolation" ON api_keys FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`,
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Step 22: Granular Inbox Sending Capabilities (00019)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Add granular sending capabilities to inboxes and campaign inboxes',
      sql: `
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS can_send_new_leads boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_send_follow_ups boolean NOT NULL DEFAULT true;

ALTER TABLE campaign_email_accounts
  ADD COLUMN IF NOT EXISTS can_send_new_leads boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_send_follow_ups boolean NOT NULL DEFAULT true;`,
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Step 23: CRM Pipeline Tables (00020)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Create CRM Pipeline tables (statuses, entries, history, logs, reminders, settings)',
      sql: `
CREATE TABLE IF NOT EXISTS crm_statuses (
  id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  icon text NOT NULL DEFAULT '📌',
  color text NOT NULL DEFAULT '#6366f1',
  sort_order integer NOT NULL DEFAULT 999,
  track text NOT NULL DEFAULT 'positive' CHECK (track IN ('positive', 'negative', 'neutral')),
  is_terminal boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  reminder_config jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS crm_pipeline_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  reply_id uuid NULL REFERENCES replies(id) ON DELETE SET NULL,
  campaign_id uuid NULL REFERENCES campaigns(id) ON DELETE SET NULL,
  status_id text NOT NULL,
  meeting_at timestamptz NULL,
  notes text NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NULL,
  closed_at timestamptz NULL,
  last_sent_at timestamptz NULL,
  last_sent_inbox_id uuid NULL REFERENCES email_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lead_id)
);

CREATE INDEX IF NOT EXISTS crm_pipeline_entries_user_status_idx ON crm_pipeline_entries (user_id, status_id);
CREATE INDEX IF NOT EXISTS crm_pipeline_entries_user_closed_idx ON crm_pipeline_entries (user_id, closed_at) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES crm_pipeline_entries(id) ON DELETE CASCADE,
  from_status text NULL,
  to_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS crm_status_history_entry_idx ON crm_status_history (entry_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS crm_status_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES crm_pipeline_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_activity_log_entry_idx ON crm_status_activity_log (entry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES crm_pipeline_entries(id) ON DELETE CASCADE,
  recipient_id uuid NULL REFERENCES telegram_notify_recipients(id) ON DELETE SET NULL,
  reminder_type text NOT NULL CHECK (reminder_type IN ('no_response', 'meeting', 'follow_up', 'custom')),
  fire_at timestamptz NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fired', 'snoozed', 'dismissed')),
  fired_at timestamptz NULL,
  snoozed_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_reminders ADD COLUMN IF NOT EXISTS recipient_id uuid NULL REFERENCES telegram_notify_recipients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_reminders_pending_fire_at_idx ON crm_reminders (fire_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS crm_reminders_entry_idx ON crm_reminders (entry_id, status);
CREATE INDEX IF NOT EXISTS crm_reminders_recipient_idx ON crm_reminders (recipient_id);

CREATE TABLE IF NOT EXISTS crm_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  no_response_delay_hours integer NOT NULL DEFAULT 24,
  meeting_reminder_offset_h integer NOT NULL DEFAULT -1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);`,
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Step 24: CRM Seed Default Statuses & Settings (00020)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Seed default CRM statuses and per-user settings',
      sql: `
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    INSERT INTO crm_statuses (id, user_id, display_name, icon, color, sort_order, track, is_terminal, is_system, reminder_config) VALUES
      ('new_interested',           u.id, 'New — Interested',           '🎯', '#22c55e',  10, 'positive', false, true, '{"type":"delay","hours":24}'::jsonb),
      ('interested_follow_up_1',   u.id, 'Follow-up 1 (Interested)',   '🔁', '#84cc16',  20, 'positive', false, true, null),
      ('interested_follow_up_2',   u.id, 'Follow-up 2 (Interested)',   '🔁', '#84cc16',  30, 'positive', false, true, null),
      ('interested_closure_sent',  u.id, 'Closure Sent (Interested)',  '📮', '#facc15',  40, 'positive', false, true, null),
      ('meeting_booked',           u.id, 'Meeting Booked',             '📅', '#3b82f6',  50, 'positive', false, true, '{"type":"meeting_offset","hours":-1}'::jsonb),
      ('no_show',                  u.id, 'No Show',                    '👻', '#f97316',  60, 'positive', false, true, null),
      ('no_show_follow_up_1',      u.id, 'Follow-up 1 (No Show)',      '🔁', '#fb923c',  70, 'positive', false, true, null),
      ('no_show_follow_up_2',      u.id, 'Follow-up 2 (No Show)',      '🔁', '#fb923c',  80, 'positive', false, true, null),
      ('no_show_closure_sent',     u.id, 'Closure Sent (No Show)',     '📮', '#facc15',  90, 'positive', false, true, null),
      ('proposal_sent',            u.id, 'Proposal Sent',              '📄', '#8b5cf6', 100, 'positive', false, true, null),
      ('proposal_follow_up_1',     u.id, 'Follow-up 1 (Proposal)',     '🔁', '#a78bfa', 110, 'positive', false, true, null),
      ('proposal_follow_up_2',     u.id, 'Follow-up 2 (Proposal)',     '🔁', '#a78bfa', 120, 'positive', false, true, null),
      ('proposal_closure_sent',    u.id, 'Closure Sent (Proposal)',    '📮', '#facc15', 130, 'positive', false, true, null),
      ('closed_won',               u.id, 'Closed — Won',               '🏆', '#fbbf24', 140, 'positive', true,  true, null),
      ('not_interested_replied',   u.id, 'Not Interested',             '🛑', '#ef4444', 200, 'negative', false, true, null),
      ('needs_review',             u.id, 'Needs Review',               '❓', '#6b7280', 210, 'neutral',  false, true, null),
      ('ghosted',                  u.id, 'Ghosted',                    '👤', '#6b7280', 220, 'negative', false, true, null),
      ('closed_lost',              u.id, 'Closed — Lost',              '❌', '#dc2626', 230, 'negative', true,  true, null)
    ON CONFLICT (id, user_id) DO NOTHING;

    INSERT INTO crm_settings (user_id)
    VALUES (u.id)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;`,
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Step 25: CRM Cron Job — reminder dispatcher (00020)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Schedule crm-reminder-dispatcher cron job (every 5 minutes)',
      sql: `
SELECT cron.unschedule('crm-reminder-dispatcher')
  FROM cron.job
  WHERE jobname = 'crm-reminder-dispatcher';

SELECT cron.schedule(
  'crm-reminder-dispatcher',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM cron_config.settings WHERE key = 'supabase_url') || '/functions/v1/crm-reminder-dispatcher',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM cron_config.settings WHERE key = 'anon_key'),
      'x-cron-secret', (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);`,
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Step 26: CRM Multi-User RLS Policies (00021)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Configure Row Level Security policies on CRM tables',
      sql: `
ALTER TABLE crm_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_status_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_statuses_user_isolation" ON crm_statuses;
CREATE POLICY "crm_statuses_user_isolation" ON crm_statuses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_pipeline_entries_user_isolation" ON crm_pipeline_entries;
CREATE POLICY "crm_pipeline_entries_user_isolation" ON crm_pipeline_entries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_status_history_user_isolation" ON crm_status_history;
CREATE POLICY "crm_status_history_user_isolation" ON crm_status_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM crm_pipeline_entries pe WHERE pe.id = crm_status_history.entry_id AND pe.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM crm_pipeline_entries pe WHERE pe.id = crm_status_history.entry_id AND pe.user_id = auth.uid()));

DROP POLICY IF EXISTS "crm_status_activity_log_user_isolation" ON crm_status_activity_log;
CREATE POLICY "crm_status_activity_log_user_isolation" ON crm_status_activity_log FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_reminders_user_isolation" ON crm_reminders;
CREATE POLICY "crm_reminders_user_isolation" ON crm_reminders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_settings_user_isolation" ON crm_settings;
CREATE POLICY "crm_settings_user_isolation" ON crm_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`,
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Step 27: Backfill Replied Leads into CRM (00021)
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: 'Backfill leads with non-bounce replies into CRM (needs_review)',
      sql: `
DO $$
BEGIN
  WITH replied_leads AS (
    SELECT DISTINCT ON (c.user_id, cl.lead_id)
      c.user_id,
      cl.lead_id,
      r.id AS reply_id,
      cl.campaign_id,
      'needs_review'::text AS status_id,
      r.received_at AS entered_at,
      r.received_at AS status_changed_at
    FROM replies r
    JOIN campaign_leads cl ON cl.id = r.campaign_lead_id
    JOIN campaigns c ON c.id = cl.campaign_id
    WHERE r.classification != 'bounce'
    ORDER BY c.user_id, cl.lead_id, r.received_at ASC
  ),
  inserted_entries AS (
    INSERT INTO crm_pipeline_entries (
      user_id,
      lead_id,
      reply_id,
      campaign_id,
      status_id,
      entered_at,
      status_changed_at
    )
    SELECT
      user_id,
      lead_id,
      reply_id,
      campaign_id,
      status_id,
      entered_at,
      status_changed_at
    FROM replied_leads
    ON CONFLICT (user_id, lead_id) DO NOTHING
    RETURNING id, user_id, status_id, entered_at
  ),
  ins_history AS (
    INSERT INTO crm_status_history (
      entry_id,
      from_status,
      to_status,
      changed_at,
      changed_by
    )
    SELECT
      id,
      NULL,
      status_id,
      entered_at,
      NULL
    FROM inserted_entries
  )
  INSERT INTO crm_status_activity_log (
    entry_id,
    user_id,
    note,
    source,
    created_at
  )
  SELECT
    id,
    user_id,
    'Lead backfilled into CRM — pending manual review',
    'auto',
    entered_at
  FROM inserted_entries;
END $$;`,
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
  'crm_statuses',
  'crm_pipeline_entries',
  'crm_status_history',
  'crm_status_activity_log',
  'crm_reminders',
  'crm_settings',
] as const
