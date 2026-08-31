-- ============================================================================
-- Add sender profile fields to email_accounts for dynamic inbox variables.
--
-- All columns are nullable / have defaults so existing rows are unaffected.
-- No new FK relationships are introduced.
-- ============================================================================

ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS first_name    text,
  ADD COLUMN IF NOT EXISTS last_name     text,
  ADD COLUMN IF NOT EXISTS role          text,
  ADD COLUMN IF NOT EXISTS phone_number  text,
  ADD COLUMN IF NOT EXISTS signature     text,
  ADD COLUMN IF NOT EXISTS variables     jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN email_accounts.first_name IS
  'Sender first name. Resolves {{sender_first_name}} / {{sending_account_first_name}}. '
  'Falls back to first word of display_name if null.';

COMMENT ON COLUMN email_accounts.last_name IS
  'Sender last name. Resolves {{sender_last_name}}. '
  'Falls back to remaining words of display_name if null.';

COMMENT ON COLUMN email_accounts.role IS
  'Sender job title / role. Resolves {{sender_role}}.';

COMMENT ON COLUMN email_accounts.phone_number IS
  'Sender phone number. Resolves {{sender_phone}} and {{phone_number}}.';

COMMENT ON COLUMN email_accounts.signature IS
  'Multi-line plain-text email sign-off. Resolves {{sender_signature}}, '
  '{{account_signature}}, and {{signature}}.';

COMMENT ON COLUMN email_accounts.variables IS
  'Arbitrary custom sender key-value pairs stored as JSONB. '
  'Keys are used directly as template tokens, e.g. {"booking_link": "https://cal.com/paul"}.';
