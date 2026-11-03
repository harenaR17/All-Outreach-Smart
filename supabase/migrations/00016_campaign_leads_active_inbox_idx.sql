-- Migration 00016: Composite index for active follow-up queue lookups by assigned inbox
-- Speeds up follow-up queue selection when filtering due leads by active email_account_id

CREATE INDEX IF NOT EXISTS idx_campaign_leads_active_inbox
  ON campaign_leads (campaign_id, email_account_id, next_send_at)
  WHERE status = 'active';

