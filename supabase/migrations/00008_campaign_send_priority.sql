-- ============================================================================
-- Add send_priority column to campaigns table.
-- Allows users to prioritize either 'new_leads' (first contact) or 'follow_ups'.
-- ============================================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS send_priority text NOT NULL DEFAULT 'new_leads'
    CHECK (send_priority IN ('new_leads', 'follow_ups'));

COMMENT ON COLUMN campaigns.send_priority IS
  'Prioritizes either new leads (Step 1 first touches) or follow-ups (Steps 2+) during sender cron runs.';
