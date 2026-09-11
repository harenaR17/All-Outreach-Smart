-- ----------------------------------------------------------------------------
-- 00014_daily_send_count.sql
--
-- Adds a daily_send_count column to email_accounts so the sender can check
-- inbox capacity with a simple integer comparison instead of a sends JOIN.
-- A pg_cron job resets the counter to 0 every day at UTC midnight.
-- ----------------------------------------------------------------------------

-- 1. Add the column (idempotent)
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS daily_send_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN email_accounts.daily_send_count IS
  'Rolling count of sends made today (UTC). Incremented atomically on each successful send. Reset to 0 by the reset-daily-send-counts cron every day at 00:00 UTC.';

-- 2. Initialise existing rows to 0 (safe no-op if column already existed)
UPDATE email_accounts SET daily_send_count = 0 WHERE daily_send_count IS NULL;

-- 3. Schedule the nightly reset at 00:00 UTC (idempotent via unschedule first)
SELECT cron.unschedule('reset-daily-send-counts')
  FROM cron.job
  WHERE jobname = 'reset-daily-send-counts';

SELECT cron.schedule(
  'reset-daily-send-counts',
  '0 0 * * *',   -- every day at 00:00 UTC
  $$UPDATE email_accounts SET daily_send_count = 0;$$
);
