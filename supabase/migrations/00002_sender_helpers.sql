-- ============================================================================
-- Outreach Smart — Migration 00002: Sender helpers
-- ============================================================================

-- campaign_sends_today: counts only sends made via our campaigns per inbox
-- since the start of the current UTC day.
-- Used by eligibility checks in the sender edge function.
-- NOTE: This intentionally EXCLUDES warmup emails — it only counts rows in
--       the `sends` table which is written exclusively by this system.
CREATE OR REPLACE VIEW campaign_sends_today AS
SELECT
  email_account_id,
  COUNT(*)::integer AS sends_today
FROM sends
WHERE
  status = 'sent'
  AND sent_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
GROUP BY email_account_id;

COMMENT ON VIEW campaign_sends_today IS
  'Per-inbox send count since UTC midnight, campaign-traffic only. '
  'Warmup emails handled outside Outreach Smart are never included.';
