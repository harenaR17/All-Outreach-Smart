-- ============================================================================
-- Outreach Smart — Migration 00012: last_reply_checked_at on campaign_leads
-- ============================================================================
-- Tracks the timestamp of the last time a lead's Gmail thread was checked by
-- the reply-checker cron. Enables a Least-Recently-Checked Fair Queue
-- (round-robin) with batching to ensure continuous coverage across hundreds
-- or thousands of leads without edge function timeout risk.
-- ============================================================================

ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS last_reply_checked_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_reply_check
  ON campaign_leads (last_reply_checked_at NULLS FIRST);

COMMENT ON COLUMN campaign_leads.last_reply_checked_at IS
  'Timestamp of the last reply-checker poll for this thread. Used for round-robin queue rotation.';
