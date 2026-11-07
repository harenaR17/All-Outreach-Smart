-- ============================================================================
-- Migration 00017: Multi-User Database Isolation & Multi-Tenancy
-- Assigns existing data to current admin, enforces user_id on tenant tables,
-- replaces global email constraint with (user_id, lower(email)),
-- and enables Row Level Security (RLS) across all tenant tables.
-- ============================================================================

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- 1. Identify the existing primary admin account
  SELECT id INTO v_admin_id FROM auth.users ORDER BY created_at ASC LIMIT 1;

  -- 2. email_accounts
  ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE email_accounts SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
  ALTER TABLE email_accounts ALTER COLUMN user_id SET NOT NULL;

  -- 3. campaigns
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE campaigns SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
  ALTER TABLE campaigns ALTER COLUMN user_id SET NOT NULL;

  -- 4. lead_imports
  ALTER TABLE lead_imports ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE lead_imports SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
  ALTER TABLE lead_imports ALTER COLUMN user_id SET NOT NULL;

  -- 5. leads
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE leads SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
  ALTER TABLE leads ALTER COLUMN user_id SET NOT NULL;

  -- Drop global unique constraint on email and replace with composite (user_id, lower(email))
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_email_key;
  DROP INDEX IF EXISTS idx_leads_user_email;
  CREATE UNIQUE INDEX idx_leads_user_email ON leads (user_id, lower(email));

  -- 6. gemini_api_keys
  ALTER TABLE gemini_api_keys ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE gemini_api_keys SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
  ALTER TABLE gemini_api_keys ALTER COLUMN user_id SET NOT NULL;
  ALTER TABLE gemini_api_keys DROP CONSTRAINT IF EXISTS gemini_api_keys_api_key_key;
  DROP INDEX IF EXISTS idx_gemini_api_keys_user_key;
  CREATE UNIQUE INDEX idx_gemini_api_keys_user_key ON gemini_api_keys (user_id, api_key);

  -- 7. telegram_notify_recipients
  ALTER TABLE telegram_notify_recipients ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE telegram_notify_recipients SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
  ALTER TABLE telegram_notify_recipients ALTER COLUMN user_id SET NOT NULL;
  ALTER TABLE telegram_notify_recipients DROP CONSTRAINT IF EXISTS telegram_notify_recipients_chat_id_key;
  DROP INDEX IF EXISTS idx_telegram_recipients_user_chat;
  CREATE UNIQUE INDEX idx_telegram_recipients_user_chat ON telegram_notify_recipients (user_id, chat_id);

  -- 8. api_keys (Inbound Leads API)
  ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  IF v_admin_id IS NOT NULL THEN
    UPDATE api_keys SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
  ALTER TABLE api_keys ALTER COLUMN user_id SET NOT NULL;
END $$;

-- Performance indexes for tenant lookups
CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_imports_user ON lead_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_gemini_api_keys_user ON gemini_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_recipients_user ON telegram_notify_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- ============================================================================
-- Row Level Security (RLS) Configuration
-- Service Role automatically bypasses RLS for edge functions and cron workers.
-- Authenticated users are strictly restricted to their own data.
-- ============================================================================

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

-- 1. email_accounts
DROP POLICY IF EXISTS "email_accounts_user_isolation" ON email_accounts;
CREATE POLICY "email_accounts_user_isolation" ON email_accounts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. campaigns
DROP POLICY IF EXISTS "campaigns_user_isolation" ON campaigns;
CREATE POLICY "campaigns_user_isolation" ON campaigns
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. campaign_steps
DROP POLICY IF EXISTS "campaign_steps_user_isolation" ON campaign_steps;
CREATE POLICY "campaign_steps_user_isolation" ON campaign_steps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_steps.campaign_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_steps.campaign_id AND c.user_id = auth.uid()));

-- 4. campaign_email_accounts
DROP POLICY IF EXISTS "campaign_email_accounts_user_isolation" ON campaign_email_accounts;
CREATE POLICY "campaign_email_accounts_user_isolation" ON campaign_email_accounts
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_email_accounts.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = campaign_email_accounts.email_account_id AND ea.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_email_accounts.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = campaign_email_accounts.email_account_id AND ea.user_id = auth.uid())
  );

-- 5. campaign_telegram_recipients
DROP POLICY IF EXISTS "campaign_telegram_recipients_user_isolation" ON campaign_telegram_recipients;
CREATE POLICY "campaign_telegram_recipients_user_isolation" ON campaign_telegram_recipients
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_telegram_recipients.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM telegram_notify_recipients tr WHERE tr.id = campaign_telegram_recipients.recipient_id AND tr.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_telegram_recipients.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM telegram_notify_recipients tr WHERE tr.id = campaign_telegram_recipients.recipient_id AND tr.user_id = auth.uid())
  );

-- 6. lead_imports
DROP POLICY IF EXISTS "lead_imports_user_isolation" ON lead_imports;
CREATE POLICY "lead_imports_user_isolation" ON lead_imports
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. leads
DROP POLICY IF EXISTS "leads_user_isolation" ON leads;
CREATE POLICY "leads_user_isolation" ON leads
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. campaign_leads
DROP POLICY IF EXISTS "campaign_leads_user_isolation" ON campaign_leads;
CREATE POLICY "campaign_leads_user_isolation" ON campaign_leads
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_leads.campaign_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_leads.campaign_id AND c.user_id = auth.uid()));

-- 9. sends
DROP POLICY IF EXISTS "sends_user_isolation" ON sends;
CREATE POLICY "sends_user_isolation" ON sends
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM campaign_leads cl
    JOIN campaigns c ON c.id = cl.campaign_id
    WHERE cl.id = sends.campaign_lead_id AND c.user_id = auth.uid()
  ));

-- 10. replies
DROP POLICY IF EXISTS "replies_user_isolation" ON replies;
CREATE POLICY "replies_user_isolation" ON replies
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM campaign_leads cl
    JOIN campaigns c ON c.id = cl.campaign_id
    WHERE cl.id = replies.campaign_lead_id AND c.user_id = auth.uid()
  ));

-- 11. thread_messages
DROP POLICY IF EXISTS "thread_messages_user_isolation" ON thread_messages;
CREATE POLICY "thread_messages_user_isolation" ON thread_messages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM campaign_leads cl
    JOIN campaigns c ON c.id = cl.campaign_id
    WHERE cl.id = thread_messages.campaign_lead_id AND c.user_id = auth.uid()
  ));

-- 12. gemini_api_keys
DROP POLICY IF EXISTS "gemini_api_keys_user_isolation" ON gemini_api_keys;
CREATE POLICY "gemini_api_keys_user_isolation" ON gemini_api_keys
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 13. telegram_notify_recipients
DROP POLICY IF EXISTS "telegram_notify_recipients_user_isolation" ON telegram_notify_recipients;
CREATE POLICY "telegram_notify_recipients_user_isolation" ON telegram_notify_recipients
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 14. api_keys
DROP POLICY IF EXISTS "api_keys_user_isolation" ON api_keys;
CREATE POLICY "api_keys_user_isolation" ON api_keys
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

