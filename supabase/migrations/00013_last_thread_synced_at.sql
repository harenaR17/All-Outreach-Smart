-- ============================================================================
-- Outreach Smart — Migration 00013: last_thread_synced_at on campaign_leads
-- ============================================================================
-- Tracks the timestamp of the last time a lead's Gmail thread was synced by
-- the thread-sync cron. Enables a Least-Recently-Synced Fair Queue
-- (round-robin) with batching to ensure continuous SmartBox thread sync
-- without edge function timeout risk.
-- ============================================================================

ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS last_thread_synced_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_thread_sync
  ON campaign_leads (last_thread_synced_at NULLS FIRST);

COMMENT ON COLUMN campaign_leads.last_thread_synced_at IS
  'Timestamp of the last thread-sync poll for this thread. Used for round-robin queue rotation.';
