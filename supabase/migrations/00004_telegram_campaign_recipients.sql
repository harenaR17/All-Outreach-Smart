-- Migration 00004: Add bot_token to telegram_notify_recipients and create campaign_telegram_recipients join table

-- 1. Add bot_token column to telegram_notify_recipients
ALTER TABLE telegram_notify_recipients
ADD COLUMN IF NOT EXISTS bot_token TEXT NOT NULL DEFAULT '';

-- 2. Create campaign_telegram_recipients join table
CREATE TABLE IF NOT EXISTS campaign_telegram_recipients (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES telegram_notify_recipients(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, recipient_id)
);

-- Index for quick lookup by campaign_id
CREATE INDEX IF NOT EXISTS idx_campaign_telegram_recipients_campaign
ON campaign_telegram_recipients(campaign_id);

-- Index for quick lookup by recipient_id
CREATE INDEX IF NOT EXISTS idx_campaign_telegram_recipients_recipient
ON campaign_telegram_recipients(recipient_id);
