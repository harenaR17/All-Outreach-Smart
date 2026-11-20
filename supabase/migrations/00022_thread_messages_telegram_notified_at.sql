-- ============================================================================
-- Migration 00022: thread_messages.telegram_notified_at
-- ============================================================================
-- Adds telegram_notified_at timestamp column to thread_messages to track
-- whether a Telegram alert was sent for an inbound message in an ongoing
-- conversation. This decouples message caching (SmartBox persistence) from
-- notification state and eliminates race conditions between thread-sync and
-- reply-checker.

ALTER TABLE thread_messages
  ADD COLUMN IF NOT EXISTS telegram_notified_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_thread_messages_notified
  ON thread_messages (campaign_lead_id, telegram_notified_at);

COMMENT ON COLUMN thread_messages.telegram_notified_at IS
  'Timestamp when this inbound conversation message was alerted to Telegram recipients. NULL indicates the message has not yet been notified.';
